-- ============================================================================
-- HubKeep Europa — Migracao 0056: leitura administrativa Mews V1 (ADR-048)
-- ============================================================================
-- Consulta tecnica SOMENTE pelo Admin do grupo, via hk_app autenticado.
-- Nao altera papeis existentes do hk_worker; nao permite mutacao pelo hk_app.
-- Schema ja aplicado pela 0054/0055; nao editar essas migracoes.
-- NAO aplicar no Supabase-dev/staging/producao sem autorizacao do Cesar.
--
-- Somente metadados de sincronizacao + contagens de Space e bloqueios.
-- Nunca liberar credencial_ref, digest, ids externos ou dados de hospedes.
-- Sem rotas, cron, trigger, OS, status de UH ou chamada ao PMS.
-- ============================================================================

-- Versao, watermarks e conclusao: sem digest/checksum de lotes.
grant select (
  tenant_id, hotel_id, versao,
  ultimo_updated_utc, ultimo_sweep_utc, concluido_em
) on app.mews_checkpoint to hk_app;

-- Somente chaves de escopo e flags para contagem. Sem enterprise_id, resource_id nem payload.
grant select (
  tenant_id, hotel_id, ativo
) on app.mews_recurso to hk_app;

-- Somente chaves de escopo, tipo tecnico e flag para contagem.
-- Nao liberar enterprise_id, block_id, resource_id nem intervalos nesta fase.
grant select (
  tenant_id, hotel_id, tipo, ativo
) on app.mews_bloqueio to hk_app;

-- Exigir Admin ativo no tenant E vinculo Mews nao revogado do hotel.
-- SELECT no vinculo ja e permitido ao hk_app Admin pela migracao 0054.
-- RLS ENABLE/FORCE, policies do worker e grants restritos permanecem intactos.
create policy app_admin_select on app.mews_checkpoint for select to hk_app
  using (
    tenant_id = (select authz.tenant_id())
    and (select authz.eh_admin_grupo())
    and exists (
      select 1 from app.mews_vinculo v
       where v.tenant_id = mews_checkpoint.tenant_id
         and v.hotel_id = mews_checkpoint.hotel_id
         and v.enterprise_id = mews_checkpoint.enterprise_id
         and v.revogado_em is null
    )
  );

create policy app_admin_select on app.mews_recurso for select to hk_app
  using (
    tenant_id = (select authz.tenant_id())
    and (select authz.eh_admin_grupo())
    and exists (
      select 1 from app.mews_vinculo v
       where v.tenant_id = mews_recurso.tenant_id
         and v.hotel_id = mews_recurso.hotel_id
         and v.enterprise_id = mews_recurso.enterprise_id
         and v.revogado_em is null
    )
  );

create policy app_admin_select on app.mews_bloqueio for select to hk_app
  using (
    tenant_id = (select authz.tenant_id())
    and (select authz.eh_admin_grupo())
    and exists (
      select 1 from app.mews_vinculo v
       where v.tenant_id = mews_bloqueio.tenant_id
         and v.hotel_id = mews_bloqueio.hotel_id
         and v.enterprise_id = mews_bloqueio.enterprise_id
         and v.revogado_em is null
    )
  );
