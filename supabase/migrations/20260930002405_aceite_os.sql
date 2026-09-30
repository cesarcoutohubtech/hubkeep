-- ============================================================================
-- HubKeep — Migração 0026: aceite da OS por quem abriu o chamado (fase 1a,
-- C6; ADR-027)
-- ----------------------------------------------------------------------------
-- Quem abriu o chamado, se ainda escreve no hotel, ou o Gerente do hotel
-- aceita a OS concluída ou a reabre com motivo (corretiva.ts, grupo
-- 'aceite'). O Gerente já grava a OS e o chamado pela 0022; quem abriu, não
-- (o Solicitante, por exemplo). O UPDATE de app.os e de app.chamado ganha o
-- ramo de quem abriu o chamado, com escrita no hotel (authz.hoteis_escrita,
-- o mesmo de quem abre chamado).
--
-- Sem ciclo (meta-teste 27): a policy da OS não pode ler app.chamado, porque
-- o UPDATE do chamado lê app.os (0023). Então a OS guarda quem abriu o
-- chamado (chamado_aberto_por), preso ao do chamado por FK composta:
-- (hotel_id, chamado_id, chamado_aberto_por) → chamado (hotel_id, id,
-- aberto_por). O aberto_por do chamado não tem UPDATE, então os dois não
-- divergem, e o da OS também não recebe UPDATE. A coluna aceita nulo porque a
-- OS preventiva (1b) não tem chamado; a aplicação sempre grava na corretiva,
-- e o nulo só tira o ramo (falha fechada).
--
-- Risco aceito (como na 0023): o GRANT por coluna vale para todos os papéis
-- do hk_app, então quem abriu tem UPDATE, no banco, nas colunas da OS e do
-- chamado liberadas pela 0022, em qualquer estado; a aplicação só grava por
-- ele o aceite e a reabertura, e toda gravação fica na auditoria.
-- Só estrutura e autorização: nenhuma função, trigger ou regra de negócio.
-- ============================================================================

alter table app.chamado
  add constraint chamado_aberto_por_unico unique (hotel_id, id, aberto_por);

alter table app.os add column chamado_aberto_por uuid;
update app.os o
   set chamado_aberto_por = c.aberto_por
  from app.chamado c
 where c.hotel_id = o.hotel_id and c.id = o.chamado_id;
alter table app.os
  add constraint os_aberto_por_do_chamado
    foreign key (hotel_id, chamado_id, chamado_aberto_por)
    references app.chamado (hotel_id, id, aberto_por);
create index os_chamado_aberto_por_idx on app.os (hotel_id, chamado_aberto_por);

-- A OS: a gestão do hotel, o Técnico responsável (0023) e quem abriu o chamado.
drop policy app_update on app.os;
create policy app_update on app.os for update to hk_app
  using (
    tenant_id = (select authz.tenant_id())
    and (hotel_id in (select authz.hoteis_com_papel(
           array['admin_grupo', 'gestor_csc', 'gerente_hotel']::app.papel[]))
         or (hotel_id in (select authz.hoteis_com_papel(array['tecnico']::app.papel[]))
             and (tecnico_id = (select authz.usuario_id())
                  or equipe_id in (select em.equipe_id from app.equipe_membro em
                                   where em.usuario_id = (select authz.usuario_id())
                                     and em.ativo)))
         or (hotel_id in (select authz.hoteis_escrita())
             and chamado_aberto_por = (select authz.usuario_id())))
  )
  with check (
    tenant_id = (select authz.tenant_id())
    and (hotel_id in (select authz.hoteis_com_papel(
           array['admin_grupo', 'gestor_csc', 'gerente_hotel']::app.papel[]))
         or (hotel_id in (select authz.hoteis_com_papel(array['tecnico']::app.papel[]))
             and (tecnico_id = (select authz.usuario_id())
                  or equipe_id in (select em.equipe_id from app.equipe_membro em
                                   where em.usuario_id = (select authz.usuario_id())
                                     and em.ativo)))
         or (hotel_id in (select authz.hoteis_escrita())
             and chamado_aberto_por = (select authz.usuario_id())))
  );

-- O chamado: a gestão do hotel, o Técnico responsável pela OS não cancelada
-- (0023) e quem abriu, pela própria linha (não lê outra tabela).
drop policy app_update on app.chamado;
create policy app_update on app.chamado for update to hk_app
  using (
    tenant_id = (select authz.tenant_id())
    and (hotel_id in (select authz.hoteis_com_papel(
           array['admin_grupo', 'gestor_csc', 'gerente_hotel']::app.papel[]))
         or (hotel_id in (select authz.hoteis_com_papel(array['tecnico']::app.papel[]))
             and exists (
               select 1 from app.os o
               where o.hotel_id = chamado.hotel_id and o.chamado_id = chamado.id
                 and o.estado <> 'cancelada'
                 and (o.tecnico_id = (select authz.usuario_id())
                      or o.equipe_id in (select em.equipe_id from app.equipe_membro em
                                         where em.usuario_id = (select authz.usuario_id())
                                           and em.ativo))))
         or (hotel_id in (select authz.hoteis_escrita())
             and aberto_por = (select authz.usuario_id())))
  )
  with check (
    tenant_id = (select authz.tenant_id())
    and (hotel_id in (select authz.hoteis_com_papel(
           array['admin_grupo', 'gestor_csc', 'gerente_hotel']::app.papel[]))
         or (hotel_id in (select authz.hoteis_com_papel(array['tecnico']::app.papel[]))
             and exists (
               select 1 from app.os o
               where o.hotel_id = chamado.hotel_id and o.chamado_id = chamado.id
                 and o.estado <> 'cancelada'
                 and (o.tecnico_id = (select authz.usuario_id())
                      or o.equipe_id in (select em.equipe_id from app.equipe_membro em
                                         where em.usuario_id = (select authz.usuario_id())
                                           and em.ativo))))
         or (hotel_id in (select authz.hoteis_escrita())
             and aberto_por = (select authz.usuario_id())))
  );
