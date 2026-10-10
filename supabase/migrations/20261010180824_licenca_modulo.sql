-- ============================================================================
-- HubKeep — Migração 0037: módulos contratados (fase 1b, I7)
-- ----------------------------------------------------------------------------
-- docs/12, I7; decisão 3 do Cesar de 06/10/2026 (relatório de lacunas): os
-- módulos contratados ficam em licenca.modulo (tenant, módulo e vigência),
-- gravados pelo backoffice e lidos pelo hk_app e pelo hk_worker no próprio
-- tenant. Até o backoffice existir, a gravação é por script de operação, com
-- o papel hk_backoffice. Adendo ao ADR-026 (docs/03, aguarda aprovação): a
-- montagem do servidor registra as políticas de um módulo só para o tenant
-- que tem o módulo vigente.
--
-- licenca.modulo, no modelo de licenca.contrato (0001):
--   - modulo: a lista mora no domínio (MODULOS_CONTRATAVEIS); o check repete
--     os valores, e tests/valores-canonicos-banco.test.ts falha se os dois
--     divergirem. Hoje só 'inteligencia';
--   - inicio e fim: a vigência. Fim nulo é sem prazo; o check só garante a
--     ordem. Se o módulo vale agora é regra do domínio, nunca do banco;
--   - uma linha por módulo no tenant: renovar ou encerrar é mudar a vigência,
--     com atualizado_em e atualizado_por, como no contrato.
-- Lê, pelo hk_app: o Admin do grupo e quem lê algum hotel, inclusive o
-- proprietário (o servidor lê a cada request, com o contexto de quem pede,
-- para decidir se registra as políticas do módulo). Implantador vencido e
-- quem não tem papel vigente não leem: para eles, o módulo não existe (falha
-- fechada). O worker lê no tenant do job.
-- Grava (INSERT e UPDATE da vigência): só o hk_backoffice, sem filtro de
-- tenant, como no contrato (exceção nomeada no meta-teste 19). O hk_app e o
-- hk_worker não gravam. Sem DELETE para ninguém.
-- Nenhuma policy desta tabela lê outra tabela do app além das funções de
-- autorização, então não há ciclo (meta-teste 27).
-- Só estrutura e autorização: nenhuma função, trigger ou regra de negócio.
-- ============================================================================

create table licenca.modulo (
  id             uuid primary key,
  tenant_id      uuid not null references app.tenant (id),
  modulo         text not null,
  inicio         timestamptz not null,
  fim            timestamptz,
  atualizado_em  timestamptz not null default now(),
  atualizado_por text not null,
  unique (tenant_id, id),
  -- Um registro por módulo no tenant.
  unique (tenant_id, modulo),
  constraint licenca_modulo_lista check (modulo in ('inteligencia')),
  constraint licenca_modulo_vigencia check (fim is null or fim > inicio),
  constraint licenca_modulo_atualizado_por check (length(btrim(atualizado_por)) between 1 and 200)
);

alter table licenca.modulo enable row level security;
alter table licenca.modulo force row level security;

grant select on licenca.modulo to hk_app;
grant select on licenca.modulo to hk_worker;
grant select, insert on licenca.modulo to hk_backoffice;
grant update (inicio, fim, atualizado_em, atualizado_por) on licenca.modulo to hk_backoffice;

create policy app_select on licenca.modulo for select to hk_app
  using (
    tenant_id = (select authz.tenant_id())
    and ((select authz.eh_admin_grupo())
         or exists (select 1 from authz.hoteis_leitura())
         or exists (select 1 from authz.locais_proprietario())
         or exists (select 1 from authz.hoteis_proprietario()))
  );
create policy worker_select on licenca.modulo for select to hk_worker
  using (tenant_id = (select authz.tenant_sistema()));
create policy backoffice_select on licenca.modulo for select to hk_backoffice using (true);
create policy backoffice_insert on licenca.modulo for insert to hk_backoffice with check (true);
create policy backoffice_update on licenca.modulo for update to hk_backoffice
  using (true) with check (true);
