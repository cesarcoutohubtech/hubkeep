-- ============================================================================
-- HubKeep — Migração 0052: sinal do hóspede do Intelligence (ADR-047, 1.5 sem
-- IA)
-- ----------------------------------------------------------------------------
-- A reclamação ou avaliação de hóspede, importada por CSV (uma importação é
-- um lote, de um hotel) e classificada à mão por quem decide insight no
-- hotel. Decisão de Cesar e Kaio de 16/10/2026 ("De acordo. Prossiga"); o
-- ADR-047 aguarda o "aprovo" dos dois. É a tabela de sinais que o ADR-033
-- deixou para a 1.5, só para o feedback externo, com os três estados de
-- ligação com o ativo.
--
-- Tudo o que é regra fica em packages/inteligencia: a validação de cada linha
-- importada, o limite do lote, quem importa e classifica, as regras da
-- classificação (o ativo é do hotel da reclamação, a categoria só na
-- reclamação de manutenção, a ligação acompanha o ativo), a retenção do texto
-- e o que o motor faz com o sinal. O banco guarda:
--   - a origem: hotel, lote, fonte (código curto do cliente, sem lista
--     fechada: [a-z0-9_], até 40), código externo, data, nota e escala
--     (juntas, nota de 0 até a escala), texto (até 4000), idioma e a UH como
--     veio na exportação (uh_citada). Nenhum dado pessoal do hóspede: nem
--     nome, nem contato, nem reserva;
--   - a mesma avaliação uma vez só: único por (tenant_id, hotel_id, fonte,
--     id_externo). A importação usa on conflict do nothing e conta a repetida;
--   - a classificação: manutencao (null enquanto ninguém classificou),
--     categoria_id, uh_id, ativo_id e ligacao, com quem classificou e quando
--     (juntos, e presentes exatamente quando manutencao não é null);
--   - os três estados da ligação (LIGACOES_DO_SINAL; o teste de paridade da
--     raiz falha se o check e a lista do módulo divergirem). Com ativo, a
--     ligação é possivel ou confirmada; sem ativo, sem_ligacao;
--   - a categoria e o ativo só na reclamação de manutenção;
--   - FKs compostas: a UH e o ativo do mesmo hotel (hotel_id, id); a
--     categoria e as pessoas do mesmo tenant. A UH chama uh_id, e não
--     local_id: local_id é campo de escopo (meta-teste 18) e a classificação
--     muda a UH;
--   - o apagamento do texto (retenção, ADR-047): texto_apagado_em só com o
--     texto vazio.
-- Lê, importa e classifica (hk_app) quem decide insight no hotel: Admin do
--   grupo, Gestor CSC e Gerente com o hotel, pela mesma lista de papéis da
--   app.insight. O Técnico, o Solicitante, o implantador e o proprietário não
--   leem: o texto do hóspede não vai ao PWA. Quem importa grava em nome
--   próprio (importado_por), e quem classifica também (classificado_por).
-- O UPDATE do hk_app é só das colunas da classificação: a origem não muda
--   depois de importada. Nenhum campo de escopo recebe UPDATE (meta-teste 18).
-- Grava (hk_worker, o job): só o apagamento do texto, no tenant do job.
-- Sem DELETE para ninguém (exclusão é lógica).
-- As policies leem só funções authz; nenhuma lê outra tabela (meta-teste 27).
-- Só estrutura e autorização: nenhuma função, trigger ou regra de negócio.
-- ============================================================================

create table app.sinal_hospede (
  id               uuid primary key,
  tenant_id        uuid not null,
  hotel_id         uuid not null,
  lote_id          uuid not null,
  fonte            text not null,
  id_externo       text not null,
  ocorrido_em      timestamptz not null,
  nota             numeric(6, 2),
  escala           smallint,
  texto            text,
  idioma           text,
  uh_citada        text,
  manutencao       boolean,
  categoria_id     uuid,
  uh_id            uuid,
  ativo_id         uuid,
  ligacao          text not null default 'sem_ligacao',
  classificado_em  timestamptz,
  classificado_por uuid,
  texto_apagado_em timestamptz,
  importado_por    uuid not null,
  versao           integer not null default 1,
  criado_em        timestamptz not null default now(),
  atualizado_em    timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, hotel_id, fonte, id_externo),
  foreign key (tenant_id, hotel_id) references app.hotel (tenant_id, id),
  foreign key (tenant_id, categoria_id) references app.categoria_ativo (tenant_id, id),
  foreign key (hotel_id, uh_id) references app.local (hotel_id, id),
  foreign key (hotel_id, ativo_id) references app.ativo (hotel_id, id),
  foreign key (tenant_id, classificado_por) references app.membro (tenant_id, usuario_id),
  foreign key (tenant_id, importado_por) references app.membro (tenant_id, usuario_id),
  constraint sinal_hospede_fonte_formato check (fonte ~ '^[a-z0-9_]{1,40}$'),
  constraint sinal_hospede_id_externo_preenchido check (
    length(btrim(id_externo)) > 0 and char_length(id_externo) <= 200),
  constraint sinal_hospede_nota_com_escala check ((nota is null) = (escala is null)),
  constraint sinal_hospede_escala_valida check (escala is null or escala between 1 and 100),
  constraint sinal_hospede_nota_na_escala check (nota is null or (nota >= 0 and nota <= escala)),
  constraint sinal_hospede_texto_curto check (texto is null or char_length(texto) <= 4000),
  constraint sinal_hospede_idioma_curto check (idioma is null or char_length(idioma) <= 20),
  constraint sinal_hospede_uh_citada_curta check (uh_citada is null or char_length(uh_citada) <= 40),
  -- Formato da ligação: os três de LIGACOES_DO_SINAL (paridade na raiz).
  constraint sinal_hospede_ligacao_lista check (ligacao in ('sem_ligacao', 'possivel', 'confirmada')),
  constraint sinal_hospede_ligacao_com_ativo check ((ativo_id is null) = (ligacao = 'sem_ligacao')),
  constraint sinal_hospede_ativo_so_na_manutencao check (
    manutencao is true or (categoria_id is null and ativo_id is null)),
  constraint sinal_hospede_classificado_com_quem check (
    (classificado_em is null) = (classificado_por is null)
    and (classificado_em is null) = (manutencao is null)),
  constraint sinal_hospede_apagado_sem_texto check (texto_apagado_em is null or texto is null),
  constraint sinal_hospede_versao_positiva check (versao >= 1)
);
-- A fila do que falta classificar e a lista do hotel, das mais novas.
create index sinal_hospede_hotel_idx on app.sinal_hospede (tenant_id, hotel_id, ocorrido_em desc);
create index sinal_hospede_a_classificar_idx on app.sinal_hospede (tenant_id, hotel_id, ocorrido_em desc)
  where manutencao is null;
-- As reclamações ligadas ao ativo (motor e página do ativo).
create index sinal_hospede_ativo_idx on app.sinal_hospede (hotel_id, ativo_id)
  where ativo_id is not null;

alter table app.sinal_hospede enable row level security;
alter table app.sinal_hospede force row level security;

grant select, insert on app.sinal_hospede to hk_app;
grant update (manutencao, categoria_id, uh_id, ativo_id, ligacao, classificado_em, classificado_por,
              versao, atualizado_em)
  on app.sinal_hospede to hk_app;
grant select on app.sinal_hospede to hk_worker;
grant update (texto, texto_apagado_em, versao, atualizado_em) on app.sinal_hospede to hk_worker;

-- Lê, importa e classifica quem decide insight no hotel.
create policy app_select on app.sinal_hospede for select to hk_app
  using (
    tenant_id = (select authz.tenant_id())
    and hotel_id in (select authz.hoteis_com_papel(
          array['admin_grupo', 'gestor_csc', 'gerente_hotel']::app.papel[]))
  );

create policy app_insert on app.sinal_hospede for insert to hk_app
  with check (
    tenant_id = (select authz.tenant_id())
    and importado_por = (select authz.usuario_id())
    and hotel_id in (select authz.hoteis_com_papel(
          array['admin_grupo', 'gestor_csc', 'gerente_hotel']::app.papel[]))
  );

create policy app_update on app.sinal_hospede for update to hk_app
  using (
    tenant_id = (select authz.tenant_id())
    and hotel_id in (select authz.hoteis_com_papel(
          array['admin_grupo', 'gestor_csc', 'gerente_hotel']::app.papel[]))
  )
  with check (
    tenant_id = (select authz.tenant_id())
    and (classificado_por is null or classificado_por = (select authz.usuario_id()))
    and hotel_id in (select authz.hoteis_com_papel(
          array['admin_grupo', 'gestor_csc', 'gerente_hotel']::app.papel[]))
  );

create policy worker_select on app.sinal_hospede for select to hk_worker
  using (tenant_id = (select authz.tenant_sistema()));
create policy worker_update on app.sinal_hospede for update to hk_worker
  using (tenant_id = (select authz.tenant_sistema()))
  with check (tenant_id = (select authz.tenant_sistema()));
