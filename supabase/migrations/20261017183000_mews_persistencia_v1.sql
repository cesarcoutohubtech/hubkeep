-- ============================================================================
-- HubKeep — Migracao 0054: persistencia tecnica Mews V1 (EU; SOMENTE LEITURA)
-- ============================================================================
-- Aprovado escopo V1 pelo Cesar em conversa 17/10/2026. ADR de persistencia
-- permanece pendente de aprovacao formal e revisao dos responsaveis.
-- NAO executar no Supabase-dev nem producao sem autorizacao especifica.
-- Esta migracao cria somente estrutura, FKs e autorizacao. Sem triggers, jobs,
-- chamadas HTTP, criacao de OS, mutacao de room status ou licenca.
-- Os dados Mews sao allowlisted no aplicativo; NUNCA guardar hospedes,
-- Notes, credenciais reais, payload bruto ou informacoes pessoais.
--
-- Escreve vinculo somente Admin do grupo pelo hk_app via unit of work.
-- Worker hk_worker grava apenas checkpoint/recurso/bloqueio no tenant do job,
-- com vinculo ativo; verificacao do hotel/propriedade no servidor e transacao.
-- Um vinculo por hotel e uma EnterpriseId por tenant neste piloto.
-- ============================================================================

create table app.mews_vinculo (
  id            uuid primary key,
  tenant_id     uuid not null,
  hotel_id      uuid not null,
  enterprise_id text not null,
  credencial_ref text not null,
  validado_por  uuid not null,
  validado_em   timestamptz not null,
  revogado_em   timestamptz,
  criado_em     timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, hotel_id),
  unique (tenant_id, enterprise_id),
  unique (tenant_id, hotel_id, enterprise_id),
  foreign key (tenant_id, hotel_id) references app.hotel (tenant_id, id),
  foreign key (tenant_id, validado_por) references app.membro (tenant_id, usuario_id),
  constraint mews_vinculo_enterprise_preenchido check
    (length(btrim(enterprise_id)) between 1 and 200),
  constraint mews_vinculo_ref_preenchida check
    (length(btrim(credencial_ref)) between 1 and 250),
  constraint mews_vinculo_revogacao_check check
    (revogado_em is null or revogado_em >= validado_em)
);
create index mews_vinculo_ativos_idx on app.mews_vinculo (tenant_id, hotel_id)
  where revogado_em is null;

create table app.mews_checkpoint (
  tenant_id             uuid not null,
  hotel_id              uuid not null,
  enterprise_id         text not null,
  versao                bigint not null default 0,
  ultimo_updated_utc    timestamptz,
  ultimo_sweep_utc      timestamptz,
  digest_incremental    text,
  digest_sweep          text,
  concluido_em          timestamptz,
  primary key (tenant_id, hotel_id, enterprise_id),
  foreign key (tenant_id, hotel_id, enterprise_id)
    references app.mews_vinculo (tenant_id, hotel_id, enterprise_id),
  constraint mews_checkpoint_versao_check check (versao >= 0),
  constraint mews_checkpoint_digest_incremental_check check
    (digest_incremental is null or digest_incremental ~ '^[0-9a-f]{64}$'),
  constraint mews_checkpoint_digest_sweep_check check
    (digest_sweep is null or digest_sweep ~ '^[0-9a-f]{64}$')
);

create table app.mews_recurso (
  tenant_id        uuid not null,
  hotel_id         uuid not null,
  enterprise_id    text not null,
  resource_id      text not null,
  tipo             text not null default 'Space',
  ativo            boolean not null,
  updated_utc      timestamptz,
  deleted_utc      timestamptz,
  primary key (tenant_id, hotel_id, enterprise_id, resource_id),
  foreign key (tenant_id, hotel_id, enterprise_id)
    references app.mews_vinculo (tenant_id, hotel_id, enterprise_id),
  constraint mews_recurso_id_valido check (length(btrim(resource_id)) between 1 and 200),
  constraint mews_recurso_space_check check (tipo = 'Space')
);

create table app.mews_bloqueio (
  tenant_id        uuid not null,
  hotel_id         uuid not null,
  enterprise_id    text not null,
  block_id         text not null,
  resource_id      text not null,
  tipo             text not null,
  inicio_utc       timestamptz not null,
  fim_utc          timestamptz not null,
  ativo            boolean not null,
  updated_utc      timestamptz not null,
  deleted_utc      timestamptz,
  primary key (tenant_id, hotel_id, enterprise_id, block_id),
  foreign key (tenant_id, hotel_id, enterprise_id, resource_id)
    references app.mews_recurso (tenant_id, hotel_id, enterprise_id, resource_id),
  constraint mews_bloqueio_id_valido check (length(btrim(block_id)) between 1 and 200),
  constraint mews_bloqueio_tipo_check check (tipo in ('OutOfOrder', 'InternalUse')),
  constraint mews_bloqueio_intervalo_check check (fim_utc > inicio_utc)
);
create index mews_bloqueio_recurso_idx on app.mews_bloqueio
  (tenant_id, hotel_id, enterprise_id, resource_id, inicio_utc);

alter table app.mews_vinculo enable row level security;
alter table app.mews_vinculo force row level security;
alter table app.mews_checkpoint enable row level security;
alter table app.mews_checkpoint force row level security;
alter table app.mews_recurso enable row level security;
alter table app.mews_recurso force row level security;
alter table app.mews_bloqueio enable row level security;
alter table app.mews_bloqueio force row level security;

-- Credencial_ref NAO e legivel pelo hk_app; so o worker no servidor acessa
-- referencia opaca ao cofre (nao token). Administracao le apenas metadados.
grant select (id, tenant_id, hotel_id, enterprise_id, validado_por, validado_em,
              revogado_em, criado_em) on app.mews_vinculo to hk_app;
grant insert (id, tenant_id, hotel_id, enterprise_id, credencial_ref,
              validado_por, validado_em) on app.mews_vinculo to hk_app;
grant update (revogado_em) on app.mews_vinculo to hk_app;
grant select on app.mews_vinculo to hk_worker;

-- O worker e o unico que le/grava a projecao tecnica Mews.
grant select, insert on app.mews_checkpoint to hk_worker;
grant update (versao, ultimo_updated_utc, ultimo_sweep_utc,
              digest_incremental, digest_sweep, concluido_em)
  on app.mews_checkpoint to hk_worker;
grant select, insert on app.mews_recurso to hk_worker;
grant update (tipo, ativo, updated_utc, deleted_utc) on app.mews_recurso to hk_worker;
grant select, insert on app.mews_bloqueio to hk_worker;
grant update (resource_id, tipo, inicio_utc, fim_utc, ativo, updated_utc,
              deleted_utc) on app.mews_bloqueio to hk_worker;

create policy app_select on app.mews_vinculo for select to hk_app
  using (tenant_id = (select authz.tenant_id()) and (select authz.eh_admin_grupo()));
create policy app_insert on app.mews_vinculo for insert to hk_app
  with check (
    tenant_id = (select authz.tenant_id())
    and validado_por = (select authz.usuario_id())
    and (select authz.eh_admin_grupo())
  );
create policy app_update on app.mews_vinculo for update to hk_app
  using (tenant_id = (select authz.tenant_id()) and (select authz.eh_admin_grupo()))
  with check (tenant_id = (select authz.tenant_id()) and (select authz.eh_admin_grupo()));
create policy worker_select on app.mews_vinculo for select to hk_worker
  using (tenant_id = (select authz.tenant_sistema()));

-- Para tabelas tecnicas, RLS limita tenant; FK composta limita hotel/propriedade.
-- INSERT/UPDATE exigem vinculo ainda ativo. Policy referencia apenas vinculo,
-- sem ciclo (vinculo nao referencia tabelas tecnicas).
create policy worker_select on app.mews_checkpoint for select to hk_worker
  using (tenant_id = (select authz.tenant_sistema()));
create policy worker_insert on app.mews_checkpoint for insert to hk_worker
  with check (
    tenant_id = (select authz.tenant_sistema())
    and exists (select 1 from app.mews_vinculo v
      where v.tenant_id = mews_checkpoint.tenant_id
        and v.hotel_id = mews_checkpoint.hotel_id
        and v.enterprise_id = mews_checkpoint.enterprise_id
        and v.revogado_em is null)
  );
create policy worker_update on app.mews_checkpoint for update to hk_worker
  using (tenant_id = (select authz.tenant_sistema()))
  with check (
    tenant_id = (select authz.tenant_sistema())
    and exists (select 1 from app.mews_vinculo v
      where v.tenant_id = mews_checkpoint.tenant_id
        and v.hotel_id = mews_checkpoint.hotel_id
        and v.enterprise_id = mews_checkpoint.enterprise_id
        and v.revogado_em is null)
  );

create policy worker_select on app.mews_recurso for select to hk_worker
  using (tenant_id = (select authz.tenant_sistema()));
create policy worker_insert on app.mews_recurso for insert to hk_worker
  with check (
    tenant_id = (select authz.tenant_sistema())
    and exists (select 1 from app.mews_vinculo v
      where v.tenant_id = mews_recurso.tenant_id
        and v.hotel_id = mews_recurso.hotel_id
        and v.enterprise_id = mews_recurso.enterprise_id
        and v.revogado_em is null)
  );
create policy worker_update on app.mews_recurso for update to hk_worker
  using (tenant_id = (select authz.tenant_sistema()))
  with check (
    tenant_id = (select authz.tenant_sistema())
    and exists (select 1 from app.mews_vinculo v
      where v.tenant_id = mews_recurso.tenant_id
        and v.hotel_id = mews_recurso.hotel_id
        and v.enterprise_id = mews_recurso.enterprise_id
        and v.revogado_em is null)
  );

create policy worker_select on app.mews_bloqueio for select to hk_worker
  using (tenant_id = (select authz.tenant_sistema()));
create policy worker_insert on app.mews_bloqueio for insert to hk_worker
  with check (
    tenant_id = (select authz.tenant_sistema())
    and exists (select 1 from app.mews_vinculo v
      where v.tenant_id = mews_bloqueio.tenant_id
        and v.hotel_id = mews_bloqueio.hotel_id
        and v.enterprise_id = mews_bloqueio.enterprise_id
        and v.revogado_em is null)
  );
create policy worker_update on app.mews_bloqueio for update to hk_worker
  using (tenant_id = (select authz.tenant_sistema()))
  with check (
    tenant_id = (select authz.tenant_sistema())
    and exists (select 1 from app.mews_vinculo v
      where v.tenant_id = mews_bloqueio.tenant_id
        and v.hotel_id = mews_bloqueio.hotel_id
        and v.enterprise_id = mews_bloqueio.enterprise_id
        and v.revogado_em is null)
  );
