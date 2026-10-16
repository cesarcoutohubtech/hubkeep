# ADR proposta — Checkpoints duráveis e isolamento da integração Mews

**Situação: proposta, não aprovada nem aplicada.**
**Referência:** HubKeep Europa issue #284; PoC Mews PRs #293, #302 e #303.
**Data:** 16/10/2026.
**Mudanças nesta branch:** apenas arquivos de laboratório, sem migração executável
nem chamada à API Mews, Supabase, banco de produção ou jobs.

## Por que precisamos evoluir

No Windows, as leituras reais `configuration/get`, `resources/getAll` e
`resourceBlocks/getAll` retornaram HTTP 200; a última trouxe 5 bloqueios
e cursor. A suíte original do cliente passou 34/34 testes e a prévia incremental
10/10. Porém, `sincronizacao-preview.mjs` guarda checkpoint/tombstones
**somente em memória**. Reinício do worker perde seu estado, e dois workers
concorrentes poderiam publicar resultados inconsistentes se compartilhassem banco.

## Separação de responsabilidades

- **Leitor Mews**: autenticação por propriedade, paginação completa por Cursor,
  filtros UTC limitados, 429/Retry-After, falha fechada e zero gravações no PMS.
- **Normalizador**: somente Space e bloqueios técnicos permitidos, sem `Notes`,
  dados de hóspedes ou inferência de quarto/UH/licença.
- **Plano de commit**: dados sanitizados de UM
  `tenantId + hotelId + EnterpriseId`, `checkpointEsperado`,
  `novoCheckpoint` e digest estável. Nenhum efeito externo.
- **Driver transacional futuro**: valida escopo RLS e aplica lote + checkpoint
  **na mesma transação**; falha/concorrência não publicam estado parcial.
- **Orquestrador**: agenda janelas, observa métricas de latência e estado de
  cada propriedade; não dispara OS nem room status automaticamente.

## Contrato simulado nesta proposta

`checkpoint-contrato.mjs` implementa
`prepararLote(...)` e `criarRepositorioSimulado()` como protótipos puros:
- Chaves externas são segregadas por EnterpriseId e validadas contra o hotel;
  payload é allowlisted e sem PII.
- Não existe exclusão implícita por falta de registro no delta;
  tombstone mais novo não pode ser reativado por evento atrasado.
- Compara checkpoint anterior com o esperado (**CAS**). Reapresentar exatamente
  um lote confirmado retorna `replay_idempotente`; conteúdo diferente no
  mesmo checkpoint falha fechado.
- Falha antes da publicação mantém os itens e checkpoint anteriores.
- É **simulação in-memory**, logo NÃO garante durabilidade entre processos.

A suíte de 12 casos em `checkpoint-contrato.test.mjs` testa essas propriedades.
A CI geral **não substitui** execução manual da suíte de laboratório.

## Modelo de tabelas proposto (não é migração SQL)

Todos os IDs de tenant e hotel devem corresponder aos já existentes em
`app.tenant` e `app.hotel`. Seguir padrão de FKs compostas e authz
existente do HubKeep; **não criar tabelas nem alterar RLS neste PR**.

| Entidade proposta | Chave/índice | Campos estritamente necessários |
|---|---|---|
| `app.mews_vinculo` | PK composta `(tenant_id, hotel_id, enterprise_id)`; UNIQUE por vínculo autorizado | `credencial_ref` opaca, `status`, `validado_por`, `validado_em`, `revogado_em` |
| `app.mews_checkpoint` | FK composta para vínculo, UNIQUE no trio de IDs | `ultimo_updated_utc`, `ultimo_sweep_utc`, `versao bigint`, `digest`, `concluido_em` |
| `app.mews_recurso` | PK `(tenant_id, hotel_id, enterprise_id, resource_id)` | `ativo`, `updated_utc`, `deleted_utc`, `local_id` opcional e validado |
| `app.mews_bloqueio` | PK `(tenant_id, hotel_id, enterprise_id, block_id)`; FK composta para recurso | `resource_id`, `tipo`, `inicio_utc`, `fim_utc`, `ativo`, `updated_utc`, `deleted_utc` |

**Não persistir:** token em claro, `Notes`, `Guest`, dados de hóspedes,
payload JSON bruto da Mews, logs de resposta ou qualquer dado pessoal não
necessário. Somente referência de segredo armazenado em cofre apropriado,
com rotação/revogação por hotel e logs sanitizados.

## Transação exigida para o futuro driver SQL

1. Resolver vínculo autenticado e autorizado para tenant e hotel; não aceitar
   IDs soltos da API do usuário como prova de escopo.
2. Em transação com tenant autenticado no contexto do worker, bloquear
   checkpoint por `SELECT ... FOR UPDATE` ou CAS de versão e verificar
   `revogado_em IS NULL`.
3. Validar `versao`/`ultimo_updated_utc` esperado. Se lote já confirmado
   com mesmo digest: replay idempotente. Se divergir: conflito e replanejamento.
4. Upsert **somente** registros técnico-permitidos, com chave composta;
   `WHERE incoming.updated_utc >= stored.updated_utc` impede reativar tombstone.
   Não realizar DELETE por ausência na página.
5. Avançar watermark correspondente + incrementar versão **na mesma transação**
   que os upserts; `COMMIT` só após sucesso completo. Falha = `ROLLBACK`.
6. Apenas depois confirmar métricas sem PII. Nunca encadear criação de OS,
   mudança de room status/licença ou notificações de hóspedes.

### Isolamento e privilégios a validar no Supabase DEV

- FKs compostas: `tenant_id + hotel_id` devem referenciar
  `app.hotel(tenant_id,id)`; recurso e bloqueio não podem apontar para outro
  hotel/tenant. Remoção de vínculo deve bloquear sync e seguir política de
  retenção, não apagar auditabilidade por padrão.
- RLS **FORCE** e políticas por `authz.tenant_id()` para Admin do grupo
  com acesso ao hotel; para `hk_worker`, usar o contexto
  `authz.tenant_sistema()` já adotado pelo projeto e garantir reset da
  sessão. Avaliar se conexões privilegiadas contornam RLS.
- Regras de gravação devem ser restritas a processo de integração habilitado,
  nunca ao cliente web/PWA; separar papéis de leitura/planejamento.
- Testes negativos: tenant A lendo/escrevendo dados do B, hotel A mapeando
  recurso do B, vínculo revogado, dois workers, token trocado, cursor quebrado,
  rollback e reinício entre páginas.

## Duas marcas temporais separadas

1. **Incremental**: consultar `UpdatedUtc` em janelas com sobreposição
   (ex.: 5 min), fatiando buracos maiores que 30 dias. Checkpoint deve ser
   medido a partir do tempo de conclusão seguro e nunca avançado após erro.
2. **Varredura de futuro**: consultar `CollidingUtc` periodicamente
   (ex.: diariamente), em janelas futuras de no máximo 30 dias, porque
   bloqueios antigos podem começar a colidir com o horizonte atual sem ter
   `UpdatedUtc` recente. Watermark da varredura é **independente** do
   watermark incremental.

Os valores são hipóteses de engenharia para piloto; frequência final
depende do volume de hotéis, rate limits e SLA.

## Gates antes de conectar o banco

- [ ] Aprovar o modelo de negócio: que dados Mews o HubKeep deve **mostrar**,
      e confirmar que não haverá mutações operacionais automáticas.
- [ ] Revisar com responsável pelos módulos Claude, sem alterar as migrações
      simultaneamente em desenvolvimento.
- [ ] Produzir migração SQL e testes pgTAP de isolamento em PR **separado**,
      com backup/ponto de restauração do DEV confirmado.
- [ ] Revisar cofre de segredos, ciclo de rotação e segregação por tenant/hotel.
- [ ] Validar transação, replay, rollback, conflitos entre workers e tombstones
      em DEV descartável; só então piloto read-only.
- [ ] Avaliar retenção/GDPR, rastreamento de auditoria e observabilidade sem PII.
- [ ] Exigir autorização explícita antes de executar migrações ou persistir
      qualquer dado real do Mews no Supabase.

## Comando de validação local

```powershell
node --test docs/referencia/laboratorio-eu/mews-poc/checkpoint-contrato.test.mjs
```

**12 testes novos**; continuam **44/44 aprovados** nas suítes anteriores,
conforme output do usuário. A soma de testes declarados após este PR será
**56**, mas **não afirmar 56/56 até a execução real**.
