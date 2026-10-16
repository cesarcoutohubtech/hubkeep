# Proposta — persistência transacional Mews no HubKeep (NÃO executar)

**Situação:** desenho técnico para revisão, **não aprovado**. Não é ADR aprovada, não é migração, não é SQL para colar no Supabase.
**Escopo:** integração Mews de **leitura**, por `tenant_id + hotel_id + EnterpriseId`, sem criação de OS, alteração de estado de quarto, licença ou escrita no PMS.
**Base:** `ADR-CHECKPOINTS-DURAVEIS-PROPOSTA.md` e `checkpoint-contrato.mjs` já incorporados à `main` pelo PR #304; laboratório de replay/sweep no PR #305.

## Limites de segurança inegociáveis

- Respeitar `CLAUDE.md`, `docs/02-seguranca-multitenant-rls.md` e `docs/03-decisoes-tecnicas.md`. **Sem trigger e sem função nova no banco sem ADR aprovada.**
- Nada em `supabase/migrations`, `supabase/tests`, banco DEV compartilhado, produção ou CI será alterado nesta etapa.
- Não usar `service_role` para tabela de negócio. Futuro acesso via `packages/db`, `withSistema({ tenantId }, fn)`, role `hk_worker`, contexto local à transação e RLS FORCED.
- Proteger permissão de hotel e vínculo revogado. Identificador enviado por cliente/operador não substitui vínculo autorizado validado no servidor.
- Não gravar tokens, `Notes`, hóspedes, payload bruto, corpos de erro nem informação pessoal nos registros, snapshots ou logs.

## Proposta de entidades (sem DDL executável)

1. `app.mews_vinculo`: `tenant_id uuid`, `hotel_id uuid`, `enterprise_id text`, estado, credencial_ref opaca, validação e revogação. UNIQUE (`tenant_id, hotel_id, enterprise_id`); FK (`tenant_id, hotel_id`) para `app.hotel(tenant_id,id)`. Definir previamente quem pode conceder/revogar a autorização.
2. `app.mews_checkpoint`: mesma chave composta do vínculo, `versao bigint`, `ultimo_updated_utc timestamptz` e `ultimo_sweep_utc timestamptz` **independentes**, `digest_ultimo_lote`, conclusão e marca de erro sem PII.
3. `app.mews_recurso`: chave composta de tenant, hotel, EnterpriseId e resource_id, `local_id` opcional e validado, estado técnico e última atualização. A eventual FK de `local_id` precisa respeitar o mesmo hotel.
4. `app.mews_bloqueio`: chave composta de tenant, hotel, EnterpriseId e block_id; FK composta para `app.mews_recurso`; campos técnicos de tipo, início, fim, `UpdatedUtc` e tombstone.

**Cada tabela terá tenant_id NOT NULL, RLS ENABLE/FORCE, políticas explícitas por papel, FK composta, índices de consulta e testes pgTAP.** Nenhum `UPDATE` de colunas de escopo nem `DELETE` para papéis de aplicação. Endurecer grants e RLS antes de habilitar qualquer worker.

## Algoritmo de transação proposto (no driver de aplicação, não no banco)

1. Worker resolve `tenantId/hotelId/enterpriseId` a partir de vínculo autorizado e não revogado; consulta Mews **fora** da transação, com paginação completa e payload sanitizado.
2. `prepararLote` normaliza recursos/bloqueios para chaves segregadas, valida `UpdatedUtc`, filtro UTC e calcula digest determinístico. Dados incompletos/falha da Mews encerram a rodada sem avançar watermarks.
3. Iniciar `withSistema` de tenant. Em uma única transação bloquear o registro de checkpoint (`SELECT … FOR UPDATE`) e **revalidar** vínculo não revogado e escopo do hotel. Trabalhadores paralelos da mesma propriedade serializam na mesma linha.
4. Conferir versão CAS e watermark **do modo atual**. Repetição comprovadamente idêntica retorna `replay_idempotente`; versão divergente dá conflito e exige replanejar. Bootstrap de checkpoint deve bloquear também a linha de vínculo para impedir inserções concorrentes.
5. `UPSERT` técnico para cada recurso/bloqueio, com FK composta e condição de versão temporal. Tombstone vence atualização obsoleta; em empate temporal, tombstone **não pode** ser reativado. Ausência de registro em página incremental/sweep **nunca equivale a DELETE**.
6. Incremental avança apenas `ultimo_updated_utc`. Reconciliação futura avança apenas `ultimo_sweep_utc`. Ambos atualizam `versao`/digest atômica e condicionalmente; outro watermark fica inalterado.
7. `COMMIT` de itens e watermark juntos. Erro, timeout, mudança do vínculo ou CAS divergente provocam `ROLLBACK` integral. Não criar OS, alterar room status ou licença.
8. Logs/telemetria pós-commit somente com IDs técnicos autorizados, duração, contagens, etapa/código de falha e `request_id`, sem credenciais/PII.

## Testes/gates que bloqueiam ativação

- [ ] Aprovação escrita da ADR e escolha explícita dos dados exibidos no HubKeep.
- [ ] Rever desenho com responsáveis pelos módulos 1b/1c/Intelligence e a fila de migrações.
- [ ] Criar migração **nova** e testes pgTAP **em outro PR**, obedecendo zona protegida; não reescrever migração aplicada.
- [ ] Isolamento: tenant A não lê, cria ou atualiza tenant B; hotel A não usa vínculo/recurso de hotel B.
- [ ] Permissões: vínculo ausente/revogado falha antes de escrever; role `hk_app`/navegador não grava dados de integração.
- [ ] Consistência: dois workers simultâneos, queda entre páginas, rollback após upsert parcial, replay do mesmo digest, payload divergente, checkpoint regressivo, equal timestamp com tombstone, cursor repetido e mudança de permissão.
- [ ] Duas marcas temporais: sweep depois de incremental não pula deltas, e incremental não move a marca de sweep.
- [ ] Testar localmente na CI descartável; programar teste em DEV somente com backup/ponto de restauração, CI verde e autorização explícita; nunca `db push` automático.
- [ ] Revisar retenção/GDPR, cofre de segredos e limite de chamadas/paginação antes de piloto.

## Condição de saída

Só considerar "persistência durável aprovada" depois de migração/driver/testes em banco descartável, revisão de segurança, CI verde e confirmação humana dos gates. **Este documento não dá autorização para aplicar SQL ou conectar Mews real.**

## Consolidação do contrato (laboratório — PR #305)

O PR #304 permanece **fonte canônica** do armazenamento simulado: `checkpoint-contrato.mjs` expõe `prepararLote` e `criarRepositorioSimulado`. O laboratório `recuperacao-lab.mjs` agora fornece apenas uma **interface adaptadora sintética** e o orquestrador de janelas; ele não armazena dados em um segundo `Map` persistente.

- O contrato aceita `modo=incremental|reconciliacao`, `versaoEsperada` (CAS comum) e checkpoint esperado do modo. O registro conserva `checkpointUtc` (incremental) e `checkpointVarreduraUtc` (sweep) independentes, além de digests por modo.
- Eventos com `UpdatedUtc` idêntico preservam tombstone; ausência em página não exclui registro.
- No **teste sintético exclusivamente**, o adaptador deriva `resourceId` dos próprios bloqueios porque os fixtures não consultam recursos reais. Isso **não valida recurso autorizado**. O driver futuro deve consultar recursos Mews da propriedade, validar `Space` e vínculos reais antes de `prepararLote`, como no laboratório de normalização.
- Não há persistência durável, autenticação real, conexão Mews, processo agendado ou write no HubKeep. A integração final deverá remover o adaptador de dados sintéticos e ligar as portas da camada de aplicação ao driver validado.
- Nenhum mecanismo novo de criação de OS, mudança de status ou licenciamento é autorizado.

