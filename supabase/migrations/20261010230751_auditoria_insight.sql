-- ============================================================================
-- 0040 — Auditoria da decisão do insight sem hotel (Intelligence, telas do 1.0).
--
-- Decisão do Cesar de 10/10/2026: a auditoria do insight vai sem hotel_id. A
-- RLS de leitura da app.auditoria deixa o técnico e o solicitante do hotel
-- lerem as linhas com hotel_id (hoteis_escrita), e o insight é só de quem
-- decide (0038). Sem hotel, só o Admin do grupo lê a linha, como hoje.
--
-- O job (hk_worker) já grava assim. A pessoa que decide (hk_app), não: o
-- INSERT da auditoria só aceita hotel_id nulo do Admin do grupo e do
-- implantador. Esta migração acrescenta só esse caso, no molde do fornecedor
-- (0033): hotel nulo, entidade 'insight', quem grava tem papel de Gestor CSC
-- ou de Gerente do hotel, e o insight existe e é visível a quem grava (a
-- subconsulta passa pela RLS da app.insight, que é a de quem decide). O resto
-- do texto repete a policy atual (0033). A leitura não muda.
--
-- Pedido do agente do Intelligence, aprovado pelo Cesar no chat em 10/10/2026
-- (a tabela é do núcleo).
-- ============================================================================

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
      or (hotel_id is null
          and entidade = 'fornecedor'
          and exists (select 1 from authz.hoteis_com_papel(
            array['gestor_csc', 'gerente_hotel']::app.papel[]))
          and exists (select 1 from app.fornecedor f
                      where f.tenant_id = auditoria.tenant_id and f.id = auditoria.registro_id))
      or (hotel_id is null
          and entidade = 'insight'
          and exists (select 1 from authz.hoteis_com_papel(
            array['gestor_csc', 'gerente_hotel']::app.papel[]))
          and exists (select 1 from app.insight i
                      where i.tenant_id = auditoria.tenant_id and i.id = auditoria.registro_id))
    )
  );
