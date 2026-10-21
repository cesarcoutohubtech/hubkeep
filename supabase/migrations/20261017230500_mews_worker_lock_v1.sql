-- ===========================================================================
-- HubKeep EU — Migração 0055: lock transacional mínimo no vínculo Mews
-- ===========================================================================
-- Somente estrutura + autorização para SELECT FOR UPDATE do hk_worker.
-- A migração 0054 já incorporada NÃO é alterada. Não executar db push sem
-- autorização específica do Cesar, mesmo após merge. Sem jobs ou triggers.
--
-- Problema comprovado: pgTAP da 0054 passa, mas SELECT FOR UPDATE no driver
-- recebe 42501 porque hk_worker só dispõe de SELECT em app.mews_vinculo.
-- A coluna técnica não concede poder de alterar identidade ou revogação.
-- ===========================================================================

alter table app.mews_vinculo
  add column lock_versao bigint not null default 0,
  add constraint mews_vinculo_lock_versao_check check (lock_versao >= 0);

-- SELECT FOR UPDATE exige UPDATE em ao menos uma coluna. Conceder SOMENTE
-- a coluna inerte; NÃO permitir UPDATE em tenant_id, hotel_id, enterprise_id,
-- validado_por, credencial_ref, revogado_em nem outros campos do vínculo.
grant update (lock_versao) on app.mews_vinculo to hk_worker;

-- FORCE RLS da 0054 permanece ativo. A policy UPDATE é necessária também
-- para selecionar uma linha FOR UPDATE. Vínculos revogados não são traváveis.
create policy worker_lock on app.mews_vinculo
  for update to hk_worker
  using (
    tenant_id = (select authz.tenant_sistema())
    and revogado_em is null
  )
  with check (
    tenant_id = (select authz.tenant_sistema())
    and revogado_em is null
  );

-- Não concede DELETE, bypass RLS, secret key nem acesso público.
-- Não cria callback operacional, OS, job ou escrita no PMS.
