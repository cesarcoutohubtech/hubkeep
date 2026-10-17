# HubKeep Europa — lock transacional Mews V1 (corrigido no PR #320)

**17/10/2026 · Fase 2 · estado: migração versionada na `main`; aplicação no Supabase-dev não verificada e NÃO autorizada nesta tarefa.**

## Incidente encontrado no PR #317

Com a migração 0054, o banco efêmero da CI passou nos testes pgTAP, mas o driver recebeu PostgreSQL `42501 permission denied for table mews_vinculo` ao executar `SELECT ... FOR UPDATE` como `hk_worker`. A concessão `SELECT` era insuficiente para o bloqueio de linha; RLS FORCE também exige autorização de `UPDATE` restrita.

**Não enfraquecer RLS, usar dono/service_role/BYPASSRLS ou alterar retroativamente a migração 0054.**

## Correção já implementada e aprovada pela CI

A **migração 0055** (`supabase/migrations/20261017230500_mews_worker_lock_v1.sql`) foi incorporada à `main` pelo **PR #320**:

1. Coluna técnica `lock_versao bigint NOT NULL DEFAULT 0` em `app.mews_vinculo`, sem ligação a identidade, credencial, operação ou revogação.
2. `GRANT UPDATE (lock_versao)` exclusivamente ao `hk_worker`; sem `UPDATE` concedido sobre `revogado_em`, `credencial_ref`, `enterprise_id`, `hotel_id` ou `validado_por`.
3. Policy `worker_lock` de `UPDATE` com `tenant_id = authz.tenant_sistema()` e `revogado_em IS NULL` em `USING` e `WITH CHECK`. RLS continua habilitada e forçada.
4. Teste pgTAP 058 com **17 verificações** de grants, bloqueio de linha, isolamento multi-tenant e recusa de vínculo revogado; aprovado no Postgres descartável. Tipo Kysely sincronizado.

O driver #317 foi sincronizado com a `main` após o merge da 0055. O workflow `banco` da primeira execução integrada passou: **352 testes `packages/db`**, **1.549 verificações pgTAP** e todos os demais testes daquele workflow. A formatação TypeScript foi posteriormente aplicada pelo Prettier 3.9.10, e resta validar novamente o HEAD definitivo antes de declarar tudo verde.

## Garantias, limites e trabalho pendente

- A ordem de acesso do driver é **vínculo primeiro, checkpoint depois**, na mesma unidade de trabalho. A revogação administrativa por `UPDATE revogado_em` disputa o lock no PostgreSQL; a integração não foi ativada.
- O teste do PR #317 comprova rejeição **após** revogação. Um teste de corrida controlada entre revogação administrativa e commit de lote fica como melhoria de cobertura, antes de ativar o conector.
- É obrigatória a validação externa de `Space`, `EnterpriseId` e propriedade do hotel **antes** de produzir qualquer lote real. O teste usa apenas fixtures sintéticas, não é autorização para ingerir dados de PMS.
- Faltam as decisões operacionais de revinculação, retenção/GDPR, referência opaca ao cofre e ativação. Nenhuma rota/cron/job para Mews é fornecida por #317.
- **Merge não é deploy:** não presumir aplicação da migração no `HubKeep-dev`; somente Cesar pode executar `supabase db push` após autorização específica e conferir `supabase migration list`.
- Não conectar credenciais reais Mews nem alterar UHs, OS ou status operacionais.

Referências: PRs #313 (0054), #315 (ADR-048), #316 (correção independente), #317 (driver) e #320 (0055); PostgreSQL `SELECT ... FOR UPDATE` e RLS.
