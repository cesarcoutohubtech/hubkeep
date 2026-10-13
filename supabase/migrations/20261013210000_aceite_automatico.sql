-- ============================================================================
-- HubKeep — Migração 0046: aceite automático da OS concluída pelo worker
-- (fase 1c, M5; ADR-044)
-- ----------------------------------------------------------------------------
-- Desenho aprovado pelo Cesar em 13/10/2026, no chat do agente da 1c ("Aprovo
-- o M5 conforme recomendado"; docs/diario-fase-1c.md). O job do
-- os.aceite_automatico roda no cron do SLA, com o hk_worker, um tenant por
-- transação. Quando aceitar (a política, os dias desde a última conclusão e
-- as exceções) é regra do domínio; o banco dá ao worker só o escopo de
-- escrita que o aceite precisa:
--   - UPDATE de coluna no estado, na situação, na versão e no atualizado_em
--     da OS e do chamado, no tenant do job. A policy não confere o estado: a
--     transição é do domínio (regra 2), e a versão conferida no UPDATE
--     (ADR-029) evita sobrescrever quem mexeu ao mesmo tempo. Isso muda o M2
--     do ADR-043 ("o worker não ganha UPDATE no chamado"), que valia para o
--     monitor;
--   - INSERT em app.os_transicao, sem usuário: o aceite automático não tem
--     autor. O usuario_id passa a aceitar nulo, e o check amarra o nulo à
--     ação aceitar_automatico e só a ela. O hk_app segue gravando só com o
--     usuário do contexto (app_insert), então não grava essa ação;
--   - a auditoria (usuario_id nulo para job) e o outbox o worker já gravava.
-- Campos de escopo seguem sem UPDATE (meta-teste 18); a transição segue só
-- de inserção (meta-teste 32). Sem DELETE; nenhuma função e nenhuma trigger;
-- as policies leem só funções authz (meta-teste 27).
-- ============================================================================

alter table app.os_transicao alter column usuario_id drop not null;
alter table app.os_transicao
  add constraint os_transicao_sem_autor_so_no_aceite_automatico
  check ((usuario_id is null) = (acao = 'aceitar_automatico'));

grant update (estado, situacao_id, versao, atualizado_em) on app.os to hk_worker;
grant update (estado, situacao_id, versao, atualizado_em) on app.chamado to hk_worker;
grant insert on app.os_transicao to hk_worker;

create policy worker_update on app.os for update to hk_worker
  using (tenant_id = (select authz.tenant_sistema()))
  with check (tenant_id = (select authz.tenant_sistema()));

create policy worker_update on app.chamado for update to hk_worker
  using (tenant_id = (select authz.tenant_sistema()))
  with check (tenant_id = (select authz.tenant_sistema()));

create policy worker_insert on app.os_transicao for insert to hk_worker
  with check (
    tenant_id = (select authz.tenant_sistema())
    and usuario_id is null
  );
