-- ============================================================================
-- HubKeep — Migração 0044: alertas do monitor de SLA e índices da auditoria
-- geral (fase 1c; ADR-043)
-- ----------------------------------------------------------------------------
-- Decisões M1 a M4 do Cesar de 13/10/2026 (docs/13-plano-fase-1c.md). O
-- monitor roda no cron do SLA, com o hk_worker, um tenant por transação, e lê
-- os prazos gravados no chamado (0043). Quando e para quem avisar é regra do
-- domínio (packages/dominio) e da política chamado.escalonamento; o banco
-- guarda o que foi emitido, com estrutura, integridade e escopo:
--   - app.sla_alerta: um aviso por chamado, tipo e prazo (M1, M2). Os quatro
--     tipos são o atendimento e a solução em risco e vencidos; a lista é do
--     domínio, e o check repete os valores (tests/valores-canonicos-banco).
--     A chave única faz o cron rodar de novo sem repetir o aviso; o prazo
--     refeito na triagem ou na retomada é outro prazo e pode ter o aviso dele;
--   - só INSERT, para o hk_worker: nada é atualizado nem apagado, por nenhum
--     papel (meta-teste 32). O worker não ganha UPDATE no chamado (M2);
--   - lê (hk_app) a gestão, como o painel (decisão 12): o Admin do grupo, o
--     Gestor CSC e o Gerente com o hotel. O Técnico, o solicitante, o
--     implantador e o proprietário não leem: o selo da ficha sai dos prazos
--     gravados no chamado, que eles já leem (M4);
--   - o evento de domínio do aviso vai no outbox, na mesma transação, para o
--     e-mail e o push da comunicação consumirem depois (M4).
-- Índices da auditoria geral (decisões 12 e 13; 1c, #211): a lista da tela é
-- por tenant, da mais nova para a mais antiga, com o cursor (em, id); o
-- filtro por hotel tem índice próprio.
-- Sem DELETE e sem UPDATE para ninguém; nenhuma função e nenhuma trigger; as
-- policies leem só funções authz (meta-teste 27).
-- ============================================================================

create table app.sla_alerta (
  id          uuid primary key,
  tenant_id   uuid not null,
  hotel_id    uuid not null,
  chamado_id  uuid not null,
  tipo        text not null,
  prazo       timestamptz not null,
  emitido_em  timestamptz not null default now(),
  unique (tenant_id, id),
  unique (chamado_id, tipo, prazo),
  foreign key (tenant_id, hotel_id) references app.hotel (tenant_id, id),
  foreign key (hotel_id, chamado_id) references app.chamado (hotel_id, id),
  constraint sla_alerta_tipo_lista check (tipo in ('atendimento_em_risco', 'atendimento_vencido', 'solucao_em_risco', 'solucao_vencida'))
);
create index sla_alerta_hotel_emitido_idx
  on app.sla_alerta (tenant_id, hotel_id, emitido_em desc);

alter table app.sla_alerta enable row level security;
alter table app.sla_alerta force row level security;

grant select on app.sla_alerta to hk_app;
grant select, insert on app.sla_alerta to hk_worker;

-- Lê a gestão: Admin do grupo, Gestor CSC e Gerente com o hotel.
create policy app_select on app.sla_alerta for select to hk_app
  using (
    tenant_id = (select authz.tenant_id())
    and hotel_id in (select authz.hoteis_com_papel(
          array['admin_grupo', 'gestor_csc', 'gerente_hotel']::app.papel[]))
  );

create policy worker_select on app.sla_alerta for select to hk_worker
  using (tenant_id = (select authz.tenant_sistema()));
create policy worker_insert on app.sla_alerta for insert to hk_worker
  with check (tenant_id = (select authz.tenant_sistema()));

-- Auditoria geral: a lista por tenant e o filtro por hotel, na ordem do cursor.
create index auditoria_tenant_em_idx on app.auditoria (tenant_id, em desc, id desc);
create index auditoria_tenant_hotel_em_idx on app.auditoria (tenant_id, hotel_id, em desc, id desc);
