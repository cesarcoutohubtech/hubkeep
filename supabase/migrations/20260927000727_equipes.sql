-- ============================================================================
-- HubKeep — Migração 0009: equipes do hotel (fase 1a, A6)
-- ----------------------------------------------------------------------------
-- Equipe (nome e membros) por hotel. A OS vai poder ser atribuída a um técnico
-- ou a uma equipe (C3), e a produtividade por equipe da fase 1c usa isto.
--
-- Quem gerencia equipes do hotel: Admin do grupo, Gestor CSC, Implantador e
-- Gerente do hotel, no escopo deles (authz.hoteis_com_papel). Quem lê: quem
-- tem qualquer papel no hotel (authz.hoteis_leitura). Sem DELETE: equipe e
-- participação são desativadas (ativa / ativo = false).
-- Só estrutura e autorização por escopo: nenhuma função, trigger ou regra de
-- negócio nova.
-- ============================================================================
create table app.equipe (
  id            uuid primary key,
  tenant_id     uuid not null,
  hotel_id      uuid not null,
  nome          text not null,
  ativa         boolean not null default true,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (tenant_id, id),
  unique (hotel_id, id),
  unique (hotel_id, nome),
  foreign key (tenant_id, hotel_id) references app.hotel (tenant_id, id),
  constraint equipe_nome_tamanho check (length(nome) between 1 and 120)
);
create index equipe_hotel_idx on app.equipe (tenant_id, hotel_id);

create table app.equipe_membro (
  tenant_id     uuid not null,
  hotel_id      uuid not null,
  equipe_id     uuid not null,
  usuario_id    uuid not null,
  ativo         boolean not null default true,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  primary key (equipe_id, usuario_id),
  foreign key (hotel_id, equipe_id) references app.equipe (hotel_id, id),
  foreign key (tenant_id, hotel_id) references app.hotel (tenant_id, id),
  foreign key (tenant_id, usuario_id) references app.membro (tenant_id, usuario_id)
);
create index equipe_membro_usuario_idx on app.equipe_membro (tenant_id, usuario_id);

alter table app.equipe enable row level security;
alter table app.equipe force row level security;
alter table app.equipe_membro enable row level security;
alter table app.equipe_membro force row level security;

grant select, insert on app.equipe, app.equipe_membro to hk_app;
grant update (nome, ativa, atualizado_em) on app.equipe to hk_app;
grant update (ativo, atualizado_em) on app.equipe_membro to hk_app;
grant select on app.equipe, app.equipe_membro to hk_worker;

create policy app_select on app.equipe for select to hk_app
  using (tenant_id = (select authz.tenant_id()) and hotel_id in (select authz.hoteis_leitura()));
create policy app_insert on app.equipe for insert to hk_app
  with check (
    tenant_id = (select authz.tenant_id())
    and hotel_id in (select authz.hoteis_com_papel(
      array['admin_grupo', 'gestor_csc', 'implantador', 'gerente_hotel']::app.papel[]))
  );
create policy app_update on app.equipe for update to hk_app
  using (
    tenant_id = (select authz.tenant_id())
    and hotel_id in (select authz.hoteis_com_papel(
      array['admin_grupo', 'gestor_csc', 'implantador', 'gerente_hotel']::app.papel[]))
  )
  with check (
    tenant_id = (select authz.tenant_id())
    and hotel_id in (select authz.hoteis_com_papel(
      array['admin_grupo', 'gestor_csc', 'implantador', 'gerente_hotel']::app.papel[]))
  );
create policy worker_select on app.equipe for select to hk_worker
  using (tenant_id = (select authz.tenant_sistema()));

create policy app_select on app.equipe_membro for select to hk_app
  using (tenant_id = (select authz.tenant_id()) and hotel_id in (select authz.hoteis_leitura()));
create policy app_insert on app.equipe_membro for insert to hk_app
  with check (
    tenant_id = (select authz.tenant_id())
    and hotel_id in (select authz.hoteis_com_papel(
      array['admin_grupo', 'gestor_csc', 'implantador', 'gerente_hotel']::app.papel[]))
  );
create policy app_update on app.equipe_membro for update to hk_app
  using (
    tenant_id = (select authz.tenant_id())
    and hotel_id in (select authz.hoteis_com_papel(
      array['admin_grupo', 'gestor_csc', 'implantador', 'gerente_hotel']::app.papel[]))
  )
  with check (
    tenant_id = (select authz.tenant_id())
    and hotel_id in (select authz.hoteis_com_papel(
      array['admin_grupo', 'gestor_csc', 'implantador', 'gerente_hotel']::app.papel[]))
  );
create policy worker_select on app.equipe_membro for select to hk_worker
  using (tenant_id = (select authz.tenant_sistema()));
