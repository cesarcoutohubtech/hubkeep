-- ============================================================================
-- Isolamento da parada do equipamento (migração 0025, fase 1a C5):
-- app.parada_ativo. Os seis casos mínimos do doc 02:
--   1. admin de outro tenant não vê, não grava nem encerra;
--   2. quem tem escrita no hotel registra, em nome dele mesmo (o solicitante
--      na abertura, o técnico na execução); encerram o gerente e o técnico
--      responsável por OS não cancelada do chamado; outro técnico do hotel, o
--      do outro hotel, o da OS cancelada e o solicitante, não;
--   3. o proprietário da UH vê as paradas dos ativos da UH dele, e só elas;
--      não grava nem encerra;
--   4. técnico de outro hotel não vê nem grava;
--   5. sem contexto, nada;
--   6. FK composta: a parada só existe no chamado do mesmo ativo, na OS do
--      mesmo chamado e com usuário do tenant.
-- E o implantador vencido do Hotel 1, que não vê nem registra (B2 do docs/11).
-- Mais: fim depois do início; fim e quem encerrou juntos; uma parada aberta
-- por ativo (índice único parcial); UPDATE só de fim, encerrada_por e
-- atualizado_em; sem DELETE; worker vê só o tenant do job.
-- ============================================================================
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(44);

grant usage on schema extensions to hk_app, hk_worker;

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'admin@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'gerente@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000004', 'tecnico@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000005', 'tecnico-outro@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000006', 'proprietario@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000007', 'tecnico-h2@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000008', 'implantador-vencido@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000009', 'solicitante@a.test'),
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
  ('11110000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'uh', 'UH 102', 'uh 102', 'ativo'),
  ('11120000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000002', 'area_comum', 'Lobby H2', 'lobby h2', 'ativo'),
  ('22210000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000000', '22200000-0000-0000-0000-000000000001', 'area_comum', 'Lobby B', 'lobby b', 'ativo');
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
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000009', 'solicitante', 'hotel', '11100000-0000-0000-0000-000000000001', null, null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '20000000-0000-0000-0000-000000000000', 'bbbbbbbb-0000-0000-0000-000000000001', 'admin_grupo', 'grupo', null, null, null, 'bbbbbbbb-0000-0000-0000-000000000001');
-- a1 e a4: UH 101 (do proprietário); a2: UH 102; a3: Hotel 2; ab: tenant B.
insert into app.ativo (codigo_qr, id, tenant_id, hotel_id, local_id, nome, busca) values
  ('Q000000001', 'a1000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
   '11110000-0000-0000-0000-000000000001', 'Frigobar 101', 'frigobar 101'),
  ('Q000000002', 'a1000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
   '11110000-0000-0000-0000-000000000002', 'Frigobar 102', 'frigobar 102'),
  ('Q000000004', 'a1000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
   '11110000-0000-0000-0000-000000000001', 'Ar 101', 'ar 101'),
  ('Q000000003', 'a2000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000002',
   '11120000-0000-0000-0000-000000000001', 'Porta H2', 'porta h2'),
  ('QB00000001', 'ab000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000000', '22200000-0000-0000-0000-000000000001',
   '22210000-0000-0000-0000-000000000001', 'Ativo B', 'ativo b');

insert into app.situacao (id, tenant_id, entidade, estado, chave_padrao, ordem, cor) values
  ('5a000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', 'chamado', 'em_execucao', 'chamado_em_execucao', 10, '#2563eb'),
  ('5a000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000000', 'os', 'em_execucao', 'os_em_execucao', 10, '#2563eb'),
  ('5b000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000000', 'chamado', 'em_execucao', 'chamado_em_execucao', 10, '#2563eb'),
  ('5b000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000000', 'os', 'em_execucao', 'os_em_execucao', 10, '#2563eb');
insert into app.prioridade (id, tenant_id, chave_padrao, ordem, peso) values
  ('9a000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', 'baixa', 40, 10),
  ('9b000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000000', 'baixa', 40, 10);
-- c1 (a1, OS do técnico), c2 (a2, sem OS), c3 (sem ativo), c4 (a4, OS cancelada), c5 (Hotel 2), cb (tenant B).
insert into app.chamado (id, tenant_id, hotel_id, local_id, ativo_id, descricao, busca, estado, situacao_id, prioridade_id, politica_aplicada, aberto_por)
select c.id::uuid, c.tenant::uuid, c.hotel::uuid, c.local::uuid, c.ativo::uuid, c.descricao, c.descricao, 'em_execucao', c.situacao::uuid,
       c.prioridade::uuid, '{}', c.aberto_por::uuid
from (values
  ('c1000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', '11110000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'frigobar', '5a000000-0000-0000-0000-000000000001', '9a000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000002'),
  ('c1000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', '11110000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000002', 'frigobar 102', '5a000000-0000-0000-0000-000000000001', '9a000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000009'),
  ('c1000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', '11110000-0000-0000-0000-000000000001', null, 'tomada', '5a000000-0000-0000-0000-000000000001', '9a000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000002'),
  ('c1000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', '11110000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000004', 'ar', '5a000000-0000-0000-0000-000000000001', '9a000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000002'),
  ('c2000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000002', '11120000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000001', 'porta', '5a000000-0000-0000-0000-000000000001', '9a000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('cb000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000000', '22200000-0000-0000-0000-000000000001', '22210000-0000-0000-0000-000000000001', 'ab000000-0000-0000-0000-000000000001', 'chamado b', '5b000000-0000-0000-0000-000000000001', '9b000000-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001')
) as c (id, tenant, hotel, local, ativo, descricao, situacao, prioridade, aberto_por);
insert into app.os (id, tenant_id, hotel_id, chamado_id, local_id, estado, situacao_id, tecnico_id, equipe_id, motivo_cancelamento, criado_por) values
  ('0a100000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', '11110000-0000-0000-0000-000000000001',
   'em_execucao', '5a000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000004', null, null, 'aaaaaaaa-0000-0000-0000-000000000002'),
  ('0a100000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000004', '11110000-0000-0000-0000-000000000001',
   'cancelada', '5a000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000004', null, 'Trocada', 'aaaaaaaa-0000-0000-0000-000000000002'),
  ('0a200000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000002', 'c2000000-0000-0000-0000-000000000001', '11120000-0000-0000-0000-000000000001',
   'em_execucao', '5a000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000007', null, null, 'aaaaaaaa-0000-0000-0000-000000000001');
-- Paradas abertas: p1 (a1/c1), p2 (a2/c2), p4 (a4/c4), p5 (Hotel 2), pb (tenant B).
insert into app.parada_ativo (id, tenant_id, hotel_id, ativo_id, chamado_id, os_id, inicio, aberta_por) values
  ('fa100000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001',
   'c1000000-0000-0000-0000-000000000001', null, now() - interval '5 hours', 'aaaaaaaa-0000-0000-0000-000000000002'),
  ('fa100000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000002',
   'c1000000-0000-0000-0000-000000000002', null, now() - interval '5 hours', 'aaaaaaaa-0000-0000-0000-000000000009'),
  ('fa100000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000004',
   'c1000000-0000-0000-0000-000000000004', null, now() - interval '5 hours', 'aaaaaaaa-0000-0000-0000-000000000002'),
  ('fa200000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000002', 'a2000000-0000-0000-0000-000000000001',
   'c2000000-0000-0000-0000-000000000001', '0a200000-0000-0000-0000-000000000001', now() - interval '5 hours', 'aaaaaaaa-0000-0000-0000-000000000007'),
  ('fb000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000000', '22200000-0000-0000-0000-000000000001', 'ab000000-0000-0000-0000-000000000001',
   'cb000000-0000-0000-0000-000000000001', null, now() - interval '5 hours', 'bbbbbbbb-0000-0000-0000-000000000001');
-- A auditoria da p4, que o proprietário não pode ler (quem abriu e o que mudou).
insert into app.auditoria (id, tenant_id, hotel_id, entidade, registro_id, acao, depois, usuario_id) values
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'parada_ativo',
   'fa100000-0000-0000-0000-000000000004', 'registrar', '{"chamadoId": "c1000000-0000-0000-0000-000000000004"}',
   'aaaaaaaa-0000-0000-0000-000000000002');

-- Caso 6 — FK composta, checks e a parada aberta única (como postgres)
select throws_ok(
  $$ insert into app.parada_ativo (id, tenant_id, hotel_id, ativo_id, chamado_id, inicio, fim, aberta_por, encerrada_por)
     values (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001',
             'c1000000-0000-0000-0000-000000000003', now() - interval '1 hour', now() - interval '30 minutes',
             'aaaaaaaa-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000002') $$,
  '23503', null, 'parada em chamado sem ativo (encerrada, para o índice da aberta não responder antes da FK)');
select throws_ok(
  $$ insert into app.parada_ativo (id, tenant_id, hotel_id, ativo_id, chamado_id, inicio, fim, aberta_por, encerrada_por)
     values (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000002',
             'c1000000-0000-0000-0000-000000000001', now() - interval '2 hours', now() - interval '1 hour',
             'aaaaaaaa-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000002') $$,
  '23503', null, 'parada de ativo que não é o do chamado');
select throws_ok(
  $$ insert into app.parada_ativo (id, tenant_id, hotel_id, ativo_id, chamado_id, os_id, inicio, fim, aberta_por, encerrada_por)
     values (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000002',
             'c1000000-0000-0000-0000-000000000002', '0a100000-0000-0000-0000-000000000001', now() - interval '2 hours', now() - interval '1 hour',
             'aaaaaaaa-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000002') $$,
  '23503', null, 'parada com OS de outro chamado');
select throws_ok(
  $$ insert into app.parada_ativo (id, tenant_id, hotel_id, ativo_id, chamado_id, inicio, fim, aberta_por, encerrada_por)
     values (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001',
             'c1000000-0000-0000-0000-000000000001', now() - interval '2 hours', now() - interval '1 hour',
             'bbbbbbbb-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001') $$,
  '23503', null, 'parada aberta por usuário de outro tenant');
select throws_ok(
  $$ insert into app.parada_ativo (id, tenant_id, hotel_id, ativo_id, chamado_id, inicio, fim, aberta_por, encerrada_por)
     values (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001',
             'c1000000-0000-0000-0000-000000000001', now() - interval '1 hour', now() - interval '2 hours',
             'aaaaaaaa-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000002') $$,
  '23514', null, 'fim precisa ser depois do início');
select throws_ok(
  $$ insert into app.parada_ativo (id, tenant_id, hotel_id, ativo_id, chamado_id, inicio, fim, aberta_por)
     values (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001',
             'c1000000-0000-0000-0000-000000000001', now() - interval '2 hours', now() - interval '1 hour',
             'aaaaaaaa-0000-0000-0000-000000000002') $$,
  '23514', null, 'fim sem quem encerrou');
select throws_ok(
  $$ insert into app.parada_ativo (id, tenant_id, hotel_id, ativo_id, chamado_id, inicio, aberta_por)
     values (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001',
             'c1000000-0000-0000-0000-000000000001', now() - interval '1 hour', 'aaaaaaaa-0000-0000-0000-000000000002') $$,
  '23505', null, 'uma parada aberta por ativo');
select lives_ok(
  $$ insert into app.parada_ativo (id, tenant_id, hotel_id, ativo_id, chamado_id, os_id, inicio, fim, aberta_por, encerrada_por)
     values (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001',
             'c1000000-0000-0000-0000-000000000001', '0a100000-0000-0000-0000-000000000001', now() - interval '9 hours', now() - interval '8 hours',
             'aaaaaaaa-0000-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000004') $$,
  'parada já encerrada não conflita com a aberta');

set local role hk_app;

-- Caso 5 — sem contexto
select from (select set_config('app.usuario_id', '', true), set_config('app.tenant_id', '', true)) ctx;
select is_empty('select 1 from app.parada_ativo', 'sem contexto: nenhuma parada');

-- Caso 1 — admin B
select from (select set_config('app.usuario_id', 'bbbbbbbb-0000-0000-0000-000000000001', true),
       set_config('app.tenant_id',  '20000000-0000-0000-0000-000000000000', true)) ctx;
select results_eq($$ select count(*)::int from app.parada_ativo where tenant_id = '10000000-0000-0000-0000-000000000000' $$,
  $$ values (0) $$, 'admin B não vê paradas do A');
select throws_ok(
  $$ insert into app.parada_ativo (id, tenant_id, hotel_id, ativo_id, chamado_id, inicio, fim, aberta_por, encerrada_por)
     values (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001',
             'c1000000-0000-0000-0000-000000000001', now() - interval '2 hours', now() - interval '1 hour',
             'bbbbbbbb-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001') $$,
  '42501', null, 'admin B não registra parada no A');
select is_empty($$ update app.parada_ativo set fim = now(), encerrada_por = 'bbbbbbbb-0000-0000-0000-000000000001'
  where id = 'fa100000-0000-0000-0000-000000000001' returning 1 $$, 'admin B não encerra parada do A');

-- Caso 2 — outro técnico do Hotel 1 (sem OS no chamado)
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000005', true),
       set_config('app.tenant_id',  '10000000-0000-0000-0000-000000000000', true)) ctx;
select is_empty($$ update app.parada_ativo set fim = now(), encerrada_por = 'aaaaaaaa-0000-0000-0000-000000000005'
  where id = 'fa100000-0000-0000-0000-000000000001' returning 1 $$, 'técnico sem a OS não encerra a parada');

-- Caso 2 — o Técnico responsável pela OS do chamado c1
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000004', true)) ctx;
select isnt_empty($$ select 1 from app.parada_ativo where hotel_id = '11100000-0000-0000-0000-000000000001' $$,
  'técnico do hotel vê as paradas do hotel');
select lives_ok(
  $$ insert into app.parada_ativo (id, tenant_id, hotel_id, ativo_id, chamado_id, os_id, inicio, fim, aberta_por, encerrada_por)
     values (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001',
             'c1000000-0000-0000-0000-000000000001', '0a100000-0000-0000-0000-000000000001', now() - interval '7 hours', now() - interval '6 hours',
             'aaaaaaaa-0000-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000004') $$,
  'responsável registra a parada na OS dele');
select throws_ok(
  $$ insert into app.parada_ativo (id, tenant_id, hotel_id, ativo_id, chamado_id, os_id, inicio, fim, aberta_por, encerrada_por)
     values (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001',
             'c1000000-0000-0000-0000-000000000001', '0a100000-0000-0000-0000-000000000001', now() - interval '7 hours', now() - interval '6 hours',
             'aaaaaaaa-0000-0000-0000-000000000005', 'aaaaaaaa-0000-0000-0000-000000000005') $$,
  '42501', null, 'técnico não registra em nome de outro');
select throws_ok(
  $$ update app.parada_ativo set fim = now(), encerrada_por = 'aaaaaaaa-0000-0000-0000-000000000005'
     where id = 'fa100000-0000-0000-0000-000000000001' $$,
  '42501', null, 'técnico não encerra em nome de outro');
select throws_ok(
  $$ update app.parada_ativo set ativo_id = 'a1000000-0000-0000-0000-000000000004'
     where id = 'fa100000-0000-0000-0000-000000000001' $$,
  '42501', null, 'sem UPDATE no ativo da parada');
select throws_ok(
  $$ update app.parada_ativo set inicio = now() where id = 'fa100000-0000-0000-0000-000000000001' $$,
  '42501', null, 'sem UPDATE no início da parada');
select isnt_empty($$ update app.parada_ativo set fim = now(), encerrada_por = 'aaaaaaaa-0000-0000-0000-000000000004', atualizado_em = now()
  where id = 'fa100000-0000-0000-0000-000000000001' returning 1 $$, 'responsável encerra a parada do chamado da OS dele');
select is_empty($$ update app.parada_ativo set fim = now(), encerrada_por = 'aaaaaaaa-0000-0000-0000-000000000004'
  where id = 'fa100000-0000-0000-0000-000000000002' returning 1 $$, 'técnico não encerra parada de chamado sem OS dele');
select is_empty($$ update app.parada_ativo set fim = now(), encerrada_por = 'aaaaaaaa-0000-0000-0000-000000000004'
  where id = 'fa100000-0000-0000-0000-000000000004' returning 1 $$, 'com a OS cancelada, o técnico não encerra');

-- Caso 4 — técnico do Hotel 2
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000007', true)) ctx;
select results_eq($$ select count(*)::int from app.parada_ativo where hotel_id = '11100000-0000-0000-0000-000000000001' $$,
  $$ values (0) $$, 'técnico do Hotel 2 não vê paradas do Hotel 1');
select throws_ok(
  $$ insert into app.parada_ativo (id, tenant_id, hotel_id, ativo_id, chamado_id, inicio, fim, aberta_por, encerrada_por)
     values (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001',
             'c1000000-0000-0000-0000-000000000001', now() - interval '12 hours', now() - interval '11 hours',
             'aaaaaaaa-0000-0000-0000-000000000007', 'aaaaaaaa-0000-0000-0000-000000000007') $$,
  '42501', null, 'técnico do Hotel 2 não registra no Hotel 1');
select isnt_empty($$ update app.parada_ativo set fim = now(), encerrada_por = 'aaaaaaaa-0000-0000-0000-000000000007'
  where id = 'fa200000-0000-0000-0000-000000000001' returning 1 $$, 'técnico do Hotel 2 encerra a parada da OS dele');

-- Implantador vencido do Hotel 1 (B2 do docs/11)
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000008', true)) ctx;
select is_empty($$ select 1 from app.parada_ativo $$, 'implantador vencido não vê parada');
select throws_ok(
  $$ insert into app.parada_ativo (id, tenant_id, hotel_id, ativo_id, chamado_id, inicio, fim, aberta_por, encerrada_por)
     values (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001',
             'c1000000-0000-0000-0000-000000000001', now() - interval '12 hours', now() - interval '11 hours',
             'aaaaaaaa-0000-0000-0000-000000000008', 'aaaaaaaa-0000-0000-0000-000000000008') $$,
  '42501', null, 'implantador vencido não registra parada');

-- Caso 2 — gerente do Hotel 1: vê e encerra
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000002', true)) ctx;
select results_eq($$ select count(*)::int from app.parada_ativo where hotel_id = '11100000-0000-0000-0000-000000000002' $$,
  $$ values (0) $$, 'gerente do Hotel 1 não vê as do Hotel 2');
select isnt_empty($$ update app.parada_ativo set fim = now(), encerrada_por = 'aaaaaaaa-0000-0000-0000-000000000002'
  where id = 'fa100000-0000-0000-0000-000000000002' returning 1 $$, 'gerente encerra a parada do hotel dele');

-- Caso 2 — solicitante: registra na abertura (em nome dele), não encerra
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000009', true)) ctx;
select lives_ok(
  $$ insert into app.parada_ativo (id, tenant_id, hotel_id, ativo_id, chamado_id, inicio, aberta_por)
     values ('fa100000-0000-0000-0000-000000000022', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000002',
             'c1000000-0000-0000-0000-000000000002', now() - interval '10 minutes', 'aaaaaaaa-0000-0000-0000-000000000009') $$,
  'solicitante registra a parada aberta');
select throws_ok(
  $$ insert into app.parada_ativo (id, tenant_id, hotel_id, ativo_id, chamado_id, inicio, fim, aberta_por, encerrada_por)
     values (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001',
             'c1000000-0000-0000-0000-000000000001', now() - interval '12 hours', now() - interval '11 hours',
             'aaaaaaaa-0000-0000-0000-000000000009', 'aaaaaaaa-0000-0000-0000-000000000002') $$,
  '42501', null, 'quem registra não põe outra pessoa como quem encerrou');
select is_empty($$ update app.parada_ativo set fim = now(), encerrada_por = 'aaaaaaaa-0000-0000-0000-000000000009'
  where id = 'fa100000-0000-0000-0000-000000000022' returning 1 $$, 'solicitante não encerra parada');

-- Caso 3 — proprietário da UH 101
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000006', true)) ctx;
select results_eq($$ select count(*)::int from app.parada_ativo where ativo_id = 'a1000000-0000-0000-0000-000000000004' $$,
  $$ values (1) $$, 'proprietário vê a parada do ativo da UH dele');
select results_eq($$ select count(*)::int from app.parada_ativo where ativo_id = 'a1000000-0000-0000-0000-000000000002' $$,
  $$ values (0) $$, 'proprietário não vê a parada de ativo de outra UH');
select throws_ok(
  $$ insert into app.parada_ativo (id, tenant_id, hotel_id, ativo_id, chamado_id, inicio, fim, aberta_por, encerrada_por)
     values (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001',
             'c1000000-0000-0000-0000-000000000001', now() - interval '12 hours', now() - interval '11 hours',
             'aaaaaaaa-0000-0000-0000-000000000006', 'aaaaaaaa-0000-0000-0000-000000000006') $$,
  '42501', null, 'proprietário não registra parada');
select is_empty($$ update app.parada_ativo set fim = now(), encerrada_por = 'aaaaaaaa-0000-0000-0000-000000000006'
  where id = 'fa100000-0000-0000-0000-000000000004' returning 1 $$, 'proprietário não encerra parada');
-- O que o proprietário não vê da parada (decisão do Cesar de 30/09/2026): o
-- autor não vira pessoa (membro), a auditoria e os eventos não são lidos, e
-- as paradas de outro hotel não aparecem. A API ainda tira chamadoId, osId e
-- autores da resposta para ele (veDetalhesDaParada).
select is_empty($$ select 1 from app.membro where usuario_id = 'aaaaaaaa-0000-0000-0000-000000000002' $$,
  'proprietário não lê o membro que abriu a parada');
select is_empty($$ select 1 from app.auditoria where registro_id = 'fa100000-0000-0000-0000-000000000004' $$,
  'proprietário não lê a auditoria da parada');
select throws_ok($$ select 1 from app.evento_dominio $$, '42501', null,
  'proprietário não lê os eventos (sem SELECT para o hk_app)');
select results_eq($$ select count(*)::int from app.parada_ativo where hotel_id = '11100000-0000-0000-0000-000000000002' $$,
  $$ values (0) $$, 'proprietário da UH não vê parada de outro hotel');

-- Admin A: vê tudo do tenant, encerra, sem DELETE
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000001', true)) ctx;
select results_eq($$ select count(distinct hotel_id)::int from app.parada_ativo $$, $$ values (2) $$,
  'admin A vê as paradas dos dois hotéis do tenant');
select isnt_empty($$ update app.parada_ativo set fim = now(), encerrada_por = 'aaaaaaaa-0000-0000-0000-000000000001'
  where id = 'fa100000-0000-0000-0000-000000000004' returning 1 $$, 'admin A encerra a parada');
select throws_ok($$ delete from app.parada_ativo $$, '42501', null, 'sem DELETE em parada');
reset role;

-- Worker vê só o tenant do job
set local role hk_worker;
select from (select set_config('app.tenant_id', '10000000-0000-0000-0000-000000000000', true)) ctx;
select results_eq('select count(distinct tenant_id)::int from app.parada_ativo', $$ values (1) $$,
  'worker vê só o tenant do job');
reset role;

select * from finish();
rollback;
