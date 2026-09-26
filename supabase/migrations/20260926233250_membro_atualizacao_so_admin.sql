-- ============================================================================
-- HubKeep — Migração 0007: atualização de app.membro só pelo Admin do grupo
-- (fase 1a, A3; aprovada pelo Cesar em 26/09/2026)
-- ----------------------------------------------------------------------------
-- A policy da fundação deixava o Implantador atualizar membro sem papel Admin
-- ou Implantador, em qualquer hotel do tenant. Desativar um membro vale para o
-- tenant inteiro, e o Implantador tem escopo de hotel: ele não enxerga, pela
-- RLS, os papéis do membro em outros hotéis. A regra do domínio (A3) já é
-- "só o Admin do grupo desativa ou reativa"; aqui o banco passa a garantir o
-- mesmo. O Implantador tira o acesso ao hotel dele revogando o papel.
--
-- O INSERT (convite pelo Implantador) não muda. Só autorização por escopo:
-- nenhuma função, trigger ou regra de negócio nova.
-- ============================================================================
alter policy app_update on app.membro
  using (tenant_id = (select authz.tenant_id()) and (select authz.eh_admin_grupo()))
  with check (tenant_id = (select authz.tenant_id()));
