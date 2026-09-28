-- ============================================================================
-- HubKeep — Migração 0013: o proprietário não lê políticas (fase 1a, B1)
-- ----------------------------------------------------------------------------
-- Decisão do Cesar (28/09/2026): no MVP o proprietário não lê políticas do
-- hotel; não há uso concreto. O adendo ao ADR-031 vale só para a leitura de
-- app.hotel.
-- A policy de leitura de app.politica perde todos os caminhos do proprietário:
--   - authz.hoteis_proprietario() (hotel inteiro, migração 0012);
--   - authz.locais_proprietario(), pela qual o dono de hotel inteiro (hotel
--     com locais) e o dono de UH liam a política do hotel e as do grupo
--     (migração 0010).
-- Continuam lendo: o Admin do grupo; quem lê o hotel (hoteis_leitura) lê a do
-- hotel; quem tem papel vigente em algum hotel lê as do grupo.
-- ============================================================================

alter policy app_select on app.politica
  using (
    tenant_id = (select authz.tenant_id())
    and ((select authz.eh_admin_grupo())
         or hotel_id in (select authz.hoteis_leitura())
         or (hotel_id is null and exists (select 1 from authz.hoteis_leitura())))
  );
