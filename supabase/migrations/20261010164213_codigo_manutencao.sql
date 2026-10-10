-- ============================================================================
-- HubKeep — Migração 0036: códigos de falha, causa e solução (fase 1b, I6)
-- ----------------------------------------------------------------------------
-- docs/12, I6, e o desenho do relatório de lacunas (docs/referencia/
-- lacunas-instrumentacao-intelligence.md, item 3). Decisões do Cesar de
-- 10/10/2026: no PWA, o técnico preenche os códigos como sugestão, e a
-- conclusão nunca é recusada por falta deles; com a política
-- os.codigos_obrigatorios ligada no hotel, o aceite no web exige falha, causa
-- e solução. As duas regras, a política e a coerência do código com a OS são
-- do domínio; aqui fica só a estrutura.
--
-- app.codigo_manutencao, do grupo (tenant), no modelo da situação e da
-- prioridade (0020, ADR-027):
--   - tipo: 'falha', 'causa' ou 'solucao'. A lista mora no domínio
--     (TIPOS_DE_CODIGO_DE_MANUTENCAO); o check repete os valores, e o teste
--     tests/valores-canonicos-banco.test.ts falha se os dois divergirem;
--   - categoria_id: a categoria de ativo a que o código serve (FK composta
--     (tenant_id, categoria_id), 0014); nulo vale para todas;
--   - chave_padrao, quando a linha é um dos códigos padrão do catálogo, e
--     nomes jsonb parcial, para o nome do tenant em cada idioma (ADR-027:
--     nome do tenant no idioma → nome do catálogo → nome no idioma padrão do
--     tenant). Cada código padrão entra uma vez por tipo no tenant (índice
--     único parcial). Todo código tem nome por uma das duas vias (check);
--   - ativa: desativação lógica, sem DELETE. O tipo, a categoria e a chave
--     padrão não mudam depois de criado (sem GRANT de UPDATE), para a OS que
--     aponta para o código não mudar de sentido por baixo: para mudar, cria-se
--     outro e desativa-se o antigo.
-- Lê: o Admin do grupo e quem lê algum hotel, inclusive o proprietário (ele
-- vê os códigos das OS que vê, como a situação). O worker lê no tenant do
-- job (Intelligence: reincidência por código de falha).
-- Grava (INSERT e UPDATE de nomes, ativa e atualizado_em): só o Admin do
-- grupo. Quem pode fazer cada ação continua sendo regra da aplicação; a
-- policy é a garantia.
--
-- app.os ganha codigo_falha_id, codigo_causa_id e codigo_solucao_id,
-- anuláveis, cada um com FK composta (tenant_id, …) → app.codigo_manutencao:
-- código de outro tenant é impossível. Que o código da coluna de falha seja
-- do tipo falha (e assim por diante), que esteja ativo e que sirva para a
-- categoria do ativo da OS são regras do domínio. GRANT de UPDATE nas três
-- colunas; quem grava continua sendo o app_update da OS (0026): a gestão do
-- hotel, o Técnico responsável e quem abriu o chamado. A aplicação só grava
-- os códigos na conclusão (técnico) e no aceite (risco aceito da 0023, 0026 e
-- 0034: o GRANT por coluna vale para todos os papéis do hk_app, e toda
-- gravação fica na auditoria). O worker já lê app.os inteira (0022).
-- Nenhuma policy de app.codigo_manutencao lê outra tabela do app, então não
-- há ciclo (meta-teste 27).
-- Só estrutura e autorização: nenhuma função, trigger ou regra de negócio.
-- ============================================================================

create table app.codigo_manutencao (
  id            uuid primary key,
  tenant_id     uuid not null references app.tenant (id),
  tipo          text not null,
  categoria_id  uuid,
  chave_padrao  text,
  nomes         jsonb not null default '{}',
  ativa         boolean not null default true,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (tenant_id, id),
  constraint codigo_manutencao_categoria_do_grupo
    foreign key (tenant_id, categoria_id) references app.categoria_ativo (tenant_id, id),
  constraint codigo_manutencao_tipo_lista check (tipo in ('falha', 'causa', 'solucao')),
  constraint codigo_manutencao_chave_padrao_formato check (chave_padrao ~ '^[a-z][a-z0-9_]{1,79}$'),
  constraint codigo_manutencao_nomes_objeto check (jsonb_typeof(nomes) = 'object'),
  constraint codigo_manutencao_tem_nome check (chave_padrao is not null or nomes <> '{}'::jsonb)
);
-- Cada código padrão entra uma vez por tipo no tenant.
create unique index codigo_manutencao_padrao_unico on app.codigo_manutencao (tenant_id, tipo, chave_padrao)
  where chave_padrao is not null;
-- A lista do aceite e do PWA: os códigos de um tipo, da categoria ou de todas.
create index codigo_manutencao_tipo_categoria_idx on app.codigo_manutencao (tenant_id, tipo, categoria_id);

alter table app.codigo_manutencao enable row level security;
alter table app.codigo_manutencao force row level security;

grant select, insert on app.codigo_manutencao to hk_app;
grant update (nomes, ativa, atualizado_em) on app.codigo_manutencao to hk_app;
grant select on app.codigo_manutencao to hk_worker;

create policy app_select on app.codigo_manutencao for select to hk_app
  using (
    tenant_id = (select authz.tenant_id())
    and ((select authz.eh_admin_grupo())
         or exists (select 1 from authz.hoteis_leitura())
         or exists (select 1 from authz.locais_proprietario())
         or exists (select 1 from authz.hoteis_proprietario()))
  );
create policy app_insert on app.codigo_manutencao for insert to hk_app
  with check (tenant_id = (select authz.tenant_id()) and (select authz.eh_admin_grupo()));
create policy app_update on app.codigo_manutencao for update to hk_app
  using (tenant_id = (select authz.tenant_id()) and (select authz.eh_admin_grupo()))
  with check (tenant_id = (select authz.tenant_id()));
create policy worker_select on app.codigo_manutencao for select to hk_worker
  using (tenant_id = (select authz.tenant_sistema()));

-- OS: os três códigos.
alter table app.os
  add column codigo_falha_id uuid,
  add column codigo_causa_id uuid,
  add column codigo_solucao_id uuid;
alter table app.os
  add constraint os_codigo_falha_do_grupo
    foreign key (tenant_id, codigo_falha_id) references app.codigo_manutencao (tenant_id, id),
  add constraint os_codigo_causa_do_grupo
    foreign key (tenant_id, codigo_causa_id) references app.codigo_manutencao (tenant_id, id),
  add constraint os_codigo_solucao_do_grupo
    foreign key (tenant_id, codigo_solucao_id) references app.codigo_manutencao (tenant_id, id);
-- Reincidência por código de falha (Intelligence).
create index os_codigo_falha_idx on app.os (tenant_id, codigo_falha_id) where codigo_falha_id is not null;
grant update (codigo_falha_id, codigo_causa_id, codigo_solucao_id) on app.os to hk_app;
