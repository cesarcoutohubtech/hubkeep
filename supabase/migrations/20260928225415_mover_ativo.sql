-- ============================================================================
-- HubKeep — Migração 0016: mover ativo dentro do hotel (fase 1a, B3c; adendo
-- ao ADR-011)
-- ----------------------------------------------------------------------------
-- Decisão do Cesar (28/09/2026): o ativo pode mudar de local, só dentro do
-- mesmo hotel, por uma ação própria de mover, restrita a quem gere o hotel,
-- auditada e com registro de cada movimentação. Entre hotéis, continua
-- desativar e cadastrar de novo.
--   - app.ativo.local_id passa a receber UPDATE do hk_app. É a segunda exceção
--     nomeada do meta-teste 18 (a primeira é app.hotel.bandeira_id). O
--     hotel_id continua imutável, e a FK (hotel_id, local_id) → app.local, da
--     0015, garante que o destino é do mesmo hotel: um local de outro hotel é
--     recusado pelo próprio PostgreSQL, com ou sem a checagem da aplicação;
--   - o local decide o que o proprietário vê (ADR-031): o dono da UH antiga
--     deixa de ver o ativo na transação seguinte, e o da nova passa a ver;
--   - app.ativo_movimentacao: uma linha por movimentação (origem, destino,
--     quando, quem), gravada na mesma unit of work da mudança do ativo. Só
--     INSERT: a linha nasce e não muda. A FK composta impede ativo e locais de
--     outro hotel; a RLS exige que quem grava seja o usuário do contexto.
-- Lê a movimentação quem lê o hotel. O proprietário não lê no MVP (o mesmo
-- critério das políticas: sem uso concreto). Quem pode mover (os papéis que
-- gerem o hotel) é regra de ação, no domínio (regra 2).
-- Só estrutura e autorização: nenhuma função, trigger ou regra de negócio.
-- ============================================================================

grant update (local_id) on app.ativo to hk_app;

create table app.ativo_movimentacao (
  id               uuid primary key,
  tenant_id        uuid not null,
  hotel_id         uuid not null,
  ativo_id         uuid not null,
  local_origem_id  uuid not null,
  local_destino_id uuid not null,
  usuario_id       uuid not null,
  movido_em        timestamptz not null default now(),
  foreign key (tenant_id, hotel_id) references app.hotel (tenant_id, id),
  foreign key (hotel_id, ativo_id) references app.ativo (hotel_id, id),
  foreign key (hotel_id, local_origem_id) references app.local (hotel_id, id),
  foreign key (hotel_id, local_destino_id) references app.local (hotel_id, id),
  foreign key (tenant_id, usuario_id) references app.membro (tenant_id, usuario_id),
  constraint ativo_movimentacao_locais_distintos check (local_origem_id <> local_destino_id)
);
create index ativo_movimentacao_ativo_idx on app.ativo_movimentacao (hotel_id, ativo_id, movido_em);

alter table app.ativo_movimentacao enable row level security;
alter table app.ativo_movimentacao force row level security;

grant select, insert on app.ativo_movimentacao to hk_app;
grant select on app.ativo_movimentacao to hk_worker;

create policy app_select on app.ativo_movimentacao for select to hk_app
  using (tenant_id = (select authz.tenant_id())
         and hotel_id in (select authz.hoteis_leitura()));
create policy app_insert on app.ativo_movimentacao for insert to hk_app
  with check (tenant_id = (select authz.tenant_id())
              and hotel_id in (select authz.hoteis_escrita())
              and usuario_id = (select authz.usuario_id()));
create policy worker_select on app.ativo_movimentacao for select to hk_worker
  using (tenant_id = (select authz.tenant_sistema()));
