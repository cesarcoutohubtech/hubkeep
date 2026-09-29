-- ============================================================================
-- HubKeep — Migração 0022: OS e triagem do chamado (fase 1a, C3; ADR-027,
-- ADR-029)
-- ----------------------------------------------------------------------------
-- A OS da corretiva, gerada na triagem e atribuída a um técnico ou a uma
-- equipe do hotel (A6). Tudo o que é regra fica no domínio e na aplicação
-- (corretiva.ts, situacoes.ts, casos-de-uso/triagem.ts): quem tria, quem
-- recebe a OS, as transições, a situação e o motivo. O banco guarda:
--   - estado (canônico, só o formato; a lista é do domínio) e situacao_id,
--     com FK composta para as do tenant;
--   - o responsável: tecnico_id (membro do tenant) ou equipe_id (equipe do
--     mesmo hotel), exatamente um. Chama-se tecnico_id, e não usuario_id,
--     porque a reatribuição troca o responsável, e usuario_id é campo de
--     escopo sem UPDATE (meta-teste 18);
--   - motivo_cancelamento, versao (ADR-029) e criado_por, igual a quem grava.
-- Integridade (decisão do Cesar, 29/09/2026): no máximo uma OS não cancelada
-- por chamado. Cancelar a OS devolve o chamado à triagem, para ganhar outra;
-- o aceite recusado reabre a mesma OS (C6), sem criar outra. O domínio tem a
-- mesma regra (osOcupaOChamado), com teste de paridade; o índice pega as duas
-- triagens simultâneas que o domínio, sozinho, não vê. A OS preventiva (1b)
-- não tem chamado: o predicado do índice a deixa de fora quando o chamado_id
-- deixar de ser obrigatório.
--
-- O chamado ganha motivo_cancelamento e o primeiro UPDATE: estado, situação,
-- prioridade e motivo, pelos papéis da triagem (Admin do grupo, Gestor CSC e
-- Gerente do hotel). A C4 (concluir) e a C6 (aceite) ampliam.
-- Lê a OS: quem lê o hotel e o proprietário que vê o chamado dela. Grava: os
-- papéis da triagem. Sem DELETE.
-- A leitura de app.atribuicao_escopo ganha as atribuições de Técnico nos
-- hotéis da triagem, para a aplicação conferir quem recebe a OS.
-- Só estrutura e autorização: nenhuma função, trigger ou regra de negócio.
-- ============================================================================

create table app.os (
  id                  uuid primary key,
  tenant_id           uuid not null,
  hotel_id            uuid not null,
  chamado_id          uuid not null,
  estado              text not null,
  situacao_id         uuid not null,
  tecnico_id          uuid,
  equipe_id           uuid,
  motivo_cancelamento text,
  criado_por          uuid not null,
  versao              integer not null default 1,
  criado_em           timestamptz not null default now(),
  atualizado_em       timestamptz not null default now(),
  unique (tenant_id, id),
  unique (hotel_id, id),
  foreign key (tenant_id, hotel_id) references app.hotel (tenant_id, id),
  foreign key (hotel_id, chamado_id) references app.chamado (hotel_id, id),
  foreign key (hotel_id, equipe_id) references app.equipe (hotel_id, id),
  foreign key (tenant_id, tecnico_id) references app.membro (tenant_id, usuario_id),
  foreign key (tenant_id, situacao_id) references app.situacao (tenant_id, id),
  foreign key (tenant_id, criado_por) references app.membro (tenant_id, usuario_id),
  constraint os_estado_formato check (estado ~ '^[a-z][a-z_]{1,39}$'),
  constraint os_um_responsavel check ((tecnico_id is null) <> (equipe_id is null)),
  constraint os_motivo_tamanho check (
    motivo_cancelamento is null or length(btrim(motivo_cancelamento)) between 1 and 500
  ),
  constraint os_versao_positiva check (versao >= 1)
);
create index os_hotel_idx on app.os (tenant_id, hotel_id, criado_em desc);
create index os_chamado_idx on app.os (hotel_id, chamado_id);
create index os_tecnico_idx on app.os (tenant_id, tecnico_id) where tecnico_id is not null;
create index os_equipe_idx on app.os (hotel_id, equipe_id) where equipe_id is not null;
create unique index os_uma_ativa_por_chamado on app.os (hotel_id, chamado_id)
  where chamado_id is not null and estado <> 'cancelada';

alter table app.os enable row level security;
alter table app.os force row level security;

grant select, insert on app.os to hk_app;
grant update (estado, situacao_id, tecnico_id, equipe_id, motivo_cancelamento, versao,
              atualizado_em) on app.os to hk_app;
grant select on app.os to hk_worker;

create policy app_select on app.os for select to hk_app
  using (
    tenant_id = (select authz.tenant_id())
    and (hotel_id in (select authz.hoteis_leitura())
         or exists (select 1 from app.chamado c
                    where c.hotel_id = os.hotel_id and c.id = os.chamado_id
                      and (c.hotel_id in (select authz.hoteis_proprietario())
                           or c.local_id in (select lp.local_id
                                             from authz.locais_proprietario() lp))))
  );
create policy app_insert on app.os for insert to hk_app
  with check (tenant_id = (select authz.tenant_id())
              and hotel_id in (select authz.hoteis_com_papel(
                array['admin_grupo', 'gestor_csc', 'gerente_hotel']::app.papel[]))
              and criado_por = (select authz.usuario_id()));
create policy app_update on app.os for update to hk_app
  using (tenant_id = (select authz.tenant_id())
         and hotel_id in (select authz.hoteis_com_papel(
           array['admin_grupo', 'gestor_csc', 'gerente_hotel']::app.papel[])))
  with check (tenant_id = (select authz.tenant_id())
              and hotel_id in (select authz.hoteis_com_papel(
                array['admin_grupo', 'gestor_csc', 'gerente_hotel']::app.papel[])));
create policy worker_select on app.os for select to hk_worker
  using (tenant_id = (select authz.tenant_sistema()));

-- Triagem do chamado: classificar, ajustar a prioridade, cancelar e o reflexo
-- da OS no estado.
alter table app.chamado add column motivo_cancelamento text;
alter table app.chamado
  add constraint chamado_motivo_tamanho check (
    motivo_cancelamento is null or length(btrim(motivo_cancelamento)) between 1 and 500
  );

grant update (estado, situacao_id, prioridade_id, motivo_cancelamento, versao, atualizado_em)
  on app.chamado to hk_app;

create policy app_update on app.chamado for update to hk_app
  using (tenant_id = (select authz.tenant_id())
         and hotel_id in (select authz.hoteis_com_papel(
           array['admin_grupo', 'gestor_csc', 'gerente_hotel']::app.papel[])))
  with check (tenant_id = (select authz.tenant_id())
              and hotel_id in (select authz.hoteis_com_papel(
                array['admin_grupo', 'gestor_csc', 'gerente_hotel']::app.papel[])));

-- Quem recebe a OS: a aplicação confere se a pessoa tem papel de Técnico
-- vigente que cobre o hotel (triagem.ts). O Gestor CSC e o Gerente do hotel
-- passam a ler as atribuições de Técnico que cobrem os hotéis em que fazem a
-- triagem (por hotel, pela bandeira do hotel ou do grupo); nenhum outro papel
-- nem outra atribuição. O resto da policy segue como na fundação.
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
                          and h.id = atribuicao_escopo.hotel_id)))))
  );
