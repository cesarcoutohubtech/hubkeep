-- ============================================================================
-- HubKeep — Migração 0005: idioma e região (F0-10b, ADR-022)
-- ----------------------------------------------------------------------------
-- 1. app.tenant: país (ISO 3166-1), subdivisão (ISO 3166-2), moeda (ISO 4217)
--    e idioma padrão. Os tenants que já existem ficam com BR, BRL e pt-BR.
-- 2. app.hotel: os mesmos quatro, nulos, herdando do tenant. O fuso IANA já
--    existe na tabela.
-- 3. app.preferencia_membro (decisão do Cesar, 26/09/2026, em vez de colunas
--    em app.membro): idioma, formato regional e fuso de cada membro, nulos
--    herdando. Tabela própria porque o membro edita as próprias preferências,
--    e em app.membro isso abriria ativo, nome e email a ele (a RLS não compara
--    valor antigo com novo). Aqui cada um lê e grava só a própria linha, e o
--    UPDATE cobre só as três colunas.
-- 4. Auditoria: a "regra própria da autoauditoria" que a 0003 anunciou para
--    quando a edição do próprio perfil existisse. Quem edita as próprias
--    preferências audita sem hotel, só para entidade preferencia_membro e só
--    com o próprio id como registro. Não há evento de domínio nessa escrita.
--
-- Restrições: idioma pela lista do código (@hubkeep/i18n, IDIOMAS; o teste
-- tests/i18n-banco.test.ts confere que bate); país, subdivisão, moeda e
-- formato regional por formato. O fuso é validado na aplicação (ADR-005).
-- Idioma novo exige migração que amplia as três restrições de idioma.
-- Só estrutura e autorização por escopo: nenhuma função, trigger ou regra de
-- negócio nova.
-- ============================================================================

-- 1. Tenant ------------------------------------------------------------------
alter table app.tenant
  add column pais          text not null default 'BR',
  add column subdivisao    text,
  add column moeda         text not null default 'BRL',
  add column idioma_padrao text not null default 'pt-BR',
  add constraint tenant_pais_iso check (pais ~ '^[A-Z]{2}$'),
  add constraint tenant_subdivisao_iso
    check (subdivisao ~ '^[A-Z]{2}-[A-Z0-9]{1,3}$' and left(subdivisao, 2) = pais),
  add constraint tenant_moeda_iso check (moeda ~ '^[A-Z]{3}$'),
  add constraint tenant_idioma_padrao_lista
    check (idioma_padrao in ('pt-BR', 'en', 'es', 'fr'));

-- 2. Hotel -------------------------------------------------------------------
alter table app.hotel
  add column pais          text,
  add column subdivisao    text,
  add column moeda         text,
  add column idioma_padrao text,
  add constraint hotel_pais_iso check (pais ~ '^[A-Z]{2}$'),
  add constraint hotel_subdivisao_iso
    check (subdivisao ~ '^[A-Z]{2}-[A-Z0-9]{1,3}$' and (pais is null or left(subdivisao, 2) = pais)),
  add constraint hotel_moeda_iso check (moeda ~ '^[A-Z]{3}$'),
  add constraint hotel_idioma_padrao_lista
    check (idioma_padrao in ('pt-BR', 'en', 'es', 'fr'));

-- Quem já altera o hotel (Admin do grupo, policy app_update) altera também
-- idioma e região. O INSERT de hk_app é de tabela inteira e já cobre.
grant update (pais, subdivisao, moeda, idioma_padrao) on app.hotel to hk_app;

-- 3. Preferências do membro ---------------------------------------------------
create table app.preferencia_membro (
  tenant_id        uuid not null,
  usuario_id       uuid not null,
  idioma           text,
  formato_regional text,
  fuso             text,
  criado_em        timestamptz not null default now(),
  atualizado_em    timestamptz not null default now(),
  primary key (tenant_id, usuario_id),
  foreign key (tenant_id, usuario_id) references app.membro (tenant_id, usuario_id),
  constraint preferencia_idioma_lista check (idioma in ('pt-BR', 'en', 'es', 'fr')),
  constraint preferencia_formato_regional_bcp47
    check (formato_regional ~ '^[a-z]{2,3}(-([A-Z]{2}|[0-9]{3}))?$'),
  constraint preferencia_fuso_tamanho check (length(fuso) between 1 and 64)
);

alter table app.preferencia_membro enable row level security;
alter table app.preferencia_membro force row level security;

grant select, insert on app.preferencia_membro to hk_app;
grant update (idioma, formato_regional, fuso, atualizado_em) on app.preferencia_membro to hk_app;
-- O worker lê para escrever e-mail e push no idioma de quem recebe.
grant select on app.preferencia_membro to hk_worker;

-- Cada um só a própria linha, no tenant do contexto. authz.tenant_id() só
-- devolve tenant de que o usuário é membro ativo: membro desativado não grava.
create policy app_select on app.preferencia_membro for select to hk_app
  using (tenant_id = (select authz.tenant_id()) and usuario_id = (select authz.usuario_id()));
create policy app_insert on app.preferencia_membro for insert to hk_app
  with check (tenant_id = (select authz.tenant_id()) and usuario_id = (select authz.usuario_id()));
create policy app_update on app.preferencia_membro for update to hk_app
  using (tenant_id = (select authz.tenant_id()) and usuario_id = (select authz.usuario_id()))
  with check (tenant_id = (select authz.tenant_id()) and usuario_id = (select authz.usuario_id()));
create policy worker_select on app.preferencia_membro for select to hk_worker
  using (tenant_id = (select authz.tenant_sistema()));

-- 4. Autoauditoria das preferências --------------------------------------------
alter policy app_insert on app.auditoria
  with check (
    tenant_id = (select authz.tenant_id())
    and usuario_id = (select authz.usuario_id())
    and (
      (hotel_id is null
       and ((select authz.eh_admin_grupo())
            or exists (select 1 from authz.hoteis_com_papel(array['implantador']::app.papel[]))))
      or hotel_id in (select authz.hoteis_escrita())
      or (hotel_id is null
          and entidade = 'preferencia_membro'
          and registro_id = (select authz.usuario_id()))
    )
  );
