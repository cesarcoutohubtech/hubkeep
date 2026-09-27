-- ============================================================================
-- HubKeep — Migração 0010: políticas configuráveis e configuração do tenant
-- (fase 1a, A7; ADR-026)
-- ----------------------------------------------------------------------------
-- 1. app.politica: o valor de cada política (chave → valor jsonb) por escopo:
--    grupo, bandeira ou hotel. A estrutura já comporta a bandeira, que a fase
--    1c liga com o SLA sem migração nova; na 1a a resolução usa hotel → grupo
--    → padrão do código. O formato de cada chave é validado no domínio (a
--    coluna só confere o formato do nome da chave). Sem DELETE: voltar a herdar
--    é ativa = false. Leitura por escopo (a do hotel, quem lê o hotel; a do
--    grupo, quem tem papel vigente no tenant);
--    grava só o Admin do grupo.
-- 2. app.tenant: o Admin do grupo passa a alterar país, subdivisão, moeda e
--    idioma padrão do próprio tenant (colunas da F0-10b). Antes, o hk_app não
--    tinha UPDATE nenhum em app.tenant.
-- Só estrutura e autorização por escopo: nenhuma função, trigger ou regra de
-- negócio nova.
-- ============================================================================

-- 1. Políticas ----------------------------------------------------------------
create table app.politica (
  id             uuid primary key,
  tenant_id      uuid not null,
  escopo_tipo    text not null,
  bandeira_id    uuid,
  hotel_id       uuid,
  chave          text not null,
  valor          jsonb not null,
  ativa          boolean not null default true,
  atualizado_por uuid not null,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, bandeira_id) references app.bandeira (tenant_id, id),
  foreign key (tenant_id, hotel_id) references app.hotel (tenant_id, id),
  constraint politica_escopo_tipo check (escopo_tipo in ('grupo', 'bandeira', 'hotel')),
  constraint politica_escopo_coerente check (
       (escopo_tipo = 'grupo'    and bandeira_id is null     and hotel_id is null)
    or (escopo_tipo = 'bandeira' and bandeira_id is not null and hotel_id is null)
    or (escopo_tipo = 'hotel'    and hotel_id is not null    and bandeira_id is null)
  ),
  constraint politica_chave_formato check (chave ~ '^[a-z_]+(\.[a-z_]+)+$')
);
-- Uma linha por chave em cada escopo.
create unique index politica_unica_grupo on app.politica (tenant_id, chave)
  where escopo_tipo = 'grupo';
create unique index politica_unica_bandeira on app.politica (tenant_id, bandeira_id, chave)
  where escopo_tipo = 'bandeira';
create unique index politica_unica_hotel on app.politica (tenant_id, hotel_id, chave)
  where escopo_tipo = 'hotel';

alter table app.politica enable row level security;
alter table app.politica force row level security;

grant select, insert on app.politica to hk_app;
grant update (valor, ativa, atualizado_por, atualizado_em) on app.politica to hk_app;
grant select on app.politica to hk_worker;

-- Leitura por escopo (casos do doc 02): a política de um hotel, só quem lê o
-- hotel (inclui o proprietário de UH dele); a do grupo ou da bandeira, quem
-- tem papel vigente no tenant. O Admin lê tudo, mesmo sem hotel cadastrado.
-- Implantador vencido não vê nada.
create policy app_select on app.politica for select to hk_app
  using (
    tenant_id = (select authz.tenant_id())
    and ((select authz.eh_admin_grupo())
         or hotel_id in (select authz.hoteis_leitura())
         or hotel_id in (select lp.hotel_id from authz.locais_proprietario() lp)
         or (hotel_id is null
             and (exists (select 1 from authz.hoteis_leitura())
                  or exists (select 1 from authz.locais_proprietario()))))
  );
create policy app_insert on app.politica for insert to hk_app
  with check (
    tenant_id = (select authz.tenant_id())
    and (select authz.eh_admin_grupo())
    and atualizado_por = (select authz.usuario_id())
  );
create policy app_update on app.politica for update to hk_app
  using (tenant_id = (select authz.tenant_id()) and (select authz.eh_admin_grupo()))
  with check (
    tenant_id = (select authz.tenant_id())
    and atualizado_por = (select authz.usuario_id())
  );
create policy worker_select on app.politica for select to hk_worker
  using (tenant_id = (select authz.tenant_sistema()));

-- 2. Configuração do tenant ------------------------------------------------------
grant update (pais, subdivisao, moeda, idioma_padrao) on app.tenant to hk_app;

create policy app_update on app.tenant for update to hk_app
  using (id = (select authz.tenant_id()) and (select authz.eh_admin_grupo()))
  with check (id = (select authz.tenant_id()));
