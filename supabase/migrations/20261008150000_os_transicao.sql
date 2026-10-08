-- ============================================================================
-- HubKeep — Migração 0031: transições da OS (fase 1b, I5; instrumentação do
-- Intelligence)
-- ----------------------------------------------------------------------------
-- Cada mudança de estado da OS (gerar, reatribuir, iniciar, pausar, retomar,
-- concluir, aceitar, reabrir, cancelar) grava uma linha: a ação, o estado de
-- antes (nulo na geração), o de depois, quando e quem. A linha é gravada pelo
-- caso de uso, na mesma unit of work que muda o estado da OS, junto com a
-- auditoria e o evento (regra 6). É a fonte do MTTR e da conclusão e das
-- reaberturas que o Intelligence lê (decisão do Cesar de 06/10/2026: o job lê
-- as transições, sem abrir a auditoria ao worker).
--   - acao, de e para guardam só o formato, como o estado da OS (0022): a
--     lista de ações e de estados, e quais transições valem, é do domínio
--     (corretiva.ts), com teste de paridade;
--   - quando é a hora da transação no servidor (now()), a mesma de
--     os.atualizado_em;
--   - só INSERT: nenhum papel altera nem apaga uma transição (meta-teste 32).
-- Lê: quem lê a OS (a policy repete o recorte da OS pelo exists em app.os,
-- que passa pela RLS da OS). Grava: quem tem escrita no hotel, em nome dele
-- mesmo, numa OS que ele lê; quem pode fazer cada ação é regra da aplicação,
-- e o UPDATE da OS na mesma transação continua decidindo pela policy dela.
-- O worker lê só o tenant do job.
-- A policy lê app.os; nenhuma policy lê app.os_transicao, então não há ciclo
-- (meta-teste 27).
-- As OS que já existem ficam sem transições: não há dado real antes do piloto.
-- Só estrutura e autorização: nenhuma função, trigger ou regra de negócio.
-- ============================================================================

create table app.os_transicao (
  id         uuid primary key,
  tenant_id  uuid not null,
  hotel_id   uuid not null,
  os_id      uuid not null,
  acao       text not null,
  de         text,
  para       text not null,
  quando     timestamptz not null default now(),
  usuario_id uuid not null,
  unique (tenant_id, id),
  unique (hotel_id, id),
  foreign key (tenant_id, hotel_id) references app.hotel (tenant_id, id),
  foreign key (hotel_id, os_id) references app.os (hotel_id, id),
  foreign key (tenant_id, usuario_id) references app.membro (tenant_id, usuario_id),
  constraint os_transicao_acao_formato check (acao ~ '^[a-z][a-z_]{1,39}$'),
  constraint os_transicao_de_formato check (de is null or de ~ '^[a-z][a-z_]{1,39}$'),
  constraint os_transicao_para_formato check (para ~ '^[a-z][a-z_]{1,39}$')
);
create index os_transicao_os_idx on app.os_transicao (hotel_id, os_id, quando);
create index os_transicao_tenant_idx on app.os_transicao (tenant_id, quando);

alter table app.os_transicao enable row level security;
alter table app.os_transicao force row level security;

grant select, insert on app.os_transicao to hk_app;
grant select on app.os_transicao to hk_worker;

create policy app_select on app.os_transicao for select to hk_app
  using (
    tenant_id = (select authz.tenant_id())
    and exists (select 1 from app.os o
                where o.hotel_id = os_transicao.hotel_id and o.id = os_transicao.os_id)
  );

create policy app_insert on app.os_transicao for insert to hk_app
  with check (
    tenant_id = (select authz.tenant_id())
    and hotel_id in (select authz.hoteis_escrita())
    and usuario_id = (select authz.usuario_id())
    and exists (select 1 from app.os o
                where o.hotel_id = os_transicao.hotel_id and o.id = os_transicao.os_id)
  );

create policy worker_select on app.os_transicao for select to hk_worker
  using (tenant_id = (select authz.tenant_sistema()));
