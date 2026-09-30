-- ============================================================================
-- HubKeep — Migração 0027: o Gestor CSC lê as atribuições de Gerente dos
-- hotéis dele (fase 1a, C6; ADR-027)
-- ----------------------------------------------------------------------------
-- Quem abriu o chamado e executa a OS não decide o aceite; decide outro
-- Gerente do hotel. Se não há outro Gerente ativo no hotel, decidem o Gestor
-- CSC ou o Admin do grupo (decisão do Cesar de 30/09/2026; a regra está em
-- corretiva.ts, grupo 'aceite'). Para saber se há outro Gerente, a aplicação
-- lê, com o contexto de quem pede, as atribuições de Gerente que cobrem o
-- hotel. O Admin do grupo já lê todas; o Gestor CSC lia só as de Técnico
-- (0022). Esta migração soma à policy de leitura as atribuições de Gerente
-- que cobrem os hotéis em que a pessoa é Gestor CSC (por hotel, pela bandeira
-- do hotel ou do grupo). Nenhum outro papel ganha leitura, e o Gerente segue
-- sem ver as atribuições de outro Gerente.
--
-- O Gestor CSC e o Admin já gravam a OS e o chamado no hotel (0022 e 0026),
-- então a escrita não muda. Sem função nova e sem gatilho.
-- ============================================================================

drop policy app_select on app.atribuicao_escopo;
create policy app_select on app.atribuicao_escopo for select to hk_app
  using (
    tenant_id = (select authz.tenant_id())
    and ((select authz.eh_admin_grupo())
         or usuario_id = (select authz.usuario_id())
         or hotel_id in (select authz.hoteis_com_papel(array['implantador']::app.papel[]))
         or (papel = 'tecnico'
             and exists (
               select 1 from app.hotel h
               where h.id in (select authz.hoteis_com_papel(
                               array['gestor_csc', 'gerente_hotel']::app.papel[]))
                 and (atribuicao_escopo.escopo_tipo = 'grupo'
                      or (atribuicao_escopo.escopo_tipo = 'bandeira'
                          and h.bandeira_id = atribuicao_escopo.bandeira_id)
                      or (atribuicao_escopo.escopo_tipo = 'hotel'
                          and h.id = atribuicao_escopo.hotel_id))))
         or (papel = 'gerente_hotel'
             and exists (
               select 1 from app.hotel h
               where h.id in (select authz.hoteis_com_papel(array['gestor_csc']::app.papel[]))
                 and (atribuicao_escopo.escopo_tipo = 'grupo'
                      or (atribuicao_escopo.escopo_tipo = 'bandeira'
                          and h.bandeira_id = atribuicao_escopo.bandeira_id)
                      or (atribuicao_escopo.escopo_tipo = 'hotel'
                          and h.id = atribuicao_escopo.hotel_id)))))
  );
