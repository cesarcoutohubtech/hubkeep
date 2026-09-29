-- ============================================================================
-- HubKeep — Migração 0023: execução da OS (fase 1a, C4a; ADR-025, ADR-027,
-- ADR-029)
-- ----------------------------------------------------------------------------
-- O Técnico responsável pela OS (ele, ou uma equipe ativa de que é membro)
-- inicia, pausa, retoma e conclui, aponta horas, registra material em texto
-- livre e anexa fotos, tudo pelas operações offline do PWA. Tudo o que é regra
-- fica no domínio e na aplicação (corretiva.ts, execucao.ts): as transições,
-- quando se aponta, o limite do apontamento e o texto do material. O banco
-- guarda:
--   - app.os_apontamento: início e fim (fim depois do início) e quem apontou;
--   - app.os_material: o texto (de 1 a 500) e quem registrou;
--   - a entidade 'os' no anexo (coluna os_id, FK pelo hotel).
-- As duas tabelas só recebem inserção, do responsável, em nome dele mesmo. O
-- reenvio da operação offline não duplica: a chave vai em app.operacao_offline
-- na mesma unit of work (ADR-025).
--
-- O UPDATE de app.os e de app.chamado ganha o responsável; no chamado, pela OS
-- não cancelada dele (concluir leva o chamado a aguardando aceite). Os GRANTs
-- por coluna da 0022 não mudam. Risco aceito (diário, C4): o GRANT vale para
-- todos os papéis do hk_app, então o responsável tem UPDATE, no banco, em
-- tecnico_id/equipe_id da OS e em prioridade_id do chamado; a policy só deixa
-- o resultado com ele como responsável, a aplicação nunca grava essas colunas
-- por ele, e toda gravação fica na auditoria.
-- Só estrutura e autorização: nenhuma função, trigger ou regra de negócio.
-- ============================================================================

create table app.os_apontamento (
  id         uuid primary key,
  tenant_id  uuid not null,
  hotel_id   uuid not null,
  os_id      uuid not null,
  usuario_id uuid not null,
  inicio     timestamptz not null,
  fim        timestamptz not null,
  criado_em  timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, hotel_id) references app.hotel (tenant_id, id),
  foreign key (hotel_id, os_id) references app.os (hotel_id, id),
  foreign key (tenant_id, usuario_id) references app.membro (tenant_id, usuario_id),
  constraint os_apontamento_fim_depois_do_inicio check (fim > inicio)
);
create index os_apontamento_os_idx on app.os_apontamento (hotel_id, os_id, inicio);

create table app.os_material (
  id         uuid primary key,
  tenant_id  uuid not null,
  hotel_id   uuid not null,
  os_id      uuid not null,
  usuario_id uuid not null,
  descricao  text not null,
  criado_em  timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, hotel_id) references app.hotel (tenant_id, id),
  foreign key (hotel_id, os_id) references app.os (hotel_id, id),
  foreign key (tenant_id, usuario_id) references app.membro (tenant_id, usuario_id),
  constraint os_material_descricao_tamanho check (length(btrim(descricao)) between 1 and 500)
);
create index os_material_os_idx on app.os_material (hotel_id, os_id, criado_em);

alter table app.os_apontamento enable row level security;
alter table app.os_apontamento force row level security;
alter table app.os_material enable row level security;
alter table app.os_material force row level security;

grant select, insert on app.os_apontamento, app.os_material to hk_app;
grant select on app.os_apontamento, app.os_material to hk_worker;

-- Lê quem lê o hotel. Grava o responsável pela OS, em nome dele mesmo.
create policy app_select on app.os_apontamento for select to hk_app
  using (tenant_id = (select authz.tenant_id())
         and hotel_id in (select authz.hoteis_leitura()));
create policy app_insert on app.os_apontamento for insert to hk_app
  with check (
    tenant_id = (select authz.tenant_id())
    and usuario_id = (select authz.usuario_id())
    and hotel_id in (select authz.hoteis_com_papel(array['tecnico']::app.papel[]))
    and exists (
      select 1 from app.os o
      where o.hotel_id = os_apontamento.hotel_id and o.id = os_apontamento.os_id
        and (o.tecnico_id = (select authz.usuario_id())
             or o.equipe_id in (select em.equipe_id from app.equipe_membro em
                                where em.usuario_id = (select authz.usuario_id())
                                  and em.ativo)))
  );
create policy worker_select on app.os_apontamento for select to hk_worker
  using (tenant_id = (select authz.tenant_sistema()));

create policy app_select on app.os_material for select to hk_app
  using (tenant_id = (select authz.tenant_id())
         and hotel_id in (select authz.hoteis_leitura()));
create policy app_insert on app.os_material for insert to hk_app
  with check (
    tenant_id = (select authz.tenant_id())
    and usuario_id = (select authz.usuario_id())
    and hotel_id in (select authz.hoteis_com_papel(array['tecnico']::app.papel[]))
    and exists (
      select 1 from app.os o
      where o.hotel_id = os_material.hotel_id and o.id = os_material.os_id
        and (o.tecnico_id = (select authz.usuario_id())
             or o.equipe_id in (select em.equipe_id from app.equipe_membro em
                                where em.usuario_id = (select authz.usuario_id())
                                  and em.ativo)))
  );
create policy worker_select on app.os_material for select to hk_worker
  using (tenant_id = (select authz.tenant_sistema()));

-- O responsável anda com a OS (iniciar, pausar, retomar, concluir).
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
                                     and em.ativo))))
  )
  with check (
    tenant_id = (select authz.tenant_id())
    and (hotel_id in (select authz.hoteis_com_papel(
           array['admin_grupo', 'gestor_csc', 'gerente_hotel']::app.papel[]))
         or (hotel_id in (select authz.hoteis_com_papel(array['tecnico']::app.papel[]))
             and (tecnico_id = (select authz.usuario_id())
                  or equipe_id in (select em.equipe_id from app.equipe_membro em
                                   where em.usuario_id = (select authz.usuario_id())
                                     and em.ativo))))
  );

-- E leva o chamado junto (concluir: aguardando aceite), pela OS não cancelada dele.
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
                                           and em.ativo)))))
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
                                           and em.ativo)))))
  );

-- Anexo da OS (as fotos da execução).
alter table app.anexo add column os_id uuid;
alter table app.anexo
  add constraint anexo_os_fk foreign key (hotel_id, os_id) references app.os (hotel_id, id);
alter table app.anexo drop constraint anexo_entidade_valida;
alter table app.anexo drop constraint anexo_registro_da_entidade;
alter table app.anexo drop constraint anexo_caminho_do_registro;
alter table app.anexo drop constraint anexo_miniatura_do_registro;
alter table app.anexo
  add constraint anexo_entidade_valida
    check (entidade in ('hotel', 'local', 'ativo', 'chamado', 'os')),
  add constraint anexo_registro_da_entidade check (
    (entidade = 'hotel' and local_id is null and ativo_id is null and chamado_id is null
       and os_id is null)
    or (entidade = 'local' and local_id is not null and ativo_id is null and chamado_id is null
          and os_id is null)
    or (entidade = 'ativo' and ativo_id is not null and local_id is null and chamado_id is null
          and os_id is null)
    or (entidade = 'chamado' and chamado_id is not null and local_id is null and ativo_id is null
          and os_id is null)
    or (entidade = 'os' and os_id is not null and local_id is null and ativo_id is null
          and chamado_id is null)
  ),
  add constraint anexo_caminho_do_registro check (
    caminho like tenant_id::text || '/' || hotel_id::text || '/' || entidade || '/'
                 || coalesce(os_id, chamado_id, ativo_id, local_id, hotel_id)::text || '/%'
  ),
  add constraint anexo_miniatura_do_registro check (
    miniatura_caminho is null
    or miniatura_caminho like tenant_id::text || '/' || hotel_id::text || '/' || entidade || '/'
                              || coalesce(os_id, chamado_id, ativo_id, local_id, hotel_id)::text
                              || '/%'
  );
create index anexo_os_idx on app.anexo (hotel_id, os_id) where os_id is not null;
