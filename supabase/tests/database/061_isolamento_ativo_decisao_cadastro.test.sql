-- ============================================================================
-- Isolamento de app.ativo_decisao_cadastro e das colunas novas de app.ativo
-- (situacao_cadastro e chave_importacao; migração 0058, fase 1b M4 e M2). Os
-- seis casos mínimos do doc 02:
--   1. admin de outro tenant não vê nem grava a decisão do tenant A;
--   2. gerente de hotel decide no hotel dele e não no de outro hotel;
--   3. o proprietário não lê a decisão;
--   4. implantador vencido não vê nada;
--   5. sem contexto, nada;
--   6. FK composta: o ativo da decisão é do mesmo hotel, e quem decide é
--      membro do próprio tenant; mais a integridade (uma decisão por ativo,
--      motivo obrigatório só na recusa, valores válidos, chave de importação
--      única por hotel).
-- Mais: o Gestor CSC da bandeira decide; o Técnico e o Implantador vigente
-- não decidem, mas leem a decisão (o motivo da recusa aparece no PWA); a
-- decisão sai em nome do usuário do contexto; ninguém altera a situação do
-- cadastro nem a chave de importação; a decisão não tem UPDATE nem DELETE; o
-- worker vê só o tenant do job e não grava.
-- ============================================================================
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(34);

grant usage on schema extensions to hk_app, hk_worker;

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'admin@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'gerente@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000003', 'gestor@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000004', 'tecnico@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000005', 'implantador@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000006', 'proprietario@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000008', 'implantador-vencido@a.test'),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'admin@b.test');

insert into app.tenant (id, nome) values
  ('10000000-0000-0000-0000-000000000000', 'Grupo A'),
  ('20000000-0000-0000-0000-000000000000', 'Grupo B');
insert into app.membro (tenant_id, usuario_id, nome, email)
select '10000000-0000-0000-0000-000000000000', id, email, email from auth.users where email like '%@a.test';
insert into app.membro (tenant_id, usuario_id, nome, email) values
  ('20000000-0000-0000-0000-000000000000', 'bbbbbbbb-0000-0000-0000-000000000001', 'Admin B', 'admin@b.test');
insert into app.bandeira (id, tenant_id, nome) values
  ('11000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000000', 'Bandeira X');
insert into app.hotel (id, tenant_id, bandeira_id, nome, fuso, status) values
  ('11100000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000',
   '11000000-0000-0000-0000-00000000000a', 'Hotel 1', 'UTC', 'ativo'),
  ('11100000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000000', null, 'Hotel 2', 'UTC', 'ativo'),
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
insert into app.atribuicao_escopo
  (id, tenant_id, usuario_id, papel, escopo_tipo, bandeira_id, hotel_id, proprietario_id, valido_ate, concedido_por)
values
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000001', 'admin_grupo', 'grupo', null, null, null, null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000002', 'gerente_hotel', 'hotel', null, '11100000-0000-0000-0000-000000000001', null, null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000003', 'gestor_csc', 'bandeira', '11000000-0000-0000-0000-00000000000a', null, null, null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000004', 'tecnico', 'hotel', null, '11100000-0000-0000-0000-000000000001', null, null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000005', 'implantador', 'hotel', null, '11100000-0000-0000-0000-000000000001', null, now() + interval '30 days', 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000006', 'proprietario', 'proprietario', null, null, '11200000-0000-0000-0000-000000000001', null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000008', 'implantador', 'hotel', null, '11100000-0000-0000-0000-000000000001', null, now() - interval '1 day', 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '20000000-0000-0000-0000-000000000000', 'bbbbbbbb-0000-0000-0000-000000000001', 'admin_grupo', 'grupo', null, null, null, null, 'bbbbbbbb-0000-0000-0000-000000000001');
-- Ativos: a1, a1b e a1c pendentes no Hotel 1; a1d sem situação informada
-- (como os que já existiam); a2 pendente no Hotel 2; ab no tenant B.
insert into app.ativo (codigo_qr, id, tenant_id, hotel_id, local_id, nome, busca, situacao_cadastro, chave_importacao) values
  ('Q000000001', 'a1000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
   '11110000-0000-0000-0000-000000000001', 'Split UH 101', 'split uh 101', 'pendente', 'chave-1'),
  ('Q000000002', 'a1000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
   '11110000-0000-0000-0000-000000000001', 'Frigobar UH 101', 'frigobar uh 101', 'pendente', null),
  ('Q000000003', 'a1000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
   '11110000-0000-0000-0000-000000000001', 'TV UH 101', 'tv uh 101', 'pendente', null),
  ('Q000000005', 'a2000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000002',
   '11120000-0000-0000-0000-000000000001', 'Split UH 201', 'split uh 201', 'pendente', 'chave-1'),
  ('Q000000006', 'ab000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000000', '22200000-0000-0000-0000-000000000001',
   '22210000-0000-0000-0000-000000000001', 'Split B', 'split b', 'pendente', null);
insert into app.ativo (codigo_qr, id, tenant_id, hotel_id, local_id, nome, busca) values
  ('Q000000004', 'a1000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
   '11110000-0000-0000-0000-000000000001', 'Cofre UH 101', 'cofre uh 101');
-- A recusa do a1c, já gravada pelo admin A.
insert into app.ativo_decisao_cadastro (id, tenant_id, hotel_id, ativo_id, decisao, motivo, decidido_por) values
  ('d1000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
   'a1000000-0000-0000-0000-000000000003', 'recusado', 'Ativo duplicado', 'aaaaaaaa-0000-0000-0000-000000000001');

-- Caso 6 — FK composta e integridade (como postgres)
select results_eq(
  $$ select situacao_cadastro from app.ativo where id = 'a1000000-0000-0000-0000-000000000004' $$,
  $$ values ('aprovado') $$, 'o ativo sem situação informada nasce aprovado (os que já existiam ficam aprovados)');
select throws_ok(
  $$ update app.ativo set situacao_cadastro = 'recusado' where id = 'a1000000-0000-0000-0000-000000000001' $$,
  '23514', null, 'a situação do cadastro é pendente ou aprovado');
select throws_ok(
  $$ update app.ativo set chave_importacao = 'chave-1' where id = 'a1000000-0000-0000-0000-000000000002' $$,
  '23505', null, 'a chave de importação é única no hotel');
select results_eq(
  $$ select count(*)::int from app.ativo where chave_importacao = 'chave-1' $$,
  $$ values (2) $$, 'a mesma chave de importação vale em outro hotel');
select throws_ok(
  $$ insert into app.ativo_decisao_cadastro (id, tenant_id, hotel_id, ativo_id, decisao, decidido_por) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
      'a2000000-0000-0000-0000-000000000001', 'aprovado', 'aaaaaaaa-0000-0000-0000-000000000001') $$,
  '23503', null, 'a decisão só aponta para ativo do mesmo hotel');
select throws_ok(
  $$ insert into app.ativo_decisao_cadastro (id, tenant_id, hotel_id, ativo_id, decisao, decidido_por) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
      'a1000000-0000-0000-0000-000000000001', 'aprovado', 'bbbbbbbb-0000-0000-0000-000000000001') $$,
  '23503', null, 'quem decide é membro do próprio tenant');
select throws_ok(
  $$ insert into app.ativo_decisao_cadastro (id, tenant_id, hotel_id, ativo_id, decisao, motivo, decidido_por) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
      'a1000000-0000-0000-0000-000000000001', 'recusado', '  ', 'aaaaaaaa-0000-0000-0000-000000000001') $$,
  '23514', null, 'a recusa exige motivo');
select throws_ok(
  $$ insert into app.ativo_decisao_cadastro (id, tenant_id, hotel_id, ativo_id, decisao, motivo, decidido_por) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
      'a1000000-0000-0000-0000-000000000001', 'aprovado', 'ok', 'aaaaaaaa-0000-0000-0000-000000000001') $$,
  '23514', null, 'a aprovação não leva motivo');
select throws_ok(
  $$ insert into app.ativo_decisao_cadastro (id, tenant_id, hotel_id, ativo_id, decisao, decidido_por) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
      'a1000000-0000-0000-0000-000000000001', 'talvez', 'aaaaaaaa-0000-0000-0000-000000000001') $$,
  '23514', null, 'a decisão é aprovado ou recusado');
select throws_ok(
  $$ insert into app.ativo_decisao_cadastro (id, tenant_id, hotel_id, ativo_id, decisao, decidido_por) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
      'a1000000-0000-0000-0000-000000000003', 'aprovado', 'aaaaaaaa-0000-0000-0000-000000000001') $$,
  '23505', null, 'uma decisão por ativo');

set local role hk_app;

-- Caso 5 — sem contexto
select from (select set_config('app.usuario_id', '', true), set_config('app.tenant_id', '', true)) ctx;
select is_empty('select 1 from app.ativo_decisao_cadastro', 'sem contexto: nenhuma decisão');

-- Caso 1 — admin B
select from (select set_config('app.usuario_id', 'bbbbbbbb-0000-0000-0000-000000000001', true),
       set_config('app.tenant_id',  '20000000-0000-0000-0000-000000000000', true)) ctx;
select is_empty('select 1 from app.ativo_decisao_cadastro', 'admin B não vê a decisão do A');
select throws_ok(
  $$ insert into app.ativo_decisao_cadastro (id, tenant_id, hotel_id, ativo_id, decisao, decidido_por) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
      'a1000000-0000-0000-0000-000000000001', 'aprovado', 'bbbbbbbb-0000-0000-0000-000000000001') $$,
  '42501', null, 'admin B não decide no A');

-- Técnico do Hotel 1: lê a decisão, não decide, não muda a situação
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000004', true),
       set_config('app.tenant_id',  '10000000-0000-0000-0000-000000000000', true)) ctx;
select results_eq(
  $$ select decisao, motivo from app.ativo_decisao_cadastro where ativo_id = 'a1000000-0000-0000-0000-000000000003' $$,
  $$ values ('recusado', 'Ativo duplicado') $$, 'técnico lê o motivo da recusa no hotel dele');
select throws_ok(
  $$ insert into app.ativo_decisao_cadastro (id, tenant_id, hotel_id, ativo_id, decisao, decidido_por) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
      'a1000000-0000-0000-0000-000000000001', 'aprovado', 'aaaaaaaa-0000-0000-0000-000000000004') $$,
  '42501', null, 'técnico não aprova o próprio cadastro');
select throws_ok(
  $$ update app.ativo set situacao_cadastro = 'aprovado' where id = 'a1000000-0000-0000-0000-000000000001' $$,
  '42501', null, 'técnico não muda a situação do cadastro');
select lives_ok(
  $$ insert into app.ativo (codigo_qr, id, tenant_id, hotel_id, local_id, nome, busca, situacao_cadastro) values
     ('Q000000007', 'a1000000-0000-0000-0000-000000000007', '10000000-0000-0000-0000-000000000000',
      '11100000-0000-0000-0000-000000000001', '11110000-0000-0000-0000-000000000001', 'Ar novo', 'ar novo', 'pendente') $$,
  'técnico cadastra ativo pendente no hotel dele');

-- Implantador vigente: lê, não decide
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000005', true)) ctx;
select results_eq('select count(*)::int from app.ativo_decisao_cadastro', $$ values (1) $$,
  'implantador lê as decisões do hotel');
select throws_ok(
  $$ insert into app.ativo_decisao_cadastro (id, tenant_id, hotel_id, ativo_id, decisao, decidido_por) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
      'a1000000-0000-0000-0000-000000000001', 'aprovado', 'aaaaaaaa-0000-0000-0000-000000000005') $$,
  '42501', null, 'implantador não decide o cadastro');

-- Caso 2 — gerente do Hotel 1: decide no hotel dele, em nome próprio
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000002', true)) ctx;
select throws_ok(
  $$ insert into app.ativo_decisao_cadastro (id, tenant_id, hotel_id, ativo_id, decisao, decidido_por) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
      'a1000000-0000-0000-0000-000000000001', 'aprovado', 'aaaaaaaa-0000-0000-0000-000000000001') $$,
  '42501', null, 'gerente não decide em nome de outro');
select lives_ok(
  $$ insert into app.ativo_decisao_cadastro (id, tenant_id, hotel_id, ativo_id, decisao, decidido_por) values
     ('d1000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
      'a1000000-0000-0000-0000-000000000001', 'aprovado', 'aaaaaaaa-0000-0000-0000-000000000002') $$,
  'gerente aprova o cadastro no hotel dele');
select throws_ok(
  $$ insert into app.ativo_decisao_cadastro (id, tenant_id, hotel_id, ativo_id, decisao, decidido_por) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000002',
      'a2000000-0000-0000-0000-000000000001', 'aprovado', 'aaaaaaaa-0000-0000-0000-000000000002') $$,
  '42501', null, 'gerente não decide em outro hotel');
select isnt_empty(
  $$ update app.ativo set desativado_em = now(), versao = versao + 1
     where id = 'a1000000-0000-0000-0000-000000000002' returning 1 $$,
  'a gestão desativa o ativo recusado pelo UPDATE de sempre');

-- Gestor CSC da bandeira do Hotel 1: recusa com motivo
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000003', true)) ctx;
select lives_ok(
  $$ insert into app.ativo_decisao_cadastro (id, tenant_id, hotel_id, ativo_id, decisao, motivo, decidido_por) values
     ('d1000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
      'a1000000-0000-0000-0000-000000000002', 'recusado', 'Cadastrado no local errado', 'aaaaaaaa-0000-0000-0000-000000000003') $$,
  'gestor CSC da bandeira recusa com motivo');

-- Caso 3 — proprietário da UH 101 não lê a decisão
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000006', true)) ctx;
select is_empty('select 1 from app.ativo_decisao_cadastro', 'proprietário não lê a decisão');

-- Caso 4 — implantador vencido
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000008', true)) ctx;
select is_empty('select 1 from app.ativo_decisao_cadastro', 'implantador vencido não vê decisão');
select throws_ok(
  $$ insert into app.ativo_decisao_cadastro (id, tenant_id, hotel_id, ativo_id, decisao, decidido_por) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
      'a1000000-0000-0000-0000-000000000004', 'aprovado', 'aaaaaaaa-0000-0000-0000-000000000008') $$,
  '42501', null, 'implantador vencido não decide');

-- Imutáveis (como o admin A): a decisão não muda nem some; a situação e a chave não mudam
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000001', true)) ctx;
select results_eq('select count(*)::int from app.ativo_decisao_cadastro', $$ values (3) $$,
  'admin A lê as decisões do grupo');
select throws_ok($$ update app.ativo_decisao_cadastro set motivo = 'outro' $$,
  '42501', null, 'a decisão não é alterável');
select throws_ok($$ delete from app.ativo_decisao_cadastro $$, '42501', null, 'sem DELETE na decisão');
select throws_ok($$ update app.ativo set situacao_cadastro = 'aprovado' $$,
  '42501', null, 'nem o admin muda a situação do cadastro');
select throws_ok($$ update app.ativo set chave_importacao = 'outra' $$,
  '42501', null, 'a chave de importação não é alterável');
reset role;

-- Worker: só o tenant do job, sem gravar
set local role hk_worker;
select from (select set_config('app.tenant_id', '10000000-0000-0000-0000-000000000000', true)) ctx;
select results_eq('select count(distinct tenant_id)::int from app.ativo_decisao_cadastro', $$ values (1) $$,
  'worker vê só as decisões do tenant do job');
select throws_ok(
  $$ insert into app.ativo_decisao_cadastro (id, tenant_id, hotel_id, ativo_id, decisao, decidido_por) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
      'a1000000-0000-0000-0000-000000000004', 'aprovado', 'aaaaaaaa-0000-0000-0000-000000000001') $$,
  '42501', null, 'worker não decide');
reset role;

select * from finish();
rollback;
