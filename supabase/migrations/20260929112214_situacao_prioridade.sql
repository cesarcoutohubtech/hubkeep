-- ============================================================================
-- HubKeep — Migração 0020: situações e prioridades do tenant (fase 1a, C1; ADR-027)
-- ----------------------------------------------------------------------------
-- Os estados canônicos do chamado e da OS, as transições e quem faz cada uma
-- são regra do domínio (packages/dominio, corretiva.ts). O banco guarda o que
-- o tenant configura:
--   - app.situacao: nome em quatro idiomas, ordem e cor, ligada a um estado
--     canônico do chamado ou da OS. A entidade e o estado não mudam depois de
--     criada (sem GRANT de UPDATE): um registro que está na situação não pode
--     trocar de estado por baixo. O banco confere só o formato do estado; a
--     lista de estados é do domínio (situacoes.ts);
--   - app.prioridade: nome em quatro idiomas, ordem e peso (o peso fica para o
--     SLA da 1c).
-- As duas têm nomes jsonb parcial e chave_padrao, quando a linha é uma das
-- padrão do catálogo (ADR-027: nome do tenant no idioma → nome do catálogo →
-- nome no idioma padrão do tenant), e desativação lógica, sem DELETE.
-- Lê: o Admin e quem tem papel vigente num hotel, inclusive o proprietário
-- (ele vê a situação e a prioridade dos chamados da UH dele, C2). Grava: só o
-- Admin do grupo. O unique (tenant_id, id) serve às FKs compostas do chamado e
-- da OS (C2 e C3).
-- Só estrutura e autorização: nenhuma função, trigger ou regra de negócio.
-- ============================================================================

create table app.situacao (
  id            uuid primary key,
  tenant_id     uuid not null references app.tenant (id),
  entidade      text not null,
  estado        text not null,
  chave_padrao  text,
  nomes         jsonb not null default '{}',
  ordem         integer not null,
  cor           text not null,
  ativa         boolean not null default true,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (tenant_id, id),
  constraint situacao_entidade check (entidade in ('chamado', 'os')),
  constraint situacao_estado_formato check (estado ~ '^[a-z][a-z_]{1,39}$'),
  constraint situacao_chave_padrao_formato check (chave_padrao ~ '^[a-z][a-z_]{1,39}$'),
  constraint situacao_nomes_objeto check (jsonb_typeof(nomes) = 'object'),
  constraint situacao_ordem check (ordem between 1 and 999),
  constraint situacao_cor check (cor ~ '^#[0-9a-f]{6}$')
);
create unique index situacao_padrao_unica on app.situacao (tenant_id, chave_padrao)
  where chave_padrao is not null;

create table app.prioridade (
  id            uuid primary key,
  tenant_id     uuid not null references app.tenant (id),
  chave_padrao  text,
  nomes         jsonb not null default '{}',
  ordem         integer not null,
  peso          integer not null,
  ativa         boolean not null default true,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (tenant_id, id),
  constraint prioridade_chave_padrao_formato check (chave_padrao ~ '^[a-z][a-z_]{1,39}$'),
  constraint prioridade_nomes_objeto check (jsonb_typeof(nomes) = 'object'),
  constraint prioridade_ordem check (ordem between 1 and 999),
  constraint prioridade_peso check (peso between 1 and 1000)
);
create unique index prioridade_padrao_unica on app.prioridade (tenant_id, chave_padrao)
  where chave_padrao is not null;

alter table app.situacao enable row level security;
alter table app.situacao force row level security;
alter table app.prioridade enable row level security;
alter table app.prioridade force row level security;

grant select, insert on app.situacao, app.prioridade to hk_app;
grant update (nomes, ordem, cor, ativa, atualizado_em) on app.situacao to hk_app;
grant update (nomes, ordem, peso, ativa, atualizado_em) on app.prioridade to hk_app;
grant select on app.situacao, app.prioridade to hk_worker;

create policy app_select on app.situacao for select to hk_app
  using (
    tenant_id = (select authz.tenant_id())
    and ((select authz.eh_admin_grupo())
         or exists (select 1 from authz.hoteis_leitura())
         or exists (select 1 from authz.locais_proprietario())
         or exists (select 1 from authz.hoteis_proprietario()))
  );
create policy app_insert on app.situacao for insert to hk_app
  with check (tenant_id = (select authz.tenant_id()) and (select authz.eh_admin_grupo()));
create policy app_update on app.situacao for update to hk_app
  using (tenant_id = (select authz.tenant_id()) and (select authz.eh_admin_grupo()))
  with check (tenant_id = (select authz.tenant_id()));
create policy worker_select on app.situacao for select to hk_worker
  using (tenant_id = (select authz.tenant_sistema()));

create policy app_select on app.prioridade for select to hk_app
  using (
    tenant_id = (select authz.tenant_id())
    and ((select authz.eh_admin_grupo())
         or exists (select 1 from authz.hoteis_leitura())
         or exists (select 1 from authz.locais_proprietario())
         or exists (select 1 from authz.hoteis_proprietario()))
  );
create policy app_insert on app.prioridade for insert to hk_app
  with check (tenant_id = (select authz.tenant_id()) and (select authz.eh_admin_grupo()));
create policy app_update on app.prioridade for update to hk_app
  using (tenant_id = (select authz.tenant_id()) and (select authz.eh_admin_grupo()))
  with check (tenant_id = (select authz.tenant_id()));
create policy worker_select on app.prioridade for select to hk_worker
  using (tenant_id = (select authz.tenant_sistema()));
