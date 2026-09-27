-- ============================================================================
-- HubKeep — Migração 0011: proprietário de hotel inteiro (fase 1a, A4; ADR-031)
-- ----------------------------------------------------------------------------
-- 1. app.hotel_proprietario: vínculo do proprietário (ou locador) com um hotel
--    inteiro, com vigência, como app.local_proprietario faz com a UH. FK
--    composta, escrita e leitura só pelo Admin do grupo (como app.proprietario:
--    o vínculo é dado do proprietário), sem DELETE; encerrar é vigencia_fim.
-- 2. authz.locais_proprietario() passa a devolver também todos os locais (UHs
--    e áreas comuns) dos hotéis vinculados, dentro da vigência. As policies que
--    já usam a função (hotel, local, local_proprietario e as tabelas da 1a)
--    cobrem o caso sem mudança, e UH nova do CM no hotel entra no escopo sem
--    ação manual: o escopo é calculado na fonte (ADR-004). O proprietário
--    continua só leitura: authz.hoteis_escrita() não muda.
-- Mesma função (nome, assinatura, dona hk_authz, security definer, search_path
-- vazio); só o corpo muda. O meta-teste 11 confere o corpo de cada função.
-- ============================================================================

-- 1. Vínculo com hotel inteiro -------------------------------------------------
create table app.hotel_proprietario (
  id              uuid primary key,
  tenant_id       uuid not null,
  proprietario_id uuid not null,
  hotel_id        uuid not null,
  vigencia_inicio date not null,
  vigencia_fim    date,
  criado_em       timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, proprietario_id) references app.proprietario (tenant_id, id),
  foreign key (tenant_id, hotel_id)        references app.hotel (tenant_id, id),
  constraint vigencia_valida check (vigencia_fim is null or vigencia_fim >= vigencia_inicio)
);
create index hotel_proprietario_idx on app.hotel_proprietario (tenant_id, proprietario_id);

alter table app.hotel_proprietario enable row level security;
alter table app.hotel_proprietario force row level security;

grant select, insert on app.hotel_proprietario to hk_app;
grant update (vigencia_inicio, vigencia_fim) on app.hotel_proprietario to hk_app;
grant select on app.hotel_proprietario to hk_worker, hk_authz;

-- hk_authz lê tudo, como nas outras tabelas de escopo (evita recursão de policy).
create policy authz_leitura on app.hotel_proprietario for select to hk_authz using (true);
create policy app_select on app.hotel_proprietario for select to hk_app
  using (tenant_id = (select authz.tenant_id()) and (select authz.eh_admin_grupo()));
create policy app_insert on app.hotel_proprietario for insert to hk_app
  with check (tenant_id = (select authz.tenant_id()) and (select authz.eh_admin_grupo()));
create policy app_update on app.hotel_proprietario for update to hk_app
  using (tenant_id = (select authz.tenant_id()) and (select authz.eh_admin_grupo()))
  with check (tenant_id = (select authz.tenant_id()));
create policy worker_select on app.hotel_proprietario for select to hk_worker
  using (tenant_id = (select authz.tenant_sistema()));

-- 2. Escopo do proprietário: UHs vinculadas e locais dos hotéis vinculados -----
create or replace function authz.locais_proprietario()
returns table (local_id uuid, hotel_id uuid)
language sql stable security definer set search_path = ''
as $$
  select l.id, l.hotel_id
  from app.atribuicao_escopo a
  join app.local_proprietario lp
    on lp.tenant_id = a.tenant_id and lp.proprietario_id = a.proprietario_id
  join app.local l
    on l.tenant_id = lp.tenant_id and l.id = lp.local_id
  where a.tenant_id  = authz.tenant_id()
    and a.usuario_id = authz.usuario_id()
    and a.escopo_tipo = 'proprietario'
    and a.revogado_em is null
    and (a.valido_ate is null or a.valido_ate > now())
    and lp.vigencia_inicio <= current_date
    and (lp.vigencia_fim is null or lp.vigencia_fim >= current_date)
  union
  select l.id, l.hotel_id
  from app.atribuicao_escopo a
  join app.hotel_proprietario hp
    on hp.tenant_id = a.tenant_id and hp.proprietario_id = a.proprietario_id
  join app.local l
    on l.tenant_id = hp.tenant_id and l.hotel_id = hp.hotel_id
  where a.tenant_id  = authz.tenant_id()
    and a.usuario_id = authz.usuario_id()
    and a.escopo_tipo = 'proprietario'
    and a.revogado_em is null
    and (a.valido_ate is null or a.valido_ate > now())
    and hp.vigencia_inicio <= current_date
    and (hp.vigencia_fim is null or hp.vigencia_fim >= current_date)
$$;
