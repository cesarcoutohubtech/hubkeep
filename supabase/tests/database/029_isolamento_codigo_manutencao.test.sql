-- ============================================================================
-- Isolamento de app.codigo_manutencao e dos códigos na OS (migração 0036,
-- fase 1b I6). Os seis casos mínimos do doc 02:
--   1. admin de outro tenant não vê nem grava os códigos, nem os códigos da
--      OS do tenant A;
--   2. gerente de hotel: a tabela não tem hotel_id (o código é do grupo),
--      então o caso vira "o gerente lê os códigos do grupo e não os grava; nas
--      OS, grava os códigos da OS do hotel dele e não os da OS de outro
--      hotel". O técnico de outro hotel também não grava;
--   3. o proprietário da UH lê os códigos (como a situação) e não grava nem
--      os códigos nem os da OS;
--   4. implantador vencido não vê nada;
--   5. sem contexto, nada;
--   6. FK composta: a categoria e o código da OS só do próprio tenant; mais a
--      integridade da tabela (tipo na lista, nome por uma das vias, chave
--      padrão única por tipo e no formato, nomes como objeto).
-- Mais: só o Admin do grupo cria e altera nomes e ativa; tipo, categoria,
-- chave padrão, id e tenant não são alteráveis; sem DELETE; o Técnico
-- responsável grava os códigos da OS dele, e outro Técnico do hotel não; o
-- worker vê só o tenant do job, inclusive os códigos gravados na OS.
-- ============================================================================
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(46);

grant usage on schema extensions to hk_app, hk_worker;

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'admin@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'gerente@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000004', 'tecnico@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000005', 'tecnico-outro@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000006', 'proprietario@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000007', 'tecnico-h2@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000008', 'implantador-vencido@a.test'),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'admin@b.test');

insert into app.tenant (id, nome) values
  ('10000000-0000-0000-0000-000000000000', 'Grupo A'),
  ('20000000-0000-0000-0000-000000000000', 'Grupo B');
insert into app.membro (tenant_id, usuario_id, nome, email)
select '10000000-0000-0000-0000-000000000000', id, email, email from auth.users where email like '%@a.test';
insert into app.membro (tenant_id, usuario_id, nome, email) values
  ('20000000-0000-0000-0000-000000000000', 'bbbbbbbb-0000-0000-0000-000000000001', 'Admin B', 'admin@b.test');
insert into app.hotel (id, tenant_id, nome, fuso, status) values
  ('11100000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', 'Hotel 1', 'UTC', 'ativo'),
  ('11100000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000000', 'Hotel 2', 'UTC', 'ativo'),
  ('22200000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000000', 'Hotel B', 'UTC', 'ativo');
insert into app.local (id, tenant_id, hotel_id, tipo, nome, busca, status) values
  ('11110000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'uh', 'UH 101', 'uh 101', 'ativo'),
  ('11120000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000002', 'uh', 'UH 201', 'uh 201', 'ativo'),
  ('22210000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000000', '22200000-0000-0000-0000-000000000001', 'uh', 'UH B', 'uh b', 'ativo');
insert into app.proprietario (id, tenant_id, nome) values
  ('11200000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', 'Dono da UH 101');
insert into app.local_proprietario (id, tenant_id, proprietario_id, local_id, vigencia_inicio) values
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11200000-0000-0000-0000-000000000001',
   '11110000-0000-0000-0000-000000000001', current_date - 1);
insert into app.atribuicao_escopo (id, tenant_id, usuario_id, papel, escopo_tipo, hotel_id, proprietario_id, valido_ate, concedido_por) values
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000001', 'admin_grupo', 'grupo', null, null, null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000002', 'gerente_hotel', 'hotel', '11100000-0000-0000-0000-000000000001', null, null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000004', 'tecnico', 'hotel', '11100000-0000-0000-0000-000000000001', null, null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000005', 'tecnico', 'hotel', '11100000-0000-0000-0000-000000000001', null, null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000006', 'proprietario', 'proprietario', null, '11200000-0000-0000-0000-000000000001', null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000007', 'tecnico', 'hotel', '11100000-0000-0000-0000-000000000002', null, null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000008', 'implantador', 'hotel', '11100000-0000-0000-0000-000000000001', null, now() - interval '1 day', 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '20000000-0000-0000-0000-000000000000', 'bbbbbbbb-0000-0000-0000-000000000001', 'admin_grupo', 'grupo', null, null, null, 'bbbbbbbb-0000-0000-0000-000000000001');
insert into app.categoria_ativo (id, tenant_id, chave_padrao) values
  ('ca000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', 'elevador'),
  ('cb000000-0000-0000-0000-00000000000c', '20000000-0000-0000-0000-000000000000', 'elevador');
-- Códigos: k1 falha padrão do elevador, k2 causa sem categoria e com nome do
-- tenant, k3 solução padrão, k4 falha desativada (tenant A); kb no tenant B.
insert into app.codigo_manutencao (id, tenant_id, tipo, categoria_id, chave_padrao, nomes, ativa) values
  ('c0a00000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', 'falha', 'ca000000-0000-0000-0000-000000000001', 'parado_entre_andares', '{}', true),
  ('c0a00000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000000', 'causa', null, null, '{"pt-BR": "Desgaste"}', true),
  ('c0a00000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000000', 'solucao', 'ca000000-0000-0000-0000-000000000001', 'ajuste_e_regulagem', '{}', true),
  ('c0a00000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000000', 'falha', null, null, '{"pt-BR": "Antigo"}', false),
  ('c0b00000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000000', 'falha', 'cb000000-0000-0000-0000-00000000000c', 'parado_entre_andares', '{}', true);

insert into app.situacao (id, tenant_id, entidade, estado, chave_padrao, ordem, cor) values
  ('5a000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', 'chamado', 'em_execucao', 'chamado_em_execucao', 10, '#2563eb'),
  ('5a000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000000', 'os', 'em_execucao', 'os_em_execucao', 10, '#2563eb'),
  ('5b000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000000', 'chamado', 'em_execucao', 'chamado_em_execucao', 10, '#2563eb'),
  ('5b000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000000', 'os', 'em_execucao', 'os_em_execucao', 10, '#2563eb');
insert into app.prioridade (id, tenant_id, chave_padrao, ordem, peso) values
  ('9a000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', 'baixa', 40, 10),
  ('9b000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000000', 'baixa', 40, 10);
-- c1 (Hotel 1, UH 101, OS do técnico), c2 (Hotel 2, OS do técnico do Hotel 2), cb (tenant B).
insert into app.chamado (id, tenant_id, hotel_id, local_id, descricao, busca, estado, situacao_id, prioridade_id, politica_aplicada, aberto_por)
select c.id::uuid, c.tenant::uuid, c.hotel::uuid, c.local::uuid, c.descricao, c.descricao, 'em_execucao', c.situacao::uuid,
       c.prioridade::uuid, '{}', c.aberto_por::uuid
from (values
  ('c1000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', '11110000-0000-0000-0000-000000000001', 'elevador parado', '5a000000-0000-0000-0000-000000000001', '9a000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000002'),
  ('c2000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000002', '11120000-0000-0000-0000-000000000001', 'porta', '5a000000-0000-0000-0000-000000000001', '9a000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('cb000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000000', '22200000-0000-0000-0000-000000000001', '22210000-0000-0000-0000-000000000001', 'chamado b', '5b000000-0000-0000-0000-000000000001', '9b000000-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001')
) as c (id, tenant, hotel, local, descricao, situacao, prioridade, aberto_por);
insert into app.os (id, tenant_id, hotel_id, chamado_id, local_id, chamado_aberto_por, estado, situacao_id, tecnico_id, criado_por) values
  ('0a100000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', '11110000-0000-0000-0000-000000000001',
   'aaaaaaaa-0000-0000-0000-000000000002', 'em_execucao', '5a000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000002'),
  ('0a200000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000002', 'c2000000-0000-0000-0000-000000000001', '11120000-0000-0000-0000-000000000001',
   'aaaaaaaa-0000-0000-0000-000000000001', 'em_execucao', '5a000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000007', 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('0ab00000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000000', '22200000-0000-0000-0000-000000000001', 'cb000000-0000-0000-0000-000000000001', '22210000-0000-0000-0000-000000000001',
   'bbbbbbbb-0000-0000-0000-000000000001', 'em_execucao', '5b000000-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001');

-- Caso 6 — FK composta e integridade (como postgres)
select throws_ok(
  $$ insert into app.codigo_manutencao (id, tenant_id, tipo, categoria_id, nomes) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'falha', 'cb000000-0000-0000-0000-00000000000c', '{"pt-BR": "x"}') $$,
  '23503', null, 'código só com categoria do próprio tenant');
select throws_ok(
  $$ update app.os set codigo_falha_id = 'c0b00000-0000-0000-0000-000000000001'
     where id = '0a100000-0000-0000-0000-000000000001' $$,
  '23503', null, 'a OS só aponta para código do próprio tenant');
select throws_ok(
  $$ insert into app.codigo_manutencao (id, tenant_id, tipo, nomes) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'sintoma', '{"pt-BR": "x"}') $$,
  '23514', null, 'tipo só falha, causa ou solução');
select throws_ok(
  $$ insert into app.codigo_manutencao (id, tenant_id, tipo) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'causa') $$,
  '23514', null, 'código sem chave padrão precisa de nome do tenant');
select throws_ok(
  $$ insert into app.codigo_manutencao (id, tenant_id, tipo, chave_padrao) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'falha', 'parado_entre_andares') $$,
  '23505', null, 'o mesmo código padrão não entra duas vezes no tipo');
select lives_ok(
  $$ insert into app.codigo_manutencao (id, tenant_id, tipo, chave_padrao) values
     ('c0a00000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000000', 'causa', 'parado_entre_andares') $$,
  'a mesma chave padrão entra em outro tipo');
select throws_ok(
  $$ insert into app.codigo_manutencao (id, tenant_id, tipo, chave_padrao) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'falha', 'Porta Travada') $$,
  '23514', null, 'chave padrão no formato');
select throws_ok(
  $$ insert into app.codigo_manutencao (id, tenant_id, tipo, nomes) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'falha', '["x"]') $$,
  '23514', null, 'nomes é um objeto por idioma');

set local role hk_app;

-- Caso 5 — sem contexto
select from (select set_config('app.usuario_id', '', true), set_config('app.tenant_id', '', true)) ctx;
select is_empty('select 1 from app.codigo_manutencao', 'sem contexto: nenhum código');

-- Caso 1 — admin B
select from (select set_config('app.usuario_id', 'bbbbbbbb-0000-0000-0000-000000000001', true),
       set_config('app.tenant_id',  '20000000-0000-0000-0000-000000000000', true)) ctx;
select results_eq($$ select id::text from app.codigo_manutencao $$,
  $$ values ('c0b00000-0000-0000-0000-000000000001') $$, 'admin B vê só os códigos do B');
select is_empty($$ update app.codigo_manutencao set ativa = false
                   where tenant_id = '10000000-0000-0000-0000-000000000000' returning 1 $$,
  'admin B não altera código do A');
select throws_ok(
  $$ insert into app.codigo_manutencao (id, tenant_id, tipo, nomes) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'falha', '{"pt-BR": "Intruso"}') $$,
  '42501', null, 'admin B não cria código no A');
select is_empty($$ update app.os set codigo_falha_id = null
                   where tenant_id = '10000000-0000-0000-0000-000000000000' returning 1 $$,
  'admin B não grava os códigos da OS do A');

-- Caso 2 — gerente do Hotel 1: lê os códigos do grupo, não os grava; grava os da OS do hotel dele
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000002', true),
       set_config('app.tenant_id',  '10000000-0000-0000-0000-000000000000', true)) ctx;
select results_eq($$ select count(*)::int from app.codigo_manutencao $$, $$ values (5) $$,
  'gerente lê os códigos do grupo, inclusive o desativado');
select throws_ok(
  $$ insert into app.codigo_manutencao (id, tenant_id, tipo, nomes) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'falha', '{"pt-BR": "Do gerente"}') $$,
  '42501', null, 'gerente não cria código');
select is_empty($$ update app.codigo_manutencao set ativa = false returning 1 $$,
  'gerente não altera código');
select isnt_empty($$ update app.os set codigo_falha_id = 'c0a00000-0000-0000-0000-000000000001'
                     where id = '0a100000-0000-0000-0000-000000000001' returning 1 $$,
  'gerente grava o código de falha da OS do hotel dele (aceite)');
select is_empty($$ update app.os set codigo_falha_id = 'c0a00000-0000-0000-0000-000000000001'
                   where id = '0a200000-0000-0000-0000-000000000001' returning 1 $$,
  'gerente não grava código na OS de outro hotel');

-- Técnico responsável: lê os códigos e grava os da OS dele (conclusão)
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000004', true)) ctx;
select results_eq($$ select count(*)::int from app.codigo_manutencao $$, $$ values (5) $$,
  'técnico lê os códigos do grupo');
select isnt_empty($$ update app.os set codigo_causa_id = 'c0a00000-0000-0000-0000-000000000002',
                                      codigo_solucao_id = 'c0a00000-0000-0000-0000-000000000003'
                     where id = '0a100000-0000-0000-0000-000000000001' returning 1 $$,
  'técnico responsável grava causa e solução da OS dele');
select throws_ok(
  $$ insert into app.codigo_manutencao (id, tenant_id, tipo, nomes) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'falha', '{"pt-BR": "Do técnico"}') $$,
  '42501', null, 'técnico não cria código');

-- Outro técnico do Hotel 1 e o técnico do Hotel 2: não gravam os códigos da OS do Hotel 1
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000005', true)) ctx;
select is_empty($$ update app.os set codigo_falha_id = null
                   where id = '0a100000-0000-0000-0000-000000000001' returning 1 $$,
  'técnico que não é o responsável não grava os códigos da OS');
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000007', true)) ctx;
select is_empty($$ update app.os set codigo_falha_id = null
                   where id = '0a100000-0000-0000-0000-000000000001' returning 1 $$,
  'técnico de outro hotel não grava os códigos da OS');
select isnt_empty($$ update app.os set codigo_falha_id = 'c0a00000-0000-0000-0000-000000000001'
                     where id = '0a200000-0000-0000-0000-000000000001' returning 1 $$,
  'técnico do Hotel 2 grava os códigos da OS dele');

-- Caso 3 — proprietário da UH: lê os códigos, não grava
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000006', true)) ctx;
select results_eq($$ select count(*)::int from app.codigo_manutencao $$, $$ values (5) $$,
  'proprietário lê os códigos (vê os das OS da UH dele)');
select throws_ok(
  $$ insert into app.codigo_manutencao (id, tenant_id, tipo, nomes) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'falha', '{"pt-BR": "Do dono"}') $$,
  '42501', null, 'proprietário não cria código');
select is_empty($$ update app.codigo_manutencao set ativa = false returning 1 $$,
  'proprietário não altera código');
select is_empty($$ update app.os set codigo_falha_id = null returning 1 $$,
  'proprietário não grava os códigos da OS');

-- Caso 4 — implantador vencido
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000008', true)) ctx;
select is_empty('select 1 from app.codigo_manutencao', 'implantador vencido não vê código');

-- Admin A: cria, renomeia e desativa; o resto não muda; sem DELETE
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000001', true)) ctx;
select lives_ok(
  $$ insert into app.codigo_manutencao (id, tenant_id, tipo, categoria_id, nomes) values
     ('c0a00000-0000-0000-0000-000000000006', '10000000-0000-0000-0000-000000000000', 'falha',
      'ca000000-0000-0000-0000-000000000001', '{"pt-BR": "Porta não fecha", "en": "Door does not close"}') $$,
  'admin cria código com nome por idioma');
select isnt_empty($$ update app.codigo_manutencao set nomes = '{"pt-BR": "Parado no andar"}', atualizado_em = now()
                     where id = 'c0a00000-0000-0000-0000-000000000001' returning 1 $$,
  'admin dá nome próprio a um código padrão');
select isnt_empty($$ update app.codigo_manutencao set ativa = false
                     where id = 'c0a00000-0000-0000-0000-000000000005' returning 1 $$,
  'admin desativa código');
select throws_ok($$ update app.codigo_manutencao set tipo = 'causa' $$, '42501', null,
  'o tipo do código não é alterável');
select throws_ok($$ update app.codigo_manutencao set categoria_id = null $$, '42501', null,
  'a categoria do código não é alterável');
select throws_ok($$ update app.codigo_manutencao set chave_padrao = 'outra' $$, '42501', null,
  'a chave padrão do código não é alterável');
select throws_ok($$ update app.codigo_manutencao set id = gen_random_uuid() $$, '42501', null,
  'o id do código não é alterável');
select throws_ok($$ update app.codigo_manutencao set tenant_id = '20000000-0000-0000-0000-000000000000' $$,
  '42501', null, 'o tenant do código não é alterável');
select throws_ok($$ delete from app.codigo_manutencao $$, '42501', null, 'sem DELETE em código');
select results_eq(
  $$ select codigo_falha_id::text, codigo_causa_id::text, codigo_solucao_id::text from app.os
     where id = '0a100000-0000-0000-0000-000000000001' $$,
  $$ values ('c0a00000-0000-0000-0000-000000000001', 'c0a00000-0000-0000-0000-000000000002',
             'c0a00000-0000-0000-0000-000000000003') $$,
  'a OS guarda os três códigos gravados pelo gerente e pelo técnico');
select isnt_empty($$ update app.os set codigo_causa_id = null
                     where id = '0a100000-0000-0000-0000-000000000001' returning 1 $$,
  'o código da OS volta a ficar vazio');
select throws_ok($$ update app.os set hotel_id = '11100000-0000-0000-0000-000000000002'
                    where id = '0a100000-0000-0000-0000-000000000001' $$,
  '42501', null, 'o GRANT novo não abre o hotel da OS');
reset role;

-- Worker: só o tenant do job, com os códigos da OS
set local role hk_worker;
select from (select set_config('app.tenant_id', '10000000-0000-0000-0000-000000000000', true)) ctx;
select results_eq('select count(distinct tenant_id)::int from app.codigo_manutencao', $$ values (1) $$,
  'worker vê só o tenant do job');
select results_eq('select count(*)::int from app.codigo_manutencao', $$ values (6) $$,
  'worker vê todos os códigos do tenant do job');
select results_eq(
  $$ select codigo_falha_id::text from app.os where id = '0a100000-0000-0000-0000-000000000001' $$,
  $$ values ('c0a00000-0000-0000-0000-000000000001') $$,
  'worker lê o código de falha da OS (Intelligence)');
select throws_ok(
  $$ insert into app.codigo_manutencao (id, tenant_id, tipo, nomes) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'falha', '{"pt-BR": "Do worker"}') $$,
  '42501', null, 'worker não cria código');
select throws_ok($$ update app.os set codigo_falha_id = null $$, '42501', null,
  'worker não grava os códigos da OS');
reset role;

select * from finish();
rollback;
