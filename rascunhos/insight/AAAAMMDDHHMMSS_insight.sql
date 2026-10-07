-- ============================================================================
-- RASCUNHO LOCAL, sem timestamp definitivo e fora de supabase/migrations.
-- O timestamp só é fixado depois das três migrações da instrumentação do
-- núcleo e com a fila de zona protegida livre (pedido de 06/10/2026).
-- ----------------------------------------------------------------------------
-- HubKeep — Migração NNNN: insight do Intelligence (ADR-033, ADR-037)
-- ----------------------------------------------------------------------------
-- O insight que o job diário abre ou atualiza (decidirDeteccao) e que uma
-- pessoa revisa, aceita, resolve ou descarta (decidirNoInsight). Tudo o que é
-- regra fica em packages/inteligencia: os estados e as transições, quem
-- decide, o silêncio depois do descarte e o vínculo com o anterior. O banco
-- guarda:
--   - o formato do estado (os sete canônicos), com teste de paridade com o
--     domínio (ESTADOS_DO_INSIGHT), como o chamado e a OS (ADR-027);
--   - no máximo um insight aberto por chave: índice único parcial em
--     (tenant_id, chave) where encerrado_em is null. Aberto é "sem
--     encerramento", para o índice não depender de literal de estado;
--   - a chave e a família (aprovado por Kaio e, na condição do hash, pelo Cesar
--     em 07/10/2026): familia é o tipo, a regra e o escopo sem os hotéis (o
--     domínio puro a monta); chave é a familia, '|hoteis=' e o SHA-256 (hex) da
--     lista canônica de hotéis (listaCanonicaDeHoteis, separada por vírgula, em
--     UTF-8). O hash é calculado fora do packages/inteligencia: no job, com
--     node:crypto (a ligação em apps/web/src/servidor/modulos/inteligencia), ou
--     no banco, com o sha256() embutido; nada de SHA-256 escrito à mão, e nenhuma
--     função nova no banco. Hash, e não a lista, porque o btree não aceita
--     entrada acima de cerca de 2,7 KB e a lista estoura com uns 70 hotéis;
--     hotel_ids guarda a lista completa. O banco confere o formato e limita o
--     tamanho (checks), para nenhuma entrada de índice estourar;
--   - o motivo do descarte (nao_relevante ou substituido), que o domínio usa
--     no silêncio de 30 dias: só o descarte "não relevante" silencia a família;
--   - o alcance: hotel_id (null no insight de rede), bandeira_id (a bandeira
--     do alcance, quando há) e hotel_ids, a lista de todos os hotéis
--     envolvidos. No insight de hotel, hotel_ids = {hotel_id} (check).
-- Lê (hk_app): quem tem acesso a TODOS os hotéis de hotel_ids
--   (hotel_ids <@ hoteis_leitura). Insight de hotel: quem lê o hotel. Insight
--   de bandeira ou de grupo: só quem cobre todos os hotéis envolvidos. O
--   proprietário não lê (hoteis_leitura não o inclui; o Intelligence é
--   gerencial). Como o escopo e a evidência só citam hotéis de hotel_ids
--   (invariante do domínio, testado em dia.test.ts), o detalhamento nunca cita
--   hotel fora do escopo de quem lê. Os ids de origem da evidência continuam
--   filtrados pela RLS da tabela de origem.
-- Decide (UPDATE de estado, responsável, nota e encerramento, hk_app):
--   insight de hotel: Admin do grupo, Gestor CSC e Gerente com o hotel;
--   insight de rede: Admin do grupo e Gestor CSC que cobrem todos os hotéis.
--   Quem encerra encerra em nome dele mesmo. A regra fina (bandeira do
--   alcance, transição, nota) é do domínio.
-- Grava (hk_worker, o job): abre e atualiza a última detecção, o score, a
--   faixa, o detalhamento e a evidência, só no tenant do job. Não muda estado.
-- Sem INSERT pelo hk_app (o insight nasce do job) e sem DELETE para ninguém.
-- Nenhum campo de escopo (hotel_id, bandeira_id, hotel_ids) recebe UPDATE.
--   Hotel novo num insight de rede (opção c, aprovada por Kaio, aguardando
--   Cesar): o conjunto novo tem outra chave (outro hash) e a mesma família, então
--   o job abre o insight novo, ligado pelo anterior_id, e o anterior continua
--   aberto até uma pessoa resolver ou descartar. O job não muda estado, e
--   hotel_ids não recebe UPDATE. A regra pela família está no LEIAME.md.
-- O insight guarda a própria evidência (detalhe e evidencia, com a
--   configuração usada) e não depende de linha da métrica diária: nenhuma FK
--   nem leitura de app.metrica_ativo_diaria, cuja leitura é limitada a 180 dias.
-- As policies leem só funções authz; nenhuma lê app.insight (meta-teste 27).
-- Só estrutura e autorização: nenhuma função, trigger ou regra de negócio.
-- ============================================================================

create table app.insight (
  id                   uuid primary key,
  tenant_id            uuid not null,
  hotel_id             uuid,
  bandeira_id          uuid,
  hotel_ids            uuid[] not null,
  tipo                 text not null,
  familia              text not null,
  chave                text not null,
  escopo               jsonb not null,
  estado               text not null default 'novo',
  faixa                text not null,
  valor                smallint,
  versao_score         smallint not null,
  detalhe              jsonb not null default '{}',
  evidencia            jsonb not null default '{}',
  anterior_id          uuid,
  primeira_deteccao_em timestamptz not null,
  ultima_deteccao_em   timestamptz not null,
  responsavel_id       uuid,
  nota                 text,
  motivo_descarte      text,
  encerrado_em         timestamptz,
  encerrado_por        uuid,
  versao               integer not null default 1,
  criado_em            timestamptz not null default now(),
  atualizado_em        timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, hotel_id) references app.hotel (tenant_id, id),
  foreign key (tenant_id, bandeira_id) references app.bandeira (tenant_id, id),
  foreign key (tenant_id, anterior_id) references app.insight (tenant_id, id),
  foreign key (tenant_id, responsavel_id) references app.membro (tenant_id, usuario_id),
  foreign key (tenant_id, encerrado_por) references app.membro (tenant_id, usuario_id),
  -- Formato do estado: os sete de ESTADOS_DO_INSIGHT (paridade no teste do db).
  constraint insight_estado_valido check (estado in (
    'novo', 'em_revisao', 'aceito', 'em_acao', 'monitorando', 'resolvido', 'descartado')),
  constraint insight_hoteis_nao_vazio check (cardinality(hotel_ids) >= 1),
  constraint insight_hotel_no_alcance check (hotel_id is null or hotel_ids = array[hotel_id]),
  constraint insight_valor_0_a_100 check (valor is null or valor between 0 and 100),
  constraint insight_deteccao_em_ordem check (ultima_deteccao_em >= primeira_deteccao_em),
  constraint insight_encerrado_com_quem check ((encerrado_em is null) = (encerrado_por is null)),
  -- Chave e família curtas: 600 caracteres cabem na entrada do btree mesmo em UTF-8
  -- (até 4 bytes por caractere); a família deixa espaço para '|hoteis=' e o hash.
  constraint insight_chave_curta check (char_length(chave) <= 600 and char_length(familia) <= 520),
  constraint insight_chave_da_familia check (left(chave, char_length(familia)) = familia),
  constraint insight_chave_com_hash check (chave ~ '\|hoteis=[0-9a-f]{64}$'),
  -- Formato do motivo do descarte (domínio, com paridade); só no descartado.
  constraint insight_motivo_descarte_valido check (
    motivo_descarte is null or motivo_descarte in ('nao_relevante', 'substituido')),
  constraint insight_motivo_so_no_descarte check (motivo_descarte is null or estado = 'descartado')
);
create unique index insight_um_aberto_por_chave on app.insight (tenant_id, chave)
  where encerrado_em is null;
create index insight_hotel_idx on app.insight (tenant_id, hotel_id);
create index insight_familia_idx on app.insight (tenant_id, familia, encerrado_em desc);

alter table app.insight enable row level security;
alter table app.insight force row level security;

grant select on app.insight to hk_app;
grant update (estado, responsavel_id, nota, motivo_descarte, encerrado_em, encerrado_por, versao,
              atualizado_em)
  on app.insight to hk_app;
grant select, insert on app.insight to hk_worker;
grant update (ultima_deteccao_em, faixa, valor, versao_score, detalhe, evidencia, versao,
              atualizado_em)
  on app.insight to hk_worker;

create policy app_select on app.insight for select to hk_app
  using (
    tenant_id = (select authz.tenant_id())
    and hotel_ids <@ array(select authz.hoteis_leitura())
  );

create policy app_update on app.insight for update to hk_app
  using (
    tenant_id = (select authz.tenant_id())
    and ((hotel_id is not null
          and hotel_id in (select authz.hoteis_com_papel(
                array['admin_grupo', 'gestor_csc', 'gerente_hotel']::app.papel[])))
         or (hotel_id is null
             and hotel_ids <@ array(select authz.hoteis_com_papel(
                   array['admin_grupo', 'gestor_csc']::app.papel[]))))
  )
  with check (
    tenant_id = (select authz.tenant_id())
    and (encerrado_por is null or encerrado_por = (select authz.usuario_id()))
    and ((hotel_id is not null
          and hotel_id in (select authz.hoteis_com_papel(
                array['admin_grupo', 'gestor_csc', 'gerente_hotel']::app.papel[])))
         or (hotel_id is null
             and hotel_ids <@ array(select authz.hoteis_com_papel(
                   array['admin_grupo', 'gestor_csc']::app.papel[]))))
  );

create policy worker_select on app.insight for select to hk_worker
  using (tenant_id = (select authz.tenant_sistema()));
create policy worker_insert on app.insight for insert to hk_worker
  with check (tenant_id = (select authz.tenant_sistema()));
create policy worker_update on app.insight for update to hk_worker
  using (tenant_id = (select authz.tenant_sistema()))
  with check (tenant_id = (select authz.tenant_sistema()));
