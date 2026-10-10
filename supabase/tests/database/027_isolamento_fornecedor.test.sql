-- ============================================================================
-- Isolamento de app.fornecedor (migração 0033, fase 1b I3). Os seis casos
-- mínimos do doc 02:
--   1. admin de outro tenant não vê nem grava;
--   2. gerente de hotel: a tabela não tem hotel_id (o fornecedor é do grupo),
--      então o caso vira "o gerente do Hotel 1 lê e grava os fornecedores do
--      grupo, inclusive os que outro cadastrou, e não muda o tenant da linha";
--   3. proprietário (de UH, de hotel inteiro e com escopo de hotel) não lê nem
--      grava: a leitura é de quem tem papel de escrita em algum hotel;
--   4. implantador vencido não vê nada;
--   5. sem contexto, nada;
--   6. FK: a tabela só referencia o tenant (sem hotel nem local); o caso vira
--      integridade: tenant inexistente, CNPJ único no grupo quando informado,
--      formato do CNPJ e nome preenchido.
-- Mais: o Gestor CSC grava; Técnico e Implantador vigente leem e não gravam;
-- id e tenant_id não são alteráveis; sem DELETE; o worker não tem acesso.
-- E a auditoria sem hotel do fornecedor (0033): o Gerente grava e lê a do
-- fornecedor que existe, e só ela; o Técnico, não.
-- ============================================================================
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(41);

grant usage on schema extensions to hk_app, hk_worker;

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'admin@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'gerente@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000003', 'gestor@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000004', 'tecnico@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000005', 'implantador-vencido@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000006', 'dono-uh@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000007', 'dono-hotel@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000008', 'proprietario-hotel@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000009', 'implantador@a.test'),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'admin@b.test');

insert into app.tenant (id, nome) values
  ('10000000-0000-0000-0000-000000000000', 'Grupo A'),
  ('20000000-0000-0000-0000-000000000000', 'Grupo B');
insert into app.membro (tenant_id, usuario_id, nome, email)
select '10000000-0000-0000-0000-000000000000', id, email, email from auth.users where email like '%@a.test';
insert into app.membro (tenant_id, usuario_id, nome, email) values
  ('20000000-0000-0000-0000-000000000000', 'bbbbbbbb-0000-0000-0000-000000000001', 'Admin B', 'admin@b.test');
insert into app.bandeira (id, tenant_id, nome) values
  ('1b000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', 'Bandeira X');
insert into app.hotel (id, tenant_id, bandeira_id, nome, fuso, status) values
  ('11100000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '1b000000-0000-0000-0000-000000000001', 'Hotel 1', 'UTC', 'ativo'),
  ('11100000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000000', null, 'Hotel 3', 'UTC', 'em_implantacao');
insert into app.local (id, tenant_id, hotel_id, tipo, nome, busca, status) values
  ('11110000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'uh', 'UH 101', 'uh 101', 'ativo');
insert into app.proprietario (id, tenant_id, nome) values
  ('11200000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', 'Dono de UH'),
  ('11200000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000000', 'Dono do Hotel 3');
insert into app.local_proprietario (id, tenant_id, proprietario_id, local_id, vigencia_inicio) values
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11200000-0000-0000-0000-000000000001',
   '11110000-0000-0000-0000-000000000001', current_date - 1);
insert into app.hotel_proprietario (id, tenant_id, proprietario_id, hotel_id, vigencia_inicio) values
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11200000-0000-0000-0000-000000000002',
   '11100000-0000-0000-0000-000000000003', current_date - 1);
insert into app.atribuicao_escopo (id, tenant_id, usuario_id, papel, escopo_tipo, bandeira_id, hotel_id, proprietario_id, valido_ate, concedido_por) values
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000001', 'admin_grupo', 'grupo', null, null, null, null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000002', 'gerente_hotel', 'hotel', null, '11100000-0000-0000-0000-000000000001', null, null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000003', 'gestor_csc', 'bandeira', '1b000000-0000-0000-0000-000000000001', null, null, null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000004', 'tecnico', 'hotel', null, '11100000-0000-0000-0000-000000000001', null, null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000005', 'implantador', 'hotel', null, '11100000-0000-0000-0000-000000000001', null, now() - interval '1 day', 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000006', 'proprietario', 'proprietario', null, null, '11200000-0000-0000-0000-000000000001', null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000007', 'proprietario', 'proprietario', null, null, '11200000-0000-0000-0000-000000000002', null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000008', 'proprietario', 'hotel', null, '11100000-0000-0000-0000-000000000001', null, null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000009', 'implantador', 'hotel', null, '11100000-0000-0000-0000-000000000001', null, now() + interval '30 days', 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '20000000-0000-0000-0000-000000000000', 'bbbbbbbb-0000-0000-0000-000000000001', 'admin_grupo', 'grupo', null, null, null, null, 'bbbbbbbb-0000-0000-0000-000000000001');
-- f1 com CNPJ, f2 sem CNPJ (tenant A); fb no tenant B, com o mesmo CNPJ do f1.
insert into app.fornecedor (id, tenant_id, nome, cnpj, contato_nome, contato_telefone, contato_email) values
  ('fa000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', 'Refrigeração Sul', '11222333000181', 'Ana', '+55 41 99999-0000', 'ana@fornecedor.test'),
  ('fa000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000000', 'Elétrica Local', null, null, null, null),
  ('fb000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000000', 'Fornecedor B', '11222333000181', null, null, null);

-- Caso 6 — integridade (como postgres)
select throws_ok(
  $$ insert into app.fornecedor (id, tenant_id, nome) values
     (gen_random_uuid(), '30000000-0000-0000-0000-000000000000', 'Sem tenant') $$,
  '23503', null, 'fornecedor só existe em tenant que existe');
select throws_ok(
  $$ insert into app.fornecedor (id, tenant_id, nome, cnpj) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'Outro nome', '11222333000181') $$,
  '23505', null, 'o mesmo CNPJ não entra duas vezes no grupo');
select lives_ok(
  $$ insert into app.fornecedor (id, tenant_id, nome) values
     ('fa000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000000', 'Pintura sem CNPJ') $$,
  'vários fornecedores sem CNPJ no mesmo grupo');
select throws_ok(
  $$ insert into app.fornecedor (id, tenant_id, nome, cnpj) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'Pontuado', '11.222.333/0001-81') $$,
  '23514', null, 'CNPJ sem pontuação');
select lives_ok(
  $$ insert into app.fornecedor (id, tenant_id, nome, cnpj) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'Alfanumérico', '12ABC34501DE35') $$,
  'CNPJ alfanumérico: 12 letras maiúsculas ou dígitos e 2 dígitos verificadores (0035)');
select throws_ok(
  $$ insert into app.fornecedor (id, tenant_id, nome, cnpj) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'Minúsculo', '12abc34501de35') $$,
  '23514', null, 'CNPJ alfanumérico só em maiúsculas (o domínio converte)');
select throws_ok(
  $$ insert into app.fornecedor (id, tenant_id, nome) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '   ') $$,
  '23514', null, 'nome preenchido');

set local role hk_app;

-- Caso 5 — sem contexto
select from (select set_config('app.usuario_id', '', true), set_config('app.tenant_id', '', true)) ctx;
select is_empty('select 1 from app.fornecedor', 'sem contexto: nenhum fornecedor');

-- Caso 1 — admin B
select from (select set_config('app.usuario_id', 'bbbbbbbb-0000-0000-0000-000000000001', true),
       set_config('app.tenant_id',  '20000000-0000-0000-0000-000000000000', true)) ctx;
select results_eq($$ select count(*)::int from app.fornecedor where tenant_id = '10000000-0000-0000-0000-000000000000' $$,
  $$ values (0) $$, 'admin B não vê fornecedores do A');
select is_empty($$ update app.fornecedor set nome = 'x' where tenant_id = '10000000-0000-0000-0000-000000000000' returning 1 $$,
  'admin B não altera fornecedor do A');
select throws_ok(
  $$ insert into app.fornecedor (id, tenant_id, nome) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'Intruso') $$,
  '42501', null, 'admin B não cria fornecedor no A');

-- Caso 2 — gerente do Hotel 1: lê e grava os do grupo
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000002', true),
       set_config('app.tenant_id',  '10000000-0000-0000-0000-000000000000', true)) ctx;
select results_eq($$ select count(*)::int from app.fornecedor $$, $$ values (3) $$,
  'gerente lê os fornecedores do grupo');
select lives_ok(
  $$ insert into app.fornecedor (id, tenant_id, nome) values
     ('fa000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000000', 'Serralheria do Hotel 1') $$,
  'gerente cadastra fornecedor do grupo');
select isnt_empty($$ update app.fornecedor set nome = 'Elétrica Local Ltda', versao = versao + 1
                     where id = 'fa000000-0000-0000-0000-000000000002' returning 1 $$,
  'gerente altera fornecedor que outro cadastrou');
select throws_ok($$ update app.fornecedor set tenant_id = '20000000-0000-0000-0000-000000000000' $$,
  '42501', null, 'o tenant do fornecedor não é alterável');

-- Gestor CSC da bandeira: lê e grava
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000003', true)) ctx;
select results_eq($$ select count(*)::int from app.fornecedor $$, $$ values (4) $$,
  'gestor CSC lê os fornecedores do grupo');
select lives_ok(
  $$ insert into app.fornecedor (id, tenant_id, nome, cnpj) values
     ('fa000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000000', 'Elevadores Centro', '11444777000161') $$,
  'gestor CSC cadastra fornecedor');

-- Técnico: lê, não grava
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000004', true)) ctx;
select results_eq($$ select count(*)::int from app.fornecedor $$, $$ values (5) $$,
  'técnico lê os fornecedores do grupo');
select throws_ok(
  $$ insert into app.fornecedor (id, tenant_id, nome) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'Do técnico') $$,
  '42501', null, 'técnico não cadastra fornecedor');
select is_empty($$ update app.fornecedor set nome = 'x' returning 1 $$, 'técnico não altera fornecedor');

-- Implantador vigente: lê, não grava
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000009', true)) ctx;
select results_eq($$ select count(*)::int from app.fornecedor $$, $$ values (5) $$,
  'implantador vigente lê os fornecedores do grupo');
select throws_ok(
  $$ insert into app.fornecedor (id, tenant_id, nome) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'Do implantador') $$,
  '42501', null, 'implantador não cadastra fornecedor');

-- Caso 3 — proprietários não leem nem gravam
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000006', true)) ctx;
select is_empty('select 1 from app.fornecedor', 'dono de UH não lê fornecedor');
select throws_ok(
  $$ insert into app.fornecedor (id, tenant_id, nome) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'Do dono') $$,
  '42501', null, 'dono de UH não cadastra fornecedor');
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000007', true)) ctx;
select is_empty('select 1 from app.fornecedor', 'dono de hotel inteiro não lê fornecedor');
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000008', true)) ctx;
select is_empty('select 1 from app.fornecedor', 'proprietário com escopo de hotel não lê fornecedor');

-- Caso 4 — implantador vencido
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000005', true)) ctx;
select is_empty('select 1 from app.fornecedor', 'implantador vencido não vê fornecedor');

-- Admin A: desativa; id fixo; sem DELETE
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000001', true)) ctx;
select isnt_empty($$ update app.fornecedor set desativado_em = now(), versao = versao + 1
                     where id = 'fa000000-0000-0000-0000-000000000003' returning 1 $$,
  'admin desativa fornecedor');
select throws_ok($$ update app.fornecedor set id = gen_random_uuid() $$, '42501', null,
  'o id do fornecedor não é alterável');
select throws_ok($$ delete from app.fornecedor $$, '42501', null, 'sem DELETE em fornecedor');

-- Auditoria sem hotel do fornecedor: o gerente grava a do fornecedor que existe
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000002', true)) ctx;
select lives_ok(
  $$ insert into app.auditoria (id, tenant_id, hotel_id, entidade, registro_id, acao, depois, usuario_id) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', null, 'fornecedor',
      'fa000000-0000-0000-0000-000000000004', 'criar', '{"nome": "Serralheria do Hotel 1"}',
      'aaaaaaaa-0000-0000-0000-000000000002') $$,
  'gerente audita o fornecedor que cadastrou');
select throws_ok(
  $$ insert into app.auditoria (id, tenant_id, hotel_id, entidade, registro_id, acao, usuario_id) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', null, 'fornecedor',
      gen_random_uuid(), 'criar', 'aaaaaaaa-0000-0000-0000-000000000002') $$,
  '42501', null, 'gerente não audita fornecedor que não existe');
select throws_ok(
  $$ insert into app.auditoria (id, tenant_id, hotel_id, entidade, registro_id, acao, usuario_id) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', null, 'bandeira',
      '1b000000-0000-0000-0000-000000000001', 'renomear', 'aaaaaaaa-0000-0000-0000-000000000002') $$,
  '42501', null, 'gerente continua sem auditoria sem hotel de outra entidade');
select throws_ok(
  $$ insert into app.auditoria (id, tenant_id, hotel_id, entidade, registro_id, acao, usuario_id) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', null, 'fornecedor',
      'fa000000-0000-0000-0000-000000000004', 'alterar', 'aaaaaaaa-0000-0000-0000-000000000001') $$,
  '42501', null, 'gerente não audita em nome de outro');
select results_eq(
  $$ select count(*)::int from app.auditoria where entidade = 'fornecedor'
     and registro_id = 'fa000000-0000-0000-0000-000000000004' $$,
  $$ values (1) $$, 'gerente lê a auditoria do fornecedor');

-- O gestor CSC também lê
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000003', true)) ctx;
select results_eq(
  $$ select count(*)::int from app.auditoria where entidade = 'fornecedor' $$,
  $$ values (1) $$, 'gestor CSC lê a auditoria do fornecedor');

-- O técnico não grava nem lê a auditoria do fornecedor
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000004', true)) ctx;
select throws_ok(
  $$ insert into app.auditoria (id, tenant_id, hotel_id, entidade, registro_id, acao, usuario_id) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', null, 'fornecedor',
      'fa000000-0000-0000-0000-000000000001', 'alterar', 'aaaaaaaa-0000-0000-0000-000000000004') $$,
  '42501', null, 'técnico não audita fornecedor');
select is_empty($$ select 1 from app.auditoria where entidade = 'fornecedor' $$,
  'técnico não lê a auditoria do fornecedor');

-- O proprietário com escopo de hotel também não lê a auditoria do fornecedor
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000008', true)) ctx;
select is_empty($$ select 1 from app.auditoria where entidade = 'fornecedor' $$,
  'proprietário não lê a auditoria do fornecedor');

-- O admin lê a auditoria do fornecedor, como toda auditoria do grupo
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000001', true)) ctx;
select results_eq(
  $$ select count(*)::int from app.auditoria where entidade = 'fornecedor' $$,
  $$ values (1) $$, 'admin lê a auditoria do fornecedor');
reset role;

-- Worker: nenhum job usa o fornecedor no MVP
set local role hk_worker;
select from (select set_config('app.tenant_id', '10000000-0000-0000-0000-000000000000', true)) ctx;
select throws_ok('select 1 from app.fornecedor', '42501', null, 'worker não lê fornecedor');
reset role;

select * from finish();
rollback;
