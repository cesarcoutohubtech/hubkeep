-- ============================================================================
-- HubKeep — Migração 0061: a métrica diária particionada por mês (adendo de
-- 20/10/2026 ao ADR-036; opção A de docs/referencia/retencao-metrica-diaria.md)
-- ----------------------------------------------------------------------------
-- Decisões de 20/10/2026, no chat do agente do Intelligence: particionar antes
-- do piloto (Cesar, "Particionada"); com a partição padrão (Cesar e Kaio); as
-- partições até dezembro de 2027 e esta migração agora (as recomendações da
-- proposta, que o Cesar pode mudar no PR).
--
-- O que muda e o que não muda:
--   - app.metrica_ativo_diaria passa a ser particionada por intervalo de dia,
--     uma partição por mês, de janeiro de 2024 (antes de qualquer histórico de
--     demonstração ou de carga) a dezembro de 2027. O nome, as colunas, os
--     checks, as FKs, os grants e as policies não mudam: o Kysely, o job e o
--     painel continuam iguais.
--   - A chave de tabela particionada precisa levar a coluna da partição: a PK
--     passa de (id) a (id, dia) e a chave (tenant_id, id) a (tenant_id, id,
--     dia). Nenhuma tabela aponta FK para a métrica.
--   - A partição padrão (app.metrica_ativo_diaria_padrao) guarda a linha de
--     um dia fora dos meses criados, para o job não falhar se a migração do
--     ano seguinte atrasar. O registro da execução do job diz quantas linhas
--     do dia foram para ela (metricasNaParticaoPadrao): é o aviso para criar o
--     ano. Antes de criar o mês de uma linha que esteja nela, a linha sai da
--     padrão na mesma migração (o Postgres recusa a partição nova sobre
--     linhas da padrão).
--   - Grants e policies ficam na tabela-mãe, como antes. As partições têm RLS
--     habilitada e forçada e nenhum grant: ninguém da aplicação lê nem grava
--     por fora da mãe (meta-teste 35, pgTAP 032).
--   - Nenhum papel da aplicação cria partição, nem o job: o ano seguinte vem
--     numa migração nova. Nada é apagado (opção B, aprovada); remover a
--     partição que sair da janela, se um dia for decidido, é operação do
--     responsável, nunca de papel da aplicação.
-- A troca: a tabela atual vira app.metrica_ativo_diaria_antiga (com os
-- índices renomeados), a nova nasce com o nome de sempre, as linhas passam
-- para ela e a antiga é apagada. Só estrutura: nenhuma função, trigger ou
-- regra de negócio.
-- ============================================================================

alter table app.metrica_ativo_diaria rename to metrica_ativo_diaria_antiga;
alter index app.metrica_ativo_diaria_pkey rename to metrica_ativo_diaria_antiga_pkey;
alter index app.metrica_ativo_diaria_tenant_id_id_key rename to metrica_ativo_diaria_antiga_tenant_id_id_key;
alter index app.metrica_ativo_diaria_hotel_id_ativo_id_dia_calculo_key
  rename to metrica_ativo_diaria_antiga_hotel_id_ativo_id_dia_calculo_key;
alter index app.metrica_ativo_diaria_hotel_dia_idx rename to metrica_ativo_diaria_antiga_hotel_dia_idx;

create table app.metrica_ativo_diaria (
  id                          uuid not null,
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
  primary key (id, dia),
  unique (tenant_id, id, dia),
  unique (hotel_id, ativo_id, dia, calculo),
  -- Os nomes de antes: sem eles, o Postgres acrescentaria "1", porque as FKs
  -- da tabela antiga ainda existem neste ponto.
  constraint metrica_ativo_diaria_tenant_id_hotel_id_fkey
    foreign key (tenant_id, hotel_id) references app.hotel (tenant_id, id),
  constraint metrica_ativo_diaria_hotel_id_ativo_id_fkey
    foreign key (hotel_id, ativo_id) references app.ativo (hotel_id, id),
  constraint metrica_calculo_positivo check (calculo >= 1),
  constraint metrica_scores_0_a_100 check (
    (reincidencia is null or reincidencia between 0 and 100)
    and (atencao is null or atencao between 0 and 100)),
  constraint metrica_versoes_positivas check (
    versao_formula_reincidencia >= 1 and versao_formula_atencao >= 1),
  constraint metrica_versao_politica_curta check (
    char_length(versao_politica) between 1 and 2000)
) partition by range (dia);
create index metrica_ativo_diaria_hotel_dia_idx
  on app.metrica_ativo_diaria (tenant_id, hotel_id, dia desc);

-- Um mês por partição: [dia 1 do mês, dia 1 do mês seguinte).
create table app.metrica_ativo_diaria_2024_01 partition of app.metrica_ativo_diaria
  for values from ('2024-01-01') to ('2024-02-01');
create table app.metrica_ativo_diaria_2024_02 partition of app.metrica_ativo_diaria
  for values from ('2024-02-01') to ('2024-03-01');
create table app.metrica_ativo_diaria_2024_03 partition of app.metrica_ativo_diaria
  for values from ('2024-03-01') to ('2024-04-01');
create table app.metrica_ativo_diaria_2024_04 partition of app.metrica_ativo_diaria
  for values from ('2024-04-01') to ('2024-05-01');
create table app.metrica_ativo_diaria_2024_05 partition of app.metrica_ativo_diaria
  for values from ('2024-05-01') to ('2024-06-01');
create table app.metrica_ativo_diaria_2024_06 partition of app.metrica_ativo_diaria
  for values from ('2024-06-01') to ('2024-07-01');
create table app.metrica_ativo_diaria_2024_07 partition of app.metrica_ativo_diaria
  for values from ('2024-07-01') to ('2024-08-01');
create table app.metrica_ativo_diaria_2024_08 partition of app.metrica_ativo_diaria
  for values from ('2024-08-01') to ('2024-09-01');
create table app.metrica_ativo_diaria_2024_09 partition of app.metrica_ativo_diaria
  for values from ('2024-09-01') to ('2024-10-01');
create table app.metrica_ativo_diaria_2024_10 partition of app.metrica_ativo_diaria
  for values from ('2024-10-01') to ('2024-11-01');
create table app.metrica_ativo_diaria_2024_11 partition of app.metrica_ativo_diaria
  for values from ('2024-11-01') to ('2024-12-01');
create table app.metrica_ativo_diaria_2024_12 partition of app.metrica_ativo_diaria
  for values from ('2024-12-01') to ('2025-01-01');
create table app.metrica_ativo_diaria_2025_01 partition of app.metrica_ativo_diaria
  for values from ('2025-01-01') to ('2025-02-01');
create table app.metrica_ativo_diaria_2025_02 partition of app.metrica_ativo_diaria
  for values from ('2025-02-01') to ('2025-03-01');
create table app.metrica_ativo_diaria_2025_03 partition of app.metrica_ativo_diaria
  for values from ('2025-03-01') to ('2025-04-01');
create table app.metrica_ativo_diaria_2025_04 partition of app.metrica_ativo_diaria
  for values from ('2025-04-01') to ('2025-05-01');
create table app.metrica_ativo_diaria_2025_05 partition of app.metrica_ativo_diaria
  for values from ('2025-05-01') to ('2025-06-01');
create table app.metrica_ativo_diaria_2025_06 partition of app.metrica_ativo_diaria
  for values from ('2025-06-01') to ('2025-07-01');
create table app.metrica_ativo_diaria_2025_07 partition of app.metrica_ativo_diaria
  for values from ('2025-07-01') to ('2025-08-01');
create table app.metrica_ativo_diaria_2025_08 partition of app.metrica_ativo_diaria
  for values from ('2025-08-01') to ('2025-09-01');
create table app.metrica_ativo_diaria_2025_09 partition of app.metrica_ativo_diaria
  for values from ('2025-09-01') to ('2025-10-01');
create table app.metrica_ativo_diaria_2025_10 partition of app.metrica_ativo_diaria
  for values from ('2025-10-01') to ('2025-11-01');
create table app.metrica_ativo_diaria_2025_11 partition of app.metrica_ativo_diaria
  for values from ('2025-11-01') to ('2025-12-01');
create table app.metrica_ativo_diaria_2025_12 partition of app.metrica_ativo_diaria
  for values from ('2025-12-01') to ('2026-01-01');
create table app.metrica_ativo_diaria_2026_01 partition of app.metrica_ativo_diaria
  for values from ('2026-01-01') to ('2026-02-01');
create table app.metrica_ativo_diaria_2026_02 partition of app.metrica_ativo_diaria
  for values from ('2026-02-01') to ('2026-03-01');
create table app.metrica_ativo_diaria_2026_03 partition of app.metrica_ativo_diaria
  for values from ('2026-03-01') to ('2026-04-01');
create table app.metrica_ativo_diaria_2026_04 partition of app.metrica_ativo_diaria
  for values from ('2026-04-01') to ('2026-05-01');
create table app.metrica_ativo_diaria_2026_05 partition of app.metrica_ativo_diaria
  for values from ('2026-05-01') to ('2026-06-01');
create table app.metrica_ativo_diaria_2026_06 partition of app.metrica_ativo_diaria
  for values from ('2026-06-01') to ('2026-07-01');
create table app.metrica_ativo_diaria_2026_07 partition of app.metrica_ativo_diaria
  for values from ('2026-07-01') to ('2026-08-01');
create table app.metrica_ativo_diaria_2026_08 partition of app.metrica_ativo_diaria
  for values from ('2026-08-01') to ('2026-09-01');
create table app.metrica_ativo_diaria_2026_09 partition of app.metrica_ativo_diaria
  for values from ('2026-09-01') to ('2026-10-01');
create table app.metrica_ativo_diaria_2026_10 partition of app.metrica_ativo_diaria
  for values from ('2026-10-01') to ('2026-11-01');
create table app.metrica_ativo_diaria_2026_11 partition of app.metrica_ativo_diaria
  for values from ('2026-11-01') to ('2026-12-01');
create table app.metrica_ativo_diaria_2026_12 partition of app.metrica_ativo_diaria
  for values from ('2026-12-01') to ('2027-01-01');
create table app.metrica_ativo_diaria_2027_01 partition of app.metrica_ativo_diaria
  for values from ('2027-01-01') to ('2027-02-01');
create table app.metrica_ativo_diaria_2027_02 partition of app.metrica_ativo_diaria
  for values from ('2027-02-01') to ('2027-03-01');
create table app.metrica_ativo_diaria_2027_03 partition of app.metrica_ativo_diaria
  for values from ('2027-03-01') to ('2027-04-01');
create table app.metrica_ativo_diaria_2027_04 partition of app.metrica_ativo_diaria
  for values from ('2027-04-01') to ('2027-05-01');
create table app.metrica_ativo_diaria_2027_05 partition of app.metrica_ativo_diaria
  for values from ('2027-05-01') to ('2027-06-01');
create table app.metrica_ativo_diaria_2027_06 partition of app.metrica_ativo_diaria
  for values from ('2027-06-01') to ('2027-07-01');
create table app.metrica_ativo_diaria_2027_07 partition of app.metrica_ativo_diaria
  for values from ('2027-07-01') to ('2027-08-01');
create table app.metrica_ativo_diaria_2027_08 partition of app.metrica_ativo_diaria
  for values from ('2027-08-01') to ('2027-09-01');
create table app.metrica_ativo_diaria_2027_09 partition of app.metrica_ativo_diaria
  for values from ('2027-09-01') to ('2027-10-01');
create table app.metrica_ativo_diaria_2027_10 partition of app.metrica_ativo_diaria
  for values from ('2027-10-01') to ('2027-11-01');
create table app.metrica_ativo_diaria_2027_11 partition of app.metrica_ativo_diaria
  for values from ('2027-11-01') to ('2027-12-01');
create table app.metrica_ativo_diaria_2027_12 partition of app.metrica_ativo_diaria
  for values from ('2027-12-01') to ('2028-01-01');

-- A partição padrão: o dia fora dos meses acima.
create table app.metrica_ativo_diaria_padrao partition of app.metrica_ativo_diaria default;

alter table app.metrica_ativo_diaria enable row level security;
alter table app.metrica_ativo_diaria force row level security;
-- Cada partição também, para ninguém ler direto por ela (e nenhum grant nela).
alter table app.metrica_ativo_diaria_2024_01 enable row level security;
alter table app.metrica_ativo_diaria_2024_01 force row level security;
alter table app.metrica_ativo_diaria_2024_02 enable row level security;
alter table app.metrica_ativo_diaria_2024_02 force row level security;
alter table app.metrica_ativo_diaria_2024_03 enable row level security;
alter table app.metrica_ativo_diaria_2024_03 force row level security;
alter table app.metrica_ativo_diaria_2024_04 enable row level security;
alter table app.metrica_ativo_diaria_2024_04 force row level security;
alter table app.metrica_ativo_diaria_2024_05 enable row level security;
alter table app.metrica_ativo_diaria_2024_05 force row level security;
alter table app.metrica_ativo_diaria_2024_06 enable row level security;
alter table app.metrica_ativo_diaria_2024_06 force row level security;
alter table app.metrica_ativo_diaria_2024_07 enable row level security;
alter table app.metrica_ativo_diaria_2024_07 force row level security;
alter table app.metrica_ativo_diaria_2024_08 enable row level security;
alter table app.metrica_ativo_diaria_2024_08 force row level security;
alter table app.metrica_ativo_diaria_2024_09 enable row level security;
alter table app.metrica_ativo_diaria_2024_09 force row level security;
alter table app.metrica_ativo_diaria_2024_10 enable row level security;
alter table app.metrica_ativo_diaria_2024_10 force row level security;
alter table app.metrica_ativo_diaria_2024_11 enable row level security;
alter table app.metrica_ativo_diaria_2024_11 force row level security;
alter table app.metrica_ativo_diaria_2024_12 enable row level security;
alter table app.metrica_ativo_diaria_2024_12 force row level security;
alter table app.metrica_ativo_diaria_2025_01 enable row level security;
alter table app.metrica_ativo_diaria_2025_01 force row level security;
alter table app.metrica_ativo_diaria_2025_02 enable row level security;
alter table app.metrica_ativo_diaria_2025_02 force row level security;
alter table app.metrica_ativo_diaria_2025_03 enable row level security;
alter table app.metrica_ativo_diaria_2025_03 force row level security;
alter table app.metrica_ativo_diaria_2025_04 enable row level security;
alter table app.metrica_ativo_diaria_2025_04 force row level security;
alter table app.metrica_ativo_diaria_2025_05 enable row level security;
alter table app.metrica_ativo_diaria_2025_05 force row level security;
alter table app.metrica_ativo_diaria_2025_06 enable row level security;
alter table app.metrica_ativo_diaria_2025_06 force row level security;
alter table app.metrica_ativo_diaria_2025_07 enable row level security;
alter table app.metrica_ativo_diaria_2025_07 force row level security;
alter table app.metrica_ativo_diaria_2025_08 enable row level security;
alter table app.metrica_ativo_diaria_2025_08 force row level security;
alter table app.metrica_ativo_diaria_2025_09 enable row level security;
alter table app.metrica_ativo_diaria_2025_09 force row level security;
alter table app.metrica_ativo_diaria_2025_10 enable row level security;
alter table app.metrica_ativo_diaria_2025_10 force row level security;
alter table app.metrica_ativo_diaria_2025_11 enable row level security;
alter table app.metrica_ativo_diaria_2025_11 force row level security;
alter table app.metrica_ativo_diaria_2025_12 enable row level security;
alter table app.metrica_ativo_diaria_2025_12 force row level security;
alter table app.metrica_ativo_diaria_2026_01 enable row level security;
alter table app.metrica_ativo_diaria_2026_01 force row level security;
alter table app.metrica_ativo_diaria_2026_02 enable row level security;
alter table app.metrica_ativo_diaria_2026_02 force row level security;
alter table app.metrica_ativo_diaria_2026_03 enable row level security;
alter table app.metrica_ativo_diaria_2026_03 force row level security;
alter table app.metrica_ativo_diaria_2026_04 enable row level security;
alter table app.metrica_ativo_diaria_2026_04 force row level security;
alter table app.metrica_ativo_diaria_2026_05 enable row level security;
alter table app.metrica_ativo_diaria_2026_05 force row level security;
alter table app.metrica_ativo_diaria_2026_06 enable row level security;
alter table app.metrica_ativo_diaria_2026_06 force row level security;
alter table app.metrica_ativo_diaria_2026_07 enable row level security;
alter table app.metrica_ativo_diaria_2026_07 force row level security;
alter table app.metrica_ativo_diaria_2026_08 enable row level security;
alter table app.metrica_ativo_diaria_2026_08 force row level security;
alter table app.metrica_ativo_diaria_2026_09 enable row level security;
alter table app.metrica_ativo_diaria_2026_09 force row level security;
alter table app.metrica_ativo_diaria_2026_10 enable row level security;
alter table app.metrica_ativo_diaria_2026_10 force row level security;
alter table app.metrica_ativo_diaria_2026_11 enable row level security;
alter table app.metrica_ativo_diaria_2026_11 force row level security;
alter table app.metrica_ativo_diaria_2026_12 enable row level security;
alter table app.metrica_ativo_diaria_2026_12 force row level security;
alter table app.metrica_ativo_diaria_2027_01 enable row level security;
alter table app.metrica_ativo_diaria_2027_01 force row level security;
alter table app.metrica_ativo_diaria_2027_02 enable row level security;
alter table app.metrica_ativo_diaria_2027_02 force row level security;
alter table app.metrica_ativo_diaria_2027_03 enable row level security;
alter table app.metrica_ativo_diaria_2027_03 force row level security;
alter table app.metrica_ativo_diaria_2027_04 enable row level security;
alter table app.metrica_ativo_diaria_2027_04 force row level security;
alter table app.metrica_ativo_diaria_2027_05 enable row level security;
alter table app.metrica_ativo_diaria_2027_05 force row level security;
alter table app.metrica_ativo_diaria_2027_06 enable row level security;
alter table app.metrica_ativo_diaria_2027_06 force row level security;
alter table app.metrica_ativo_diaria_2027_07 enable row level security;
alter table app.metrica_ativo_diaria_2027_07 force row level security;
alter table app.metrica_ativo_diaria_2027_08 enable row level security;
alter table app.metrica_ativo_diaria_2027_08 force row level security;
alter table app.metrica_ativo_diaria_2027_09 enable row level security;
alter table app.metrica_ativo_diaria_2027_09 force row level security;
alter table app.metrica_ativo_diaria_2027_10 enable row level security;
alter table app.metrica_ativo_diaria_2027_10 force row level security;
alter table app.metrica_ativo_diaria_2027_11 enable row level security;
alter table app.metrica_ativo_diaria_2027_11 force row level security;
alter table app.metrica_ativo_diaria_2027_12 enable row level security;
alter table app.metrica_ativo_diaria_2027_12 force row level security;
alter table app.metrica_ativo_diaria_padrao enable row level security;
alter table app.metrica_ativo_diaria_padrao force row level security;

grant select on app.metrica_ativo_diaria to hk_app;
grant select, insert on app.metrica_ativo_diaria to hk_worker;

-- Lê só quem decide: Admin do grupo, Gestor CSC e Gerente com o hotel.
create policy app_select on app.metrica_ativo_diaria for select to hk_app
  using (
    tenant_id = (select authz.tenant_id())
    and hotel_id in (select authz.hoteis_com_papel(
          array['admin_grupo', 'gestor_csc', 'gerente_hotel']::app.papel[]))
  );

create policy worker_select on app.metrica_ativo_diaria for select to hk_worker
  using (tenant_id = (select authz.tenant_sistema()));
create policy worker_insert on app.metrica_ativo_diaria for insert to hk_worker
  with check (tenant_id = (select authz.tenant_sistema()));

insert into app.metrica_ativo_diaria (id, tenant_id, hotel_id, ativo_id, dia, calculo, recalculo,
    reincidencia, atencao, faixa_atencao, versao_formula_reincidencia, versao_formula_atencao,
    versao_politica, detalhe_reincidencia, detalhe_atencao, calculado_em)
select id, tenant_id, hotel_id, ativo_id, dia, calculo, recalculo,
       reincidencia, atencao, faixa_atencao, versao_formula_reincidencia, versao_formula_atencao,
       versao_politica, detalhe_reincidencia, detalhe_atencao, calculado_em
  from app.metrica_ativo_diaria_antiga;

drop table app.metrica_ativo_diaria_antiga;
