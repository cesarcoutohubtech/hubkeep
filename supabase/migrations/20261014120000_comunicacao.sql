-- ============================================================================
-- HubKeep — Migração 0049: registro dos envios e inscrições de push (fase 1c,
-- item 5, a comunicação; ADR-046)
-- ----------------------------------------------------------------------------
-- Decisões C1 a C9 do Cesar, de 13/10/2026
-- (docs/referencia/propostas-comunicacao-1c.md, "Decisões aprovadas"). Quem
-- recebe cada aviso, em que canal e em que idioma é regra do domínio e da
-- política chamado.escalonamento; o envio é do worker, pelo outbox. O banco
-- guarda o que foi tentado e onde o push chega, com estrutura, integridade e
-- escopo:
--   - app.envio_notificacao (C3): um registro por tentativa de envio de um
--     evento a um destinatário num canal, só de inserção (meta-teste 32). O
--     índice único parcial impede o segundo envio do mesmo evento, à mesma
--     pessoa, no mesmo canal, quando o outbox entrega o evento de novo; a
--     falha não entra nele, e a nova tentativa grava outra linha. O texto do
--     e-mail não fica gravado, só o tipo do evento e a situação. Os canais e
--     as situações são listas do domínio, e os checks repetem os valores
--     (teste de paridade no PR do código). O índice por destinatário e dia
--     serve à contagem do piloto (C8: acima de 30 por pessoa e por dia, abre
--     o resumo agrupado). Lê a gestão, como os avisos de SLA (0044): o Admin
--     do grupo, o Gestor CSC e o Gerente com o hotel. Grava só o hk_worker;
--   - app.inscricao_push (C4): onde o push do PWA do técnico chega, uma por
--     aparelho. Cada pessoa lê, cria e revoga só as próprias (como a
--     preferência do membro, 0005); a revogação é lógica (revogada_em). O
--     worker lê as do tenant do job e revoga a que o serviço de push recusa
--     (404 ou 410). Uma inscrição ativa por pessoa e endpoint.
-- Sem envio (C1, até o Cesar configurar o SES), o worker grava a situação
-- sem_provedor. Campos de escopo sem UPDATE (meta-teste 18); sem DELETE;
-- nenhuma função e nenhuma trigger; as policies leem só funções authz
-- (meta-teste 27).
-- ============================================================================

create table app.envio_notificacao (
  id            uuid primary key,
  tenant_id     uuid not null,
  hotel_id      uuid not null,
  evento_id     uuid not null,
  tipo_evento   text not null,
  usuario_id    uuid not null,
  canal         text not null,
  situacao      text not null,
  criado_em     timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, hotel_id) references app.hotel (tenant_id, id),
  foreign key (tenant_id, usuario_id) references app.membro (tenant_id, usuario_id),
  constraint envio_notificacao_canal_lista check (canal in ('email', 'push')),
  constraint envio_notificacao_situacao_lista check (situacao in ('enviado', 'sem_provedor', 'sem_endereco', 'falhou'))
);
create unique index envio_notificacao_uma_vez_uk
  on app.envio_notificacao (tenant_id, evento_id, usuario_id, canal)
  where situacao <> 'falhou';
create index envio_notificacao_destinatario_dia_idx
  on app.envio_notificacao (tenant_id, usuario_id, criado_em desc);
create index envio_notificacao_hotel_idx
  on app.envio_notificacao (tenant_id, hotel_id, criado_em desc);

alter table app.envio_notificacao enable row level security;
alter table app.envio_notificacao force row level security;

grant select on app.envio_notificacao to hk_app;
grant select, insert on app.envio_notificacao to hk_worker;

-- Lê a gestão: Admin do grupo, Gestor CSC e Gerente com o hotel.
create policy app_select on app.envio_notificacao for select to hk_app
  using (
    tenant_id = (select authz.tenant_id())
    and hotel_id in (select authz.hoteis_com_papel(
          array['admin_grupo', 'gestor_csc', 'gerente_hotel']::app.papel[]))
  );

create policy worker_select on app.envio_notificacao for select to hk_worker
  using (tenant_id = (select authz.tenant_sistema()));
create policy worker_insert on app.envio_notificacao for insert to hk_worker
  with check (tenant_id = (select authz.tenant_sistema()));

create table app.inscricao_push (
  id            uuid primary key,
  tenant_id     uuid not null,
  usuario_id    uuid not null,
  endpoint      text not null,
  chave_p256dh  text not null,
  chave_auth    text not null,
  criado_em     timestamptz not null default now(),
  revogada_em   timestamptz,
  unique (tenant_id, id),
  foreign key (tenant_id, usuario_id) references app.membro (tenant_id, usuario_id)
);
create unique index inscricao_push_ativa_uk
  on app.inscricao_push (tenant_id, usuario_id, endpoint)
  where revogada_em is null;

alter table app.inscricao_push enable row level security;
alter table app.inscricao_push force row level security;

grant select, insert on app.inscricao_push to hk_app;
grant update (revogada_em) on app.inscricao_push to hk_app;
grant select on app.inscricao_push to hk_worker;
grant update (revogada_em) on app.inscricao_push to hk_worker;

-- Cada pessoa: só as próprias inscrições.
create policy app_select on app.inscricao_push for select to hk_app
  using (tenant_id = (select authz.tenant_id()) and usuario_id = (select authz.usuario_id()));
create policy app_insert on app.inscricao_push for insert to hk_app
  with check (tenant_id = (select authz.tenant_id()) and usuario_id = (select authz.usuario_id()));
create policy app_update on app.inscricao_push for update to hk_app
  using (tenant_id = (select authz.tenant_id()) and usuario_id = (select authz.usuario_id()))
  with check (tenant_id = (select authz.tenant_id()) and usuario_id = (select authz.usuario_id()));

-- O worker: as do tenant do job, para enviar e revogar a recusada.
create policy worker_select on app.inscricao_push for select to hk_worker
  using (tenant_id = (select authz.tenant_sistema()));
create policy worker_update on app.inscricao_push for update to hk_worker
  using (tenant_id = (select authz.tenant_sistema()))
  with check (tenant_id = (select authz.tenant_sistema()));
