-- ============================================================================
-- RASCUNHO LOCAL, sem timestamp definitivo e fora de supabase/migrations.
-- Vai depois da app.insight, num branch int-* novo, só com a fila de zona
-- protegida livre e depois das migrações da instrumentação de que depende.
-- ----------------------------------------------------------------------------
-- HubKeep — Migração NNNN: resultado diário por ativo do Intelligence
-- (ADR-036, aprovado pelos dois; revisão de 06/10/2026)
-- ----------------------------------------------------------------------------
-- O que o job diário grava para cada ativo e cada dia (calcularDia e
-- executarDiaDoTenant, em packages/inteligencia). Os scores, as faixas e as
-- versões são do domínio; o banco guarda estrutura, integridade e escopo:
--   - só INSERT, para o hk_worker (o job): nada é atualizado nem apagado, por
--     nenhum papel. O resultado gravado de cada dia é a fonte de verdade do
--     histórico (ADR-036);
--   - a condição do Cesar de 07/10/2026: cada linha grava a versão da fórmula
--     de cada score (versao_formula_reincidencia e versao_formula_atencao) e a
--     versão da política usada (versao_politica, texto que o job monta com as
--     linhas de app.politica que resolveram; 'padrao' quando valem só os
--     padrões do código). A configuração usada vai no detalhamento de cada
--     score (detalhe_*, o Score.configuracao);
--   - recálculo: outra linha do mesmo ativo e dia, com o número de cálculo
--     seguinte e recalculo = true. O recálculo de um dia que nunca foi gravado
--     entra com calculo = 1 e recalculo = true. O painel mostra o
--     resultado original gravado de cada dia (o de menor número, que não é
--     recálculo); o recálculo só aparece no painel de investigação, sob demanda
--     e identificado (decisão de 07/10/2026, aprovada por Kaio e pelo
--     Cesar em 10/10/2026, #166). Nada é apagado;
--   - uma linha por (ativo, dia, cálculo): índice único, que também faz o job
--     rodar duas vezes no mesmo dia sem duplicar.
-- Lê (hk_app): quem tem leitura do hotel (authz.hoteis_leitura). O proprietário
--   não lê: o Intelligence é gerencial, como a app.insight.
-- A janela de leitura (180 dias, política inteligencia.metrica_janela_leitura,
--   ADR-036) é aplicada pelas consultas, não por policy: o banco não apaga e não
--   esconde por data.
-- Sem DELETE e sem UPDATE para ninguém; nenhuma função e nenhuma trigger; as
-- policies leem só funções authz (meta-teste 27).
-- A pendência de particionamento por mês (ADR-036) fica para quando o volume
--   pedir; se vier antes do piloto, a tabela nasce particionada, com o ajuste
--   dos meta-testes 1, 2 e 28.
-- ============================================================================

create table app.metrica_ativo_diaria (
  id                          uuid primary key,
  tenant_id                   uuid not null,
  hotel_id                    uuid not null,
  ativo_id                    uuid not null,
  dia                         date not null,
  calculo                     integer not null default 1,
  recalculo                   boolean not null default false,
  reincidencia                smallint,
  atencao                     smallint,
  faixa_atencao               text not null,
  versao_formula_reincidencia smallint not null,
  versao_formula_atencao      smallint not null,
  versao_politica             text not null,
  detalhe_reincidencia        jsonb not null,
  detalhe_atencao             jsonb not null,
  calculado_em                timestamptz not null default now(),
  unique (tenant_id, id),
  unique (hotel_id, ativo_id, dia, calculo),
  foreign key (tenant_id, hotel_id) references app.hotel (tenant_id, id),
  foreign key (hotel_id, ativo_id) references app.ativo (hotel_id, id),
  constraint metrica_calculo_positivo check (calculo >= 1),
  constraint metrica_scores_0_a_100 check (
    (reincidencia is null or reincidencia between 0 and 100)
    and (atencao is null or atencao between 0 and 100)),
  constraint metrica_versoes_positivas check (
    versao_formula_reincidencia >= 1 and versao_formula_atencao >= 1),
  constraint metrica_versao_politica_curta check (
    char_length(versao_politica) between 1 and 2000)
);
create index metrica_ativo_diaria_hotel_dia_idx
  on app.metrica_ativo_diaria (tenant_id, hotel_id, dia desc);

alter table app.metrica_ativo_diaria enable row level security;
alter table app.metrica_ativo_diaria force row level security;

grant select on app.metrica_ativo_diaria to hk_app;
grant select, insert on app.metrica_ativo_diaria to hk_worker;

create policy app_select on app.metrica_ativo_diaria for select to hk_app
  using (
    tenant_id = (select authz.tenant_id())
    and hotel_id in (select authz.hoteis_leitura())
  );

create policy worker_select on app.metrica_ativo_diaria for select to hk_worker
  using (tenant_id = (select authz.tenant_sistema()));
create policy worker_insert on app.metrica_ativo_diaria for insert to hk_worker
  with check (tenant_id = (select authz.tenant_sistema()));
