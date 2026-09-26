-- ============================================================================
-- HubKeep — Migração 0006: operações offline recebidas (F0-11, ADR-025)
-- ----------------------------------------------------------------------------
-- O PWA do técnico guarda cada operação feita sem rede numa fila (IndexedDB),
-- com uma chave de idempotência gerada no aparelho, e a reenvia até receber
-- resposta. A API grava a chave aqui, NA MESMA TRANSAÇÃO do efeito da operação
-- (unit of work): se a resposta se perde e o aparelho reenvia, a segunda vez
-- encontra a chave, não repete o efeito e devolve a resposta guardada.
--
-- A chave é do usuário: a chave primária leva tenant e usuário, e cada um só
-- vê e grava as próprias linhas. Uma chave igual de outro usuário não colide
-- nem revela nada. Sem UPDATE: a linha nasce com a resposta e não muda.
-- Só estrutura e autorização por escopo: nenhuma função, trigger ou regra de
-- negócio nova.
-- ============================================================================
create table app.operacao_offline (
  tenant_id   uuid not null,
  usuario_id  uuid not null,
  chave       uuid not null,
  tipo        text not null,
  resposta    jsonb not null,
  recebida_em timestamptz not null default now(),
  primary key (tenant_id, usuario_id, chave),
  foreign key (tenant_id, usuario_id) references app.membro (tenant_id, usuario_id),
  constraint operacao_offline_tipo_formato check (tipo ~ '^[a-z_]+(\.[a-z_]+)+$')
);

alter table app.operacao_offline enable row level security;
alter table app.operacao_offline force row level security;

grant select, insert on app.operacao_offline to hk_app;

create policy app_select on app.operacao_offline for select to hk_app
  using (tenant_id = (select authz.tenant_id()) and usuario_id = (select authz.usuario_id()));
create policy app_insert on app.operacao_offline for insert to hk_app
  with check (tenant_id = (select authz.tenant_id()) and usuario_id = (select authz.usuario_id()));
