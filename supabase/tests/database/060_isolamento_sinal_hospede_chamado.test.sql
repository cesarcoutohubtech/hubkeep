-- ============================================================================
-- Isolamento da ligação da reclamação de hóspede com o chamado (migração 0057,
-- adendo de 19/10/2026 ao ADR-047): app.sinal_hospede_chamado. Lê e liga quem
-- decide insight no hotel, em nome próprio. Os seis casos mínimos do doc 02:
--   1. admin de outro tenant não vê nem liga;
--   2. gerente de um hotel vê e liga só no hotel dele, mesmo a reclamação que
--      outra pessoa classificou; o gestor da bandeira vê os hotéis da bandeira;
--      o técnico e o solicitante do hotel não veem nem ligam;
--   3. o proprietário não vê;
--   4. implantador vencido não vê nada;
--   5. sem contexto, nada;
--   6. FK composta: a reclamação e o chamado do mesmo hotel, o hotel do mesmo
--      tenant, e quem liga é quem abriu o chamado.
-- Mais: uma ligação por reclamação; ligar só em nome próprio; só INSERT (sem
-- UPDATE nem DELETE); o worker não lê.
-- ============================================================================
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(25);

grant usage on schema extensions to hk_app, hk_worker;

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'admin@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'gerente-h1@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000003', 'gestor-b1@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000004', 'tecnico-h1@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000006', 'proprietario@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000008', 'implantador-vencido@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000009', 'solicitante-h1@a.test'),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'admin@b.test');

insert into app.tenant (id, nome) values
  ('10000000-0000-0000-0000-000000000000', 'Grupo A'),
  ('20000000-0000-0000-0000-000000000000', 'Grupo B');
insert into app.membro (tenant_id, usuario_id, nome, email)
select '10000000-0000-0000-0000-000000000000', id, email, email from auth.users where email like '%@a.test';
insert into app.membro (tenant_id, usuario_id, nome, email) values
  ('20000000-0000-0000-0000-000000000000', 'bbbbbbbb-0000-0000-0000-000000000001', 'Admin B', 'admin@b.test');
insert into app.bandeira (id, tenant_id, nome) values
  ('11000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000000', 'Bandeira 1');
-- H1 e H2 na Bandeira 1; HB no tenant B.
insert into app.hotel (id, tenant_id, bandeira_id, nome, fuso, status) values
  ('11100000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11000000-0000-0000-0000-00000000000a', 'Hotel 1', 'UTC', 'ativo'),
  ('11100000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000000', '11000000-0000-0000-0000-00000000000a', 'Hotel 2', 'UTC', 'ativo'),
  ('22200000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000000', null, 'Hotel B', 'UTC', 'ativo');
insert into app.local (id, tenant_id, hotel_id, tipo, nome, busca, status) values
  ('11110000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'uh', 'UH 101', 'uh 101', 'ativo'),
  ('11120000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000002', 'uh', 'UH 201', 'uh 201', 'ativo'),
  ('22210000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000000', '22200000-0000-0000-0000-000000000001', 'uh', 'UH B', 'uh b', 'ativo');
insert into app.proprietario (id, tenant_id, nome) values
  ('11200000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', 'Dono da UH 101');
insert into app.local_proprietario (id, tenant_id, proprietario_id, local_id, vigencia_inicio) values
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11200000-0000-0000-0000-000000000001',
   '11110000-0000-0000-0000-000000000001', current_date - 1);
insert into app.atribuicao_escopo (id, tenant_id, usuario_id, papel, escopo_tipo, bandeira_id, hotel_id, proprietario_id, valido_ate, concedido_por) values
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000001', 'admin_grupo', 'grupo', null, null, null, null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000002', 'gerente_hotel', 'hotel', null, '11100000-0000-0000-0000-000000000001', null, null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000003', 'gestor_csc', 'bandeira', '11000000-0000-0000-0000-00000000000a', null, null, null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000004', 'tecnico', 'hotel', null, '11100000-0000-0000-0000-000000000001', null, null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000006', 'proprietario', 'proprietario', null, null, '11200000-0000-0000-0000-000000000001', null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000008', 'implantador', 'hotel', null, '11100000-0000-0000-0000-000000000001', null, now() - interval '1 day', 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000009', 'solicitante', 'hotel', null, '11100000-0000-0000-0000-000000000001', null, null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '20000000-0000-0000-0000-000000000000', 'bbbbbbbb-0000-0000-0000-000000000001', 'admin_grupo', 'grupo', null, null, null, null, 'bbbbbbbb-0000-0000-0000-000000000001');
insert into app.situacao (id, tenant_id, entidade, estado, chave_padrao, ordem, cor) values
  ('5a000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', 'chamado', 'aberto', 'chamado_aberto', 10, '#2563eb'),
  ('5b000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000000', 'chamado', 'aberto', 'chamado_aberto', 10, '#2563eb');
insert into app.prioridade (id, tenant_id, chave_padrao, ordem, peso) values
  ('9a000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', 'alta', 20, 30),
  ('9b000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000000', 'alta', 20, 30);
-- Chamados: c1 (Hotel 1, aberto pelo gerente), c2 (Hotel 1, pelo admin), c3
-- (Hotel 2, pelo admin), c4 (Hotel 1, pelo técnico), c5 (Hotel 2, pelo
-- gerente do Hotel 1, que não decide no Hotel 2), cb (tenant B).
insert into app.chamado (id, tenant_id, hotel_id, local_id, descricao, busca, estado, situacao_id, prioridade_id, politica_aplicada, aberto_por, prazo_atendimento, prazo_solucao)
select c.id::uuid, c.tenant::uuid, c.hotel::uuid, c.local::uuid, c.descricao, c.descricao, 'aberto', c.situacao::uuid,
       c.prioridade::uuid, '{}', c.aberto_por::uuid, '2026-10-20 12:00+00', '2026-10-21 12:00+00'
from (values
  ('c1000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', '11110000-0000-0000-0000-000000000001', 'ar barulhento', '5a000000-0000-0000-0000-000000000001', '9a000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000002'),
  ('c2000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', '11110000-0000-0000-0000-000000000001', 'chuveiro frio', '5a000000-0000-0000-0000-000000000001', '9a000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('c3000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000002', '11120000-0000-0000-0000-000000000001', 'porta', '5a000000-0000-0000-0000-000000000001', '9a000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('c4000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', '11110000-0000-0000-0000-000000000001', 'lâmpada', '5a000000-0000-0000-0000-000000000001', '9a000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000004'),
  ('c5000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000002', '11120000-0000-0000-0000-000000000001', 'cortina', '5a000000-0000-0000-0000-000000000001', '9a000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000002'),
  ('cb000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000000', '22200000-0000-0000-0000-000000000001', '22210000-0000-0000-0000-000000000001', 'chamado b', '5b000000-0000-0000-0000-000000000001', '9b000000-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001')
) as c (id, tenant, hotel, local, descricao, situacao, prioridade, aberto_por);
-- Reclamações: s1, s2 e s4 no Hotel 1; s3 no Hotel 2; sb no tenant B.
insert into app.sinal_hospede (id, tenant_id, hotel_id, lote_id, fonte, id_externo, ocorrido_em, texto, importado_por)
select s.id::uuid, s.tenant::uuid, s.hotel::uuid, '1a000000-0000-0000-0000-000000000001', 'google', s.externo,
       now() - interval '1 day', 'Reclamação', s.importado_por::uuid
from (values
  ('5a100000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'r-1', 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('5a100000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'r-2', 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('5a100000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'r-4', 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('5a200000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000002', 'r-3', 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('5ab00000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000000', '22200000-0000-0000-0000-000000000001', 'r-b', 'bbbbbbbb-0000-0000-0000-000000000001')
) as s (id, tenant, hotel, externo, importado_por);
-- A ligação do tenant B.
insert into app.sinal_hospede_chamado (id, tenant_id, hotel_id, sinal_id, chamado_id, ligado_por) values
  ('1b000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000000', '22200000-0000-0000-0000-000000000001',
   '5ab00000-0000-0000-0000-000000000001', 'cb000000-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001');

-- Caso 6 — FK composta e integridade (como postgres)
select throws_ok(
  $$ insert into app.sinal_hospede_chamado (id, tenant_id, hotel_id, sinal_id, chamado_id, ligado_por) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
      '5a100000-0000-0000-0000-000000000001', 'c3000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001') $$,
  '23503', null, 'o chamado é do hotel da reclamação');
select throws_ok(
  $$ insert into app.sinal_hospede_chamado (id, tenant_id, hotel_id, sinal_id, chamado_id, ligado_por) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
      '5a200000-0000-0000-0000-000000000003', 'c2000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001') $$,
  '23503', null, 'a reclamação é do hotel da ligação');
select throws_ok(
  $$ insert into app.sinal_hospede_chamado (id, tenant_id, hotel_id, sinal_id, chamado_id, ligado_por) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
      '5a100000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001') $$,
  '23503', null, 'liga quem abriu o chamado');
select throws_ok(
  $$ insert into app.sinal_hospede_chamado (id, tenant_id, hotel_id, sinal_id, chamado_id, ligado_por) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '22200000-0000-0000-0000-000000000001',
      '5ab00000-0000-0000-0000-000000000001', 'cb000000-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001') $$,
  '23503', null, 'a ligação só em hotel do próprio tenant');

set local role hk_app;

-- Caso 5 — sem contexto
select from (select set_config('app.usuario_id', '', true), set_config('app.tenant_id', '', true)) ctx;
select is_empty('select 1 from app.sinal_hospede_chamado', 'sem contexto: nenhuma ligação');

-- Caso 1 — admin B
select from (select set_config('app.usuario_id', 'bbbbbbbb-0000-0000-0000-000000000001', true),
       set_config('app.tenant_id',  '20000000-0000-0000-0000-000000000000', true)) ctx;
select results_eq($$ select id::text from app.sinal_hospede_chamado $$,
  $$ values ('1b000000-0000-0000-0000-000000000001') $$, 'admin B vê só as ligações do B');
select throws_ok(
  $$ insert into app.sinal_hospede_chamado (id, tenant_id, hotel_id, sinal_id, chamado_id, ligado_por) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
      '5a100000-0000-0000-0000-000000000002', 'c2000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001') $$,
  '42501', null, 'admin B não liga no A');

-- Admin do grupo A: liga o chamado que abriu, em nome próprio
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000001', true),
       set_config('app.tenant_id',  '10000000-0000-0000-0000-000000000000', true)) ctx;
select lives_ok(
  $$ insert into app.sinal_hospede_chamado (id, tenant_id, hotel_id, sinal_id, chamado_id, ligado_por) values
     ('1a000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
      '5a100000-0000-0000-0000-000000000002', 'c2000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001') $$,
  'admin A liga a reclamação ao chamado que abriu');
select throws_ok(
  $$ insert into app.sinal_hospede_chamado (id, tenant_id, hotel_id, sinal_id, chamado_id, ligado_por) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
      '5a100000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000002') $$,
  '42501', null, 'ninguém liga em nome de outra pessoa');
select throws_ok(
  $$ insert into app.sinal_hospede_chamado (id, tenant_id, hotel_id, sinal_id, chamado_id, ligado_por) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
      '5a100000-0000-0000-0000-000000000002', 'c2000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001') $$,
  '23505', null, 'uma ligação por reclamação');

-- Caso 2 — gerente do Hotel 1: liga e vê só no hotel dele
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000002', true)) ctx;
select lives_ok(
  $$ insert into app.sinal_hospede_chamado (id, tenant_id, hotel_id, sinal_id, chamado_id, ligado_por) values
     ('1a000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
      '5a100000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000002') $$,
  'gerente liga a reclamação do hotel dele ao chamado que abriu, mesmo classificada por outra pessoa');
select throws_ok(
  $$ insert into app.sinal_hospede_chamado (id, tenant_id, hotel_id, sinal_id, chamado_id, ligado_por) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000002',
      '5a200000-0000-0000-0000-000000000003', 'c5000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000002') $$,
  '42501', null, 'gerente não liga em outro hotel');
select results_eq($$ select count(*)::int from app.sinal_hospede_chamado $$, $$ values (2) $$,
  'gerente vê as ligações do hotel dele');

-- Gestor CSC da Bandeira 1: vê as ligações dos hotéis da bandeira
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000003', true)) ctx;
select results_eq($$ select count(*)::int from app.sinal_hospede_chamado $$, $$ values (2) $$,
  'gestor da bandeira vê as ligações dos hotéis dela');

-- Técnico e solicitante do Hotel 1: não veem nem ligam
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000004', true)) ctx;
select is_empty('select 1 from app.sinal_hospede_chamado', 'técnico não vê a ligação');
select throws_ok(
  $$ insert into app.sinal_hospede_chamado (id, tenant_id, hotel_id, sinal_id, chamado_id, ligado_por) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
      '5a100000-0000-0000-0000-000000000004', 'c4000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000004') $$,
  '42501', null, 'técnico não liga, nem o chamado que abriu');
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000009', true)) ctx;
select is_empty('select 1 from app.sinal_hospede_chamado', 'solicitante não vê a ligação');

-- Caso 3 — proprietário da UH 101
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000006', true)) ctx;
select is_empty('select 1 from app.sinal_hospede_chamado', 'proprietário não vê a ligação');

-- Caso 4 — implantador vencido
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000008', true)) ctx;
select is_empty('select 1 from app.sinal_hospede_chamado', 'implantador vencido não vê nada');

-- Só INSERT: a ligação não muda e não sai (como o admin A)
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000001', true)) ctx;
select throws_ok($$ update app.sinal_hospede_chamado set chamado_id = 'c2000000-0000-0000-0000-000000000001' $$,
  '42501', null, 'o chamado da ligação não é alterável');
select throws_ok($$ update app.sinal_hospede_chamado set ligado_por = 'aaaaaaaa-0000-0000-0000-000000000001' $$,
  '42501', null, 'quem ligou não é alterável');
select throws_ok($$ update app.sinal_hospede_chamado set hotel_id = '11100000-0000-0000-0000-000000000002' $$,
  '42501', null, 'o hotel da ligação não é alterável');
select throws_ok($$ delete from app.sinal_hospede_chamado $$, '42501', null, 'sem DELETE na ligação');
select results_eq(
  $$ select sinal_id::text, chamado_id::text from app.sinal_hospede_chamado order by sinal_id $$,
  $$ values ('5a100000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001'),
            ('5a100000-0000-0000-0000-000000000002', 'c2000000-0000-0000-0000-000000000001') $$,
  'as ligações guardam a reclamação e o chamado');
reset role;

-- Worker: o job não usa a ligação
set local role hk_worker;
select from (select set_config('app.tenant_id', '10000000-0000-0000-0000-000000000000', true)) ctx;
select throws_ok('select 1 from app.sinal_hospede_chamado', '42501', null, 'worker não lê a ligação');
reset role;

select * from finish();
rollback;
