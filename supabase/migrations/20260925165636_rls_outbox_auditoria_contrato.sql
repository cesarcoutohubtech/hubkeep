-- ============================================================================
-- HubKeep — Migração 0003: outbox, auditoria sem hotel e contrato de licença
-- ----------------------------------------------------------------------------
-- Os casos mínimos por tabela (003_isolamento_por_tabela) mostraram três
-- policies que liberavam a qualquer membro ativo do tenant, inclusive a quem
-- só lê (proprietário) ou já não tem papel vigente (implantador vencido):
--
--   1. publicar evento em app.evento_dominio;
--   2. gravar app.auditoria com hotel_id nulo;
--   3. ler licenca.contrato.
--
-- Proposta (ADR-021, aguardando aprovação do Cesar): publicar evento e auditar no nível do
-- grupo exige ser Admin do grupo ou ter papel de escrita vigente em algum
-- hotel; o contrato de licença só o Admin do grupo lê pelo hk_app (é ele quem
-- ativa hotel). O worker segue com as policies próprias.
--
-- Só autorização por escopo: nenhuma função, trigger ou regra de negócio nova.
-- ============================================================================

-- 1. Outbox: quem só lê (ou perdeu o papel) não publica evento.
alter policy app_insert on app.evento_dominio
  with check (
    tenant_id = (select authz.tenant_id())
    and ((select authz.eh_admin_grupo()) or exists (select 1 from authz.hoteis_escrita()))
  );

-- 2. Auditoria: sem hotel, só quem escreve no nível do grupo; com hotel, como
--    antes, só nos hotéis em que o usuário escreve.
alter policy app_insert on app.auditoria
  with check (
    tenant_id = (select authz.tenant_id())
    and usuario_id = (select authz.usuario_id())
    and (
      (hotel_id is null
       and ((select authz.eh_admin_grupo()) or exists (select 1 from authz.hoteis_escrita())))
      or hotel_id in (select authz.hoteis_escrita())
    )
  );

-- 3. Contrato de licença: só o Admin do grupo, pelo hk_app.
alter policy app_select on licenca.contrato
  using (tenant_id = (select authz.tenant_id()) and (select authz.eh_admin_grupo()));
