-- ============================================================================
-- HubKeep — Migração 0053: auditoria do sinal do hóspede sem hotel_id
-- (ADR-047)
-- ----------------------------------------------------------------------------
-- O ADR-047 manda a auditoria do sinal do hóspede (a importação, por lote, e a
-- classificação) sem hotel_id, como a do insight (0040): a RLS de leitura da
-- app.auditoria deixa o técnico e o solicitante do hotel lerem as linhas com
-- hotel_id (hoteis_escrita), e o sinal do hóspede é só de quem decide insight
-- (0052). Sem hotel, só o Admin do grupo lê a linha, como hoje.
--
-- O INSERT da auditoria pelo hk_app só aceita hotel_id nulo do Admin do grupo,
-- do implantador e dos casos nomeados (preferência, fornecedor e insight). A
-- 0052 não trouxe o caso do sinal, e a integração do packages/db do #308
-- falhou na CI quando o Gerente importou. Esta migração acrescenta só esse
-- caso, no molde do insight: hotel nulo, entidade 'sinal_hospede', quem grava
-- tem papel de Gestor CSC ou de Gerente do hotel, e o registro existe e é
-- visível a quem grava. O registro é a reclamação (classificação) ou o lote
-- (importação, que não tem linha própria: confere-se pelas reclamações do
-- lote). A subconsulta passa pela RLS da app.sinal_hospede, que é a de quem
-- decide insight no hotel, e essa RLS só lê funções authz: sem ciclo entre
-- policies (meta-teste 27). O resto do texto repete a policy atual (0040). A
-- leitura não muda.
--
-- Decisão do Cesar no chat do agente do Intelligence, 17/10/2026 ("Cesar
-- aqui. De acordo com a opção 1"); a tabela é do núcleo.
--
-- O índice por lote serve à subconsulta da importação.
-- ============================================================================

create index sinal_hospede_lote_idx on app.sinal_hospede (tenant_id, lote_id);

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
      or (hotel_id is null
          and entidade = 'sinal_hospede'
          and exists (select 1 from authz.hoteis_com_papel(
            array['gestor_csc', 'gerente_hotel']::app.papel[]))
          and exists (select 1 from app.sinal_hospede s
                      where s.tenant_id = auditoria.tenant_id
                        and (s.id = auditoria.registro_id or s.lote_id = auditoria.registro_id)))
    )
  );
