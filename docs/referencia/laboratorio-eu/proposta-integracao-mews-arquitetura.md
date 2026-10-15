# HubKeep EU — proposta de integração Mews no produto (sem implementação)

**Data**: 15/10/2026 · **Proponente**: frente EU / Hub Tech · **Status**: desenho sujeito a ADR do produto, sem autorização implícita para merge ou migração · **Coordenação**: #284 · **PoC**: #291 · **Auditoria**: #285.

## 1. Regra principal

O HubKeep já tem fonte própria de chamados e OS. **Não há razão para importar reservas, hóspedes nem lançar bloqueios no PMS para entregar o primeiro conector Mews.**

Prioridade funcional: **hotel / quartos / estado operacional de recurso / bloqueios lidos**. Nenhum dado Mews pode abrir OS, liberar UH, mudar status de licença ou manipular a disponibilidade do PMS sem uma decisão específica.

## 2. Aderência ao repositório

| Componente existente | Ponto de entrada futuro | Mudança proposta |
| --- | --- | --- |
| `packages/contratos/src/ingestao.ts` | `FONTES`, `ENTIDADES_EXTERNAS`, `LoteDeIngestao` | Acrescentar `mews` somente após ADR e testes de compatibilidade; preservar payloads e clientes TOTVS/planilha |
| `apps/web/src/app/api/v1/ingestao/lotes/route.ts` | Receptor de lotes | Reutilizar autenticação de agente, limites, tenant e idempotência; não compartilhar token Mews com cliente ou PWA |
| `packages/db/src/repositorios/staging.ts` | Registros externos | `fonte=mews`, com chave estável empresa/recurso; avaliar snapshots vs delta antes de persistir remoção |
| `packages/aplicacao/src/casos-de-uso/ingestao.ts` | Promoção hotel/UH | Importar apenas unidades mapeadas; nunca mapear todo `Space` como UH automaticamente |
| `packages/db/src/repositorios/promocao.ts` | `app.hotel` e `app.local` | `hotel.sistema_origem=mews` com `cod_externo=EnterpriseId`; `app.local.cod_externo=EnterpriseId|ResourceId`, se compatível com limites e regras existentes |
| `packages/contratos/src/locais.ts` | `app.local.status` | **Não alterar**: `ativo/pendente_licenca/inativo` representa cadastro/licença |
| `packages/contratos/src/uh-indisponivel.ts` | Períodos de manutenção | **Não alterar** automaticamente: `OutOfOrder` do PMS não é prova de indisponibilidade motivada por manutenção |
| `packages/i18n` | Catálogos de idioma | Alertas e rótulos do PMS entram nos catálogos; não incluir rótulos fixos em telas |
| `docs/referencia/plano-staging-treinamento.md` | Portão de staging do projeto BR | Não antecipar as decisões que Cesar adiou; célula UE e teste demo devem ser totalmente independentes |

## 3. Modelo de dados externo sugerido (para ADR, não criar schema agora)

- **Conexão**: `tenantId`, `hotelId`, `mewsEnterpriseId`, referência a segredo externo, ambiente (`demo|production`), status, horário da última sincronização concluída e do último erro. **Token nunca em texto claro em tabela, auditoria, log ou frontend.**
- **Recurso externo**: chave composta lógica `tenantId + mewsEnterpriseId + resourceId`, última versão `UpdatedUtc`, `State`, `IsActive`, tipo `Space|Object|Person`, classificação humana como `UH|área_comum|ignorado`.
- **Bloqueio externo**: chave `tenantId + mewsEnterpriseId + resourceBlockId`, recurso vinculado, tipo `OutOfOrder|InternalUse`, intervalo UTC, `IsActive`, `DeletedUtc`, `UpdatedUtc`.
- **Não copiar**: hóspede, reservas, pagamentos, contatos, nomes/descrições/notas livres ou localização detalhada sem finalidade aprovada.
- **Identidade e RLS**: uso da mesma arquitetura `withContext/withSistema` e RLS forçada, sem exceções por tenant, papel ou hotel.
- **Retenção**: definir política com jurídico antes de armazenar dado real da UE; expurgo/revogação auditável, backups e retenções explícitas.

## 4. Fluxo esperado

```text
Cliente HubKeep sem PMS ───────────────────────► todo módulo de manutenção continua funcionando

Configuração Mews por Admin do grupo
  └─ vincular tenant + EnterpriseId + hotel HubKeep (não pelo nome)
      └─ ler API Connector com token de servidor e limitar requisições
          └─ normalizar Space e ResourceBlock, omitir PII desnecessária
              └─ staging separado por tenant/origem/propriedade
                  ├─ hotéis e UHs só depois de mapeamento humano
                  └─ estado/bloqueio como projeção externa *separada* da licença/OS
                      └─ reconciliar periodicamente + invalidar via webhook
```

**Webhooks** entram após leitura por polling estar operacional: receptor autentica e enfileira evento de ID; processamento assíncrono reconsulta a API e faz upsert; não confia no corpo como estado autoritativo. Validação de assinatura/segredo deve ser feita contra a documentação real da Mews, sem presumir HMAC ausente.

## 5. Riscos e gatilhos de rollback

| Risco | Controle |
| --- | --- |
| Importar quarto 101 de um hotel no hotel 101 de outro | ID composto `EnterpriseId|ResourceId` + vínculo do tenant validado |
| Reprocessamento de evento antigo | `UpdatedUtc` + versão confirmada + reconciliação após falhas |
| Webhook perdido/desordenado | Reconsulta incremental ou varredura controlada conforme janela da API |
| `OutOfOrder` contado como UH-dia de manutenção | Tipos distintos e teste de não interferência no domínio |
| Space ser sala de eventos | Categorias e confirmação humana antes de criar UH |
| Invasão/leak de token | Secret manager, rotação, conta por tenant, revisão de logs e rate limits |
| Taxa/latência alta para vários hotéis | Fila e rate limit por `AccessToken`, alertas de desatualização |
| Regressão no produto BR | PRs mínimos, testes da ingestão/tenant, `pnpm lint && pnpm typecheck && pnpm test`, pgTAP antes de merge |

## 6. Critérios de passagem

1. **PoC local (concluído)**: 25 testes sintéticos, sem acesso a produção, chamada real ainda pendente.
2. **Demo HTTP real (pendente)**: obter sucesso de **POST** `enterprises/getAll`; uma única página, autenticação e esquema validado. GET no site não prova isso.
3. **Demo de leitura completa (pendente)**: uma página de recursos e uma de bloqueios, com IDs vinculados a uma propriedade demo, sem dados reais.
4. **ADR/mapeamento aprovado (pendente)**: revisão por responsável do núcleo e Cesar sobre os arquivos de contrato e eventuais novas tabelas.
5. **PR integrado separado (pendente)**: testes de RLS, idempotência, isolamento, CI, contagem de UHs/licença e não regressão TOTVS.
6. **Certificação comercial (pendente)**: só após PoC real e decisão de iniciar a parceria em nome da Hub Tech.

## Fontes oficiais verificadas

- https://docs.mews.com/connector-api/guidelines/environments
- https://docs.mews.com/connector-api/operations/enterprises
- https://docs.mews.com/connector-api/operations/resources
- https://docs.mews.com/connector-api/operations/resourceblocks
- https://docs.mews.com/connector-api/guidelines/pagination
- https://docs.mews.com/connector-api/events/wh-general
