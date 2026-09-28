-- ============================================================================
-- HubKeep — Migração 0014: categorias de ativo (fase 1a, B2; ADR-028)
-- ----------------------------------------------------------------------------
-- A categoria do ativo define os campos estendidos (chave, tipo, obrigatório,
-- rótulos em quatro idiomas). Tudo o que é regra fica no domínio
-- (packages/dominio, campos-tipados.ts): formato das definições, valores e o
-- que muda sem quebrar ativo já cadastrado. O banco guarda estrutura:
--   - nomes jsonb (parcial por idioma) e chave_padrao, quando a categoria é uma
--     das padrão do catálogo (ADR-027: nome do tenant no idioma → nome do
--     catálogo → nome no idioma padrão do tenant);
--   - campos jsonb (lista de definições), validado pela aplicação;
--   - ativa (desativação lógica, sem DELETE).
-- Lê: o Admin e quem tem papel vigente num hotel, inclusive o proprietário
-- (ele vê a categoria dos ativos das UHs dele, B3). Grava: só o Admin do grupo.
-- Só estrutura e autorização: nenhuma função, trigger ou regra de negócio.
-- ============================================================================

create table app.categoria_ativo (
  id            uuid primary key,
  tenant_id     uuid not null references app.tenant (id),
  chave_padrao  text,
  nomes         jsonb not null default '{}',
  campos        jsonb not null default '[]',
  ativa         boolean not null default true,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (tenant_id, id),
  constraint categoria_chave_padrao_formato check (chave_padrao ~ '^[a-z][a-z_]{1,39}$'),
  constraint categoria_nomes_objeto check (jsonb_typeof(nomes) = 'object'),
  constraint categoria_campos_lista check (jsonb_typeof(campos) = 'array')
);
-- Cada categoria padrão entra uma vez por tenant.
create unique index categoria_ativo_padrao_unica on app.categoria_ativo (tenant_id, chave_padrao)
  where chave_padrao is not null;

alter table app.categoria_ativo enable row level security;
alter table app.categoria_ativo force row level security;

grant select, insert on app.categoria_ativo to hk_app;
grant update (nomes, campos, ativa, atualizado_em) on app.categoria_ativo to hk_app;
grant select on app.categoria_ativo to hk_worker;

create policy app_select on app.categoria_ativo for select to hk_app
  using (
    tenant_id = (select authz.tenant_id())
    and ((select authz.eh_admin_grupo())
         or exists (select 1 from authz.hoteis_leitura())
         or exists (select 1 from authz.locais_proprietario())
         or exists (select 1 from authz.hoteis_proprietario()))
  );
create policy app_insert on app.categoria_ativo for insert to hk_app
  with check (tenant_id = (select authz.tenant_id()) and (select authz.eh_admin_grupo()));
create policy app_update on app.categoria_ativo for update to hk_app
  using (tenant_id = (select authz.tenant_id()) and (select authz.eh_admin_grupo()))
  with check (tenant_id = (select authz.tenant_id()));
create policy worker_select on app.categoria_ativo for select to hk_worker
  using (tenant_id = (select authz.tenant_sistema()));
