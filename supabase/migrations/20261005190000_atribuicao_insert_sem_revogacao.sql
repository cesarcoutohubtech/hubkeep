-- ============================================================================
-- HubKeep — Migração 0029: a concessão nasce sem revogação (B8 do docs/11)
-- ----------------------------------------------------------------------------
-- A policy de INSERT de app.atribuicao_escopo conferia o tenant, o concedente
-- (concedido_por = quem grava) e o escopo de quem concede, mas aceitava a linha
-- já com revogado_em e revogado_por preenchidos. Com isso, quem concede podia
-- gravar uma "revogação" atribuída a outra pessoa (revogado_por é um membro
-- qualquer do tenant), o que falsifica o registro de quem revogou. A revogação
-- é sempre um UPDATE posterior, feito pela unit of work com o usuário do
-- contexto (packages/db/src/repositorios/membros.ts).
--
-- A policy é recriada igual, com revogado_em e revogado_por nulos na entrada.
-- O check revogacao_consistente já amarra os dois; a policy repete os dois para
-- a regra ficar legível onde ela vale. Sem função nova e sem gatilho; sem
-- mudança de GRANT.
-- ============================================================================

drop policy app_insert on app.atribuicao_escopo;
create policy app_insert on app.atribuicao_escopo for insert to hk_app
  with check (
    tenant_id = (select authz.tenant_id())
    and concedido_por = (select authz.usuario_id())
    and revogado_em is null
    and revogado_por is null
    and ((select authz.eh_admin_grupo())
         or (papel not in ('admin_grupo', 'implantador', 'proprietario')
             and escopo_tipo = 'hotel'
             and hotel_id in (select authz.hoteis_com_papel(array['implantador']::app.papel[]))))
  );
