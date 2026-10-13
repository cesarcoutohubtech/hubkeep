-- ============================================================================
-- HubKeep — Migração 0045: planos preventivos (fase 1b, PV2; ADR-041)
-- ----------------------------------------------------------------------------
-- Desenho aprovado pelo Cesar em 12/10/2026, com o ADR-041 e as decisões 6 a
-- 8 de docs/referencia/propostas-desenho-pv-implantacao.md. Tudo o que é
-- regra fica no domínio e na aplicação: os limites da periodicidade (até 366
-- dias, 52 semanas e 24 meses), o calendário fixo ancorado no início (a
-- ocorrência k é inicio + k × intervalo, e o dia que não existe no mês cai no
-- último dia), o responsável exigido para ativar, encerrar sem volta, quem
-- cadastra e o limite do nome. Aqui fica só a estrutura e a autorização. A
-- geração da OS (PV3) vem na migração seguinte: as colunas novas de app.os e
-- o INSERT do worker em app.os, app.os_transicao e app.os_checklist.
--
-- app.plano_preventivo, do hotel:
--   - alvo: ativo_id ou categoria_id, exatamente um dos dois. O ativo com FK
--     composta pelo hotel; a categoria, pelo grupo (o plano por categoria
--     vale para os ativos dela no hotel do plano). O alvo não muda: trocar
--     é encerrar e cadastrar outro;
--   - periodicidade: intervalo (inteiro, a partir de 1) e unidade (dia,
--     semana ou mes). A lista é do domínio (UNIDADES_DE_PERIODICIDADE), e o
--     check repete os valores, como o momento da foto (0041);
--   - inicio: a primeira data prevista, no fuso do hotel;
--   - checklist_modelo_id, anulável: o plano sem checklist gera OS sem
--     checklist. FK composta pelo grupo;
--   - responsável padrão: tecnico_id ou equipe_id, no máximo um. O domínio
--     exige um para ativar;
--   - situacao: ativo, pausado ou encerrado (SITUACOES_DO_PLANO, com o check
--     dos mesmos valores). Encerrar é a desativação lógica e não volta, pelo
--     domínio; pausar não apaga nada;
--   - nome (texto de quem cadastra), versao (ADR-029), criado_por e as datas.
-- Lê e grava (INSERT e UPDATE das colunas que não são escopo nem alvo): a
-- gestão do hotel (Admin do grupo, Gestor CSC no escopo dele e Gerente do
-- hotel) e o Implantador do hotel (decisão 8), em nome dele mesmo. O Técnico,
-- o Solicitante e o proprietário não leem o plano; a OS preventiva leva a
-- cópia dele (PV3). O worker lê no tenant do job (a PV3 gera as OS a partir
-- dos planos ativos). A policy não lê outra tabela, e nenhuma policy lê
-- app.plano_preventivo: sem ciclo (meta-teste 27).
-- Só estrutura e autorização: nenhuma função, trigger ou regra de negócio.
-- ============================================================================

create table app.plano_preventivo (
  id                  uuid primary key,
  tenant_id           uuid not null,
  hotel_id            uuid not null,
  ativo_id            uuid,
  categoria_id        uuid,
  nome                text not null,
  intervalo           integer not null,
  unidade             text not null,
  inicio              date not null,
  checklist_modelo_id uuid,
  tecnico_id          uuid,
  equipe_id           uuid,
  situacao            text not null,
  versao              integer not null default 1,
  criado_por          uuid not null,
  criado_em           timestamptz not null default now(),
  atualizado_em       timestamptz not null default now(),
  unique (tenant_id, id),
  unique (hotel_id, id),
  foreign key (tenant_id, hotel_id) references app.hotel (tenant_id, id),
  constraint plano_preventivo_ativo_do_hotel
    foreign key (hotel_id, ativo_id) references app.ativo (hotel_id, id),
  constraint plano_preventivo_categoria_do_grupo
    foreign key (tenant_id, categoria_id) references app.categoria_ativo (tenant_id, id),
  constraint plano_preventivo_checklist_do_grupo
    foreign key (tenant_id, checklist_modelo_id) references app.checklist_modelo (tenant_id, id),
  constraint plano_preventivo_equipe_do_hotel
    foreign key (hotel_id, equipe_id) references app.equipe (hotel_id, id),
  foreign key (tenant_id, tecnico_id) references app.membro (tenant_id, usuario_id),
  foreign key (tenant_id, criado_por) references app.membro (tenant_id, usuario_id),
  constraint plano_preventivo_um_alvo check (num_nonnulls(ativo_id, categoria_id) = 1),
  constraint plano_preventivo_um_responsavel check (num_nonnulls(tecnico_id, equipe_id) <= 1),
  constraint plano_preventivo_unidade_lista check (unidade in ('dia', 'semana', 'mes')),
  constraint plano_preventivo_situacao_lista check (situacao in ('ativo', 'pausado', 'encerrado')),
  constraint plano_preventivo_intervalo_positivo check (intervalo >= 1),
  constraint plano_preventivo_nome_preenchido check (length(btrim(nome)) > 0),
  constraint plano_preventivo_versao_positiva check (versao >= 1)
);
-- A lista do hotel e o job da PV3: os planos do hotel, por situação.
create index plano_preventivo_hotel_idx on app.plano_preventivo (tenant_id, hotel_id, situacao);
-- Os planos de cada ativo, na ficha dele.
create index plano_preventivo_ativo_idx on app.plano_preventivo (hotel_id, ativo_id);
-- Os planos por categoria, que a PV3 expande nos ativos dela.
create index plano_preventivo_categoria_idx on app.plano_preventivo (tenant_id, categoria_id);

alter table app.plano_preventivo enable row level security;
alter table app.plano_preventivo force row level security;

grant select, insert on app.plano_preventivo to hk_app;
grant update (nome, intervalo, unidade, inicio, checklist_modelo_id, tecnico_id, equipe_id,
              situacao, versao, atualizado_em) on app.plano_preventivo to hk_app;
grant select on app.plano_preventivo to hk_worker;

create policy app_select on app.plano_preventivo for select to hk_app
  using (
    tenant_id = (select authz.tenant_id())
    and hotel_id in (select authz.hoteis_com_papel(
          array['admin_grupo', 'gestor_csc', 'gerente_hotel', 'implantador']::app.papel[]))
  );
create policy app_insert on app.plano_preventivo for insert to hk_app
  with check (
    tenant_id = (select authz.tenant_id())
    and hotel_id in (select authz.hoteis_com_papel(
          array['admin_grupo', 'gestor_csc', 'gerente_hotel', 'implantador']::app.papel[]))
    and criado_por = (select authz.usuario_id())
  );
create policy app_update on app.plano_preventivo for update to hk_app
  using (
    tenant_id = (select authz.tenant_id())
    and hotel_id in (select authz.hoteis_com_papel(
          array['admin_grupo', 'gestor_csc', 'gerente_hotel', 'implantador']::app.papel[]))
  )
  with check (
    tenant_id = (select authz.tenant_id())
    and hotel_id in (select authz.hoteis_com_papel(
          array['admin_grupo', 'gestor_csc', 'gerente_hotel', 'implantador']::app.papel[]))
  );
create policy worker_select on app.plano_preventivo for select to hk_worker
  using (tenant_id = (select authz.tenant_sistema()));
