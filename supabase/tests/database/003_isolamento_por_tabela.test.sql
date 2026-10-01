-- ============================================================================
-- Isolamento tabela por tabela: os seis casos mínimos do doc 02 ("Modelo para
-- tabela nova") em toda tabela de app, staging e licenca, mais o hk_ingestao.
-- O 002 cobre hotel e local e a escalada de papel; aqui entra o resto.
--
-- Quando um caso não se aplica à tabela, o motivo fica escrito no bloco dela:
--   - tabela sem hotel_id (tenant, membro, bandeira, proprietario, staging,
--     contrato) não tem "outro hotel": o caso 2 vira "não grava fora do papel";
--   - FK composta só existe onde a tabela aponta para outra tabela do tenant;
--     evento_dominio, credencial_agente, carga, registro_externo e contrato só
--     apontam para app.tenant(id), que é o próprio tenant da linha.
--
-- Cenário (o mesmo do 002, com uma linha do tenant B em cada tabela):
--   Tenant A: bandeira A1; hotel A1 (bandeira A1), hotel A2 (sem bandeira);
--             UHs A1-101, A1-102 (hotel A1) e A2-201 (hotel A2);
--             proprietário P, dono da UH A1-101
--   Tenant B: bandeira B1; hotel B1; UH B1-101; proprietário PB, dono dela
-- ============================================================================
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(121);

-- pgTAP precisa ser executável pelos papéis testados (só nesta transação)
grant usage on schema extensions to hk_app, hk_ingestao;

-- ---------------------------------------------------------------------------
-- Fixtures (inseridas como postgres)
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'admin@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'gerente.a1@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000004', 'implantador.a2@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000005', 'implantador.expirado@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000006', 'proprietario@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000007', 'tecnico.novo@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000008', 'sem.membro@a.test'),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'admin@b.test');

insert into app.tenant (id, nome) values
  ('10000000-0000-0000-0000-000000000000', 'Grupo A'),
  ('20000000-0000-0000-0000-000000000000', 'Grupo B');

insert into app.membro (tenant_id, usuario_id, nome, email) values
  ('10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000001', 'Admin A', 'admin@a.test'),
  ('10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000002', 'Gerente A1', 'gerente.a1@a.test'),
  ('10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000004', 'Implantador A2', 'implantador.a2@a.test'),
  ('10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000005', 'Implantador Exp', 'implantador.expirado@a.test'),
  ('10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000006', 'Proprietário', 'proprietario@a.test'),
  ('10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000007', 'Técnico Novo', 'tecnico.novo@a.test'),
  ('20000000-0000-0000-0000-000000000000', 'bbbbbbbb-0000-0000-0000-000000000001', 'Admin B', 'admin@b.test');

insert into app.bandeira (id, tenant_id, nome) values
  ('11000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', 'Bandeira A1'),
  ('21000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000000', 'Bandeira B1');

insert into app.hotel (id, tenant_id, bandeira_id, nome, fuso, status) values
  ('11100000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11000000-0000-0000-0000-000000000001', 'Hotel A1', 'America/Sao_Paulo', 'ativo'),
  ('11100000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000000', null,                                   'Hotel A2', 'America/Sao_Paulo', 'em_implantacao'),
  ('21100000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000000', '21000000-0000-0000-0000-000000000001', 'Hotel B1', 'America/Sao_Paulo', 'ativo');

insert into app.local (id, tenant_id, hotel_id, tipo, nome, busca, status) values
  ('11110000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'uh', 'UH A1-101', 'uh a1-101', 'ativo'),
  ('11110000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'uh', 'UH A1-102', 'uh a1-102', 'ativo'),
  ('11110000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000002', 'uh', 'UH A2-201', 'uh a2-201', 'pendente_licenca'),
  ('21110000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000000', '21100000-0000-0000-0000-000000000001', 'uh', 'UH B1-101', 'uh b1-101', 'ativo');

insert into app.proprietario (id, tenant_id, nome) values
  ('11200000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', 'Proprietário P'),
  ('21200000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000000', 'Proprietário PB');

insert into app.local_proprietario (id, tenant_id, proprietario_id, local_id, vigencia_inicio) values
  ('11210000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000',
   '11200000-0000-0000-0000-000000000001', '11110000-0000-0000-0000-000000000001', current_date - 30),
  ('21210000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000000',
   '21200000-0000-0000-0000-000000000001', '21110000-0000-0000-0000-000000000001', current_date - 30);

insert into app.atribuicao_escopo
  (id, tenant_id, usuario_id, papel, escopo_tipo, bandeira_id, hotel_id, proprietario_id, valido_ate, concedido_por)
values
  ('a1000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000001',
   'admin_grupo', 'grupo', null, null, null, null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('a1000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000002',
   'gerente_hotel', 'hotel', null, '11100000-0000-0000-0000-000000000001', null, null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('a1000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000004',
   'implantador', 'hotel', null, '11100000-0000-0000-0000-000000000002', null, now() + interval '60 days', 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('a1000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000005',
   'implantador', 'hotel', null, '11100000-0000-0000-0000-000000000001', null, now() - interval '1 day', 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('a1000000-0000-0000-0000-000000000006', '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000006',
   'proprietario', 'proprietario', null, null, '11200000-0000-0000-0000-000000000001', null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('b1000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000000', 'bbbbbbbb-0000-0000-0000-000000000001',
   'admin_grupo', 'grupo', null, null, null, null, 'bbbbbbbb-0000-0000-0000-000000000001');

insert into app.auditoria (id, tenant_id, hotel_id, entidade, registro_id, acao, usuario_id) values
  ('c1000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
   'local', '11110000-0000-0000-0000-000000000001', 'teste', 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('c1000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000002',
   'local', '11110000-0000-0000-0000-000000000003', 'teste', 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('c1000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000000', null,
   'bandeira', '11000000-0000-0000-0000-000000000001', 'teste', 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('c2000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000000', '21100000-0000-0000-0000-000000000001',
   'local', '21110000-0000-0000-0000-000000000001', 'teste', 'bbbbbbbb-0000-0000-0000-000000000001');

insert into app.evento_dominio (id, tenant_id, tipo, entidade, registro_id, payload) values
  ('e1000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', 'teste', 'local', '11110000-0000-0000-0000-000000000001', '{}'),
  ('e2000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000000', 'teste', 'local', '21110000-0000-0000-0000-000000000001', '{}');

insert into staging.credencial_agente (id, tenant_id, descricao, hash_segredo, revogado_em) values
  ('d1000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', 'agente A', 'hash-a', null),
  ('d1000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000000', 'agente A antigo', 'hash-a-velho', now() - interval '1 day'),
  ('d2000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000000', 'agente B', 'hash-b', null);

insert into staging.carga (id, tenant_id, fonte, entidade, lote_hash) values
  ('f1000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', 'totvs_cm', 'uh', 'lote-a'),
  ('f2000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000000', 'totvs_cm', 'uh', 'lote-b');

insert into staging.registro_externo (tenant_id, fonte, entidade, chave, payload, hash) values
  ('10000000-0000-0000-0000-000000000000', 'totvs_cm', 'uh', 'A1-101', '{}', 'h-a'),
  ('20000000-0000-0000-0000-000000000000', 'totvs_cm', 'uh', 'B1-101', '{}', 'h-b');

insert into licenca.contrato (tenant_id, max_hoteis, max_uhs, atualizado_por) values
  ('10000000-0000-0000-0000-000000000000', 2, 300, 'teste'),
  ('20000000-0000-0000-0000-000000000000', 1, 100, 'teste');

-- ---------------------------------------------------------------------------
-- Caso 6 — FK composta: referência a linha de outro tenant é impossível.
-- Como postgres (ignora RLS), para provar que quem barra é a integridade.
-- O 002 cobre local → hotel.
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ insert into app.hotel (id, tenant_id, bandeira_id, nome, fuso, status) values
     ('11100000-0000-0000-0000-0000000000ff', '10000000-0000-0000-0000-000000000000',
      '21000000-0000-0000-0000-000000000001', 'invasor', 'America/Sao_Paulo', 'ativo') $$,
  '23503', null, 'hotel: bandeira de outro tenant é recusada pela FK composta');
select throws_ok(
  $$ insert into app.local_proprietario (id, tenant_id, proprietario_id, local_id, vigencia_inicio) values
     ('11210000-0000-0000-0000-0000000000ff', '10000000-0000-0000-0000-000000000000',
      '11200000-0000-0000-0000-000000000001', '21110000-0000-0000-0000-000000000001', current_date) $$,
  '23503', null, 'local_proprietario: UH de outro tenant é recusada pela FK composta');
select throws_ok(
  $$ insert into app.local_proprietario (id, tenant_id, proprietario_id, local_id, vigencia_inicio) values
     ('11210000-0000-0000-0000-0000000000fe', '10000000-0000-0000-0000-000000000000',
      '21200000-0000-0000-0000-000000000001', '11110000-0000-0000-0000-000000000002', current_date) $$,
  '23503', null, 'local_proprietario: proprietário de outro tenant é recusado pela FK composta');
select throws_ok(
  $$ insert into app.atribuicao_escopo (id, tenant_id, usuario_id, papel, escopo_tipo, hotel_id, concedido_por) values
     ('a1000000-0000-0000-0000-0000000000f1', '10000000-0000-0000-0000-000000000000',
      'aaaaaaaa-0000-0000-0000-000000000007', 'tecnico', 'hotel',
      '21100000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001') $$,
  '23503', null, 'atribuicao_escopo: hotel de outro tenant é recusado pela FK composta');
select throws_ok(
  $$ insert into app.atribuicao_escopo (id, tenant_id, usuario_id, papel, escopo_tipo, bandeira_id, concedido_por) values
     ('a1000000-0000-0000-0000-0000000000f2', '10000000-0000-0000-0000-000000000000',
      'aaaaaaaa-0000-0000-0000-000000000007', 'gestor_csc', 'bandeira',
      '21000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001') $$,
  '23503', null, 'atribuicao_escopo: bandeira de outro tenant é recusada pela FK composta');
select throws_ok(
  $$ insert into app.atribuicao_escopo (id, tenant_id, usuario_id, papel, escopo_tipo, proprietario_id, concedido_por) values
     ('a1000000-0000-0000-0000-0000000000f3', '10000000-0000-0000-0000-000000000000',
      'aaaaaaaa-0000-0000-0000-000000000007', 'proprietario', 'proprietario',
      '21200000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001') $$,
  '23503', null, 'atribuicao_escopo: proprietário de outro tenant é recusado pela FK composta');
select throws_ok(
  $$ insert into app.atribuicao_escopo (id, tenant_id, usuario_id, papel, escopo_tipo, hotel_id, concedido_por) values
     ('a1000000-0000-0000-0000-0000000000f4', '10000000-0000-0000-0000-000000000000',
      'bbbbbbbb-0000-0000-0000-000000000001', 'tecnico', 'hotel',
      '11100000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001') $$,
  '23503', null, 'atribuicao_escopo: usuário que só é membro de outro tenant é recusado pela FK composta');
select throws_ok(
  $$ insert into app.auditoria (id, tenant_id, hotel_id, entidade, registro_id, acao, usuario_id) values
     ('c1000000-0000-0000-0000-0000000000ff', '10000000-0000-0000-0000-000000000000',
      '21100000-0000-0000-0000-000000000001', 'local', '21110000-0000-0000-0000-000000000001',
      'teste', 'aaaaaaaa-0000-0000-0000-000000000001') $$,
  '23503', null, 'auditoria: hotel de outro tenant é recusado pela FK composta');

-- ---------------------------------------------------------------------------
-- Caso 5 — Sem contexto, nada é visível (falha fechada). O 002 cobre hotel.
-- ---------------------------------------------------------------------------
set local role hk_app;
select from (select set_config('app.usuario_id', '', true),
       set_config('app.tenant_id', '', true)) ctx;

select is_empty('select 1 from app.tenant',                'sem contexto: tenant vazio');
select is_empty('select 1 from app.membro',                'sem contexto: membro vazio');
select is_empty('select 1 from app.bandeira',              'sem contexto: bandeira vazia');
select is_empty('select 1 from app.local',                 'sem contexto: local vazio');
select is_empty('select 1 from app.proprietario',          'sem contexto: proprietario vazio');
select is_empty('select 1 from app.local_proprietario',    'sem contexto: local_proprietario vazio');
select is_empty('select 1 from app.atribuicao_escopo',     'sem contexto: atribuicao_escopo vazia');
select is_empty('select 1 from app.auditoria',             'sem contexto: auditoria vazia');
select is_empty('select 1 from staging.credencial_agente', 'sem contexto: credencial_agente vazia');
select is_empty('select 1 from staging.carga',             'sem contexto: carga vazia');
select is_empty('select 1 from staging.registro_externo',  'sem contexto: registro_externo vazio');
select is_empty('select 1 from licenca.contrato',          'sem contexto: contrato vazio');
-- hk_app só publica no outbox; ler é do worker, com ou sem contexto.
select throws_ok('select 1 from app.evento_dominio', '42501', null,
  'hk_app não lê evento_dominio (nem sem contexto)');

-- ---------------------------------------------------------------------------
-- Caso 1 — Admin do tenant B não vê, não grava e não altera linhas do A.
-- "Só B" em vez de "nada de A": prova que a consulta enxerga algo.
-- ---------------------------------------------------------------------------
select from (select set_config('app.usuario_id', 'bbbbbbbb-0000-0000-0000-000000000001', true),
       set_config('app.tenant_id',  '20000000-0000-0000-0000-000000000000', true)) ctx;

select results_eq('select id::text from app.tenant',
  $$ values ('20000000-0000-0000-0000-000000000000') $$, 'admin B: tenant, só B');
select results_eq('select distinct tenant_id::text from app.membro',
  $$ values ('20000000-0000-0000-0000-000000000000') $$, 'admin B: membro, só B');
select results_eq('select distinct tenant_id::text from app.bandeira',
  $$ values ('20000000-0000-0000-0000-000000000000') $$, 'admin B: bandeira, só B');
select results_eq('select distinct tenant_id::text from app.local',
  $$ values ('20000000-0000-0000-0000-000000000000') $$, 'admin B: local, só B');
select results_eq('select distinct tenant_id::text from app.proprietario',
  $$ values ('20000000-0000-0000-0000-000000000000') $$, 'admin B: proprietario, só B');
select results_eq('select distinct tenant_id::text from app.local_proprietario',
  $$ values ('20000000-0000-0000-0000-000000000000') $$, 'admin B: local_proprietario, só B');
select results_eq('select distinct tenant_id::text from app.atribuicao_escopo',
  $$ values ('20000000-0000-0000-0000-000000000000') $$, 'admin B: atribuicao_escopo, só B');
select results_eq('select distinct tenant_id::text from app.auditoria',
  $$ values ('20000000-0000-0000-0000-000000000000') $$, 'admin B: auditoria, só B');
select results_eq('select distinct tenant_id::text from staging.credencial_agente',
  $$ values ('20000000-0000-0000-0000-000000000000') $$, 'admin B: credencial_agente, só B');
select results_eq('select distinct tenant_id::text from staging.carga',
  $$ values ('20000000-0000-0000-0000-000000000000') $$, 'admin B: carga, só B');
select results_eq('select distinct tenant_id::text from staging.registro_externo',
  $$ values ('20000000-0000-0000-0000-000000000000') $$, 'admin B: registro_externo, só B');
select results_eq('select distinct tenant_id::text from licenca.contrato',
  $$ values ('20000000-0000-0000-0000-000000000000') $$, 'admin B: contrato, só B');

select throws_ok(
  $$ insert into app.membro (tenant_id, usuario_id, nome, email) values
     ('10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000008', 'x', 'x@a.test') $$,
  '42501', null, 'admin B não cria membro no tenant A');
select throws_ok(
  $$ insert into app.bandeira (id, tenant_id, nome) values
     ('11000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-000000000000', 'invasora') $$,
  '42501', null, 'admin B não cria bandeira no tenant A');
select throws_ok(
  $$ insert into app.hotel (id, tenant_id, nome, fuso, status) values
     ('11100000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-000000000000',
      'invasor', 'America/Sao_Paulo', 'ativo') $$,
  '42501', null, 'admin B não cria hotel no tenant A');
select throws_ok(
  $$ insert into app.local (id, tenant_id, hotel_id, tipo, nome, busca, status) values
     ('11110000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-000000000000',
      '11100000-0000-0000-0000-000000000001', 'uh', 'invasora', 'invasora', 'ativo') $$,
  '42501', null, 'admin B não cria local no tenant A');
select throws_ok(
  $$ insert into app.proprietario (id, tenant_id, nome) values
     ('11200000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-000000000000', 'invasor') $$,
  '42501', null, 'admin B não cria proprietário no tenant A');
select throws_ok(
  $$ insert into app.local_proprietario (id, tenant_id, proprietario_id, local_id, vigencia_inicio) values
     ('11210000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-000000000000',
      '11200000-0000-0000-0000-000000000001', '11110000-0000-0000-0000-000000000002', current_date) $$,
  '42501', null, 'admin B não vincula proprietário no tenant A');
select throws_ok(
  $$ insert into app.atribuicao_escopo (id, tenant_id, usuario_id, papel, escopo_tipo, concedido_por) values
     ('a1000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-000000000000',
      'aaaaaaaa-0000-0000-0000-000000000007', 'admin_grupo', 'grupo',
      'bbbbbbbb-0000-0000-0000-000000000001') $$,
  '42501', null, 'admin B não concede papel no tenant A');
select throws_ok(
  $$ insert into app.auditoria (id, tenant_id, hotel_id, entidade, registro_id, acao, usuario_id) values
     ('c1000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-000000000000', null,
      'x', '11100000-0000-0000-0000-000000000001', 'x', 'bbbbbbbb-0000-0000-0000-000000000001') $$,
  '42501', null, 'admin B não grava auditoria no tenant A');
select throws_ok(
  $$ insert into app.evento_dominio (id, tenant_id, tipo, entidade, registro_id, payload) values
     ('e1000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-000000000000',
      'x', 'x', '11100000-0000-0000-0000-000000000001', '{}') $$,
  '42501', null, 'admin B não publica evento no tenant A');
select throws_ok(
  $$ insert into staging.credencial_agente (id, tenant_id, descricao, hash_segredo) values
     ('d1000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-000000000000', 'x', 'x') $$,
  '42501', null, 'admin B não cria credencial de agente no tenant A');

select is_empty($$ update app.membro set nome = nome
  where tenant_id = '10000000-0000-0000-0000-000000000000' returning 1 $$, 'admin B não altera membro do tenant A');
select is_empty($$ update app.bandeira set nome = nome
  where tenant_id = '10000000-0000-0000-0000-000000000000' returning 1 $$, 'admin B não altera bandeira do tenant A');
select is_empty($$ update app.hotel set nome = nome
  where tenant_id = '10000000-0000-0000-0000-000000000000' returning 1 $$, 'admin B não altera hotel do tenant A');
select is_empty($$ update app.local set nome = nome
  where tenant_id = '10000000-0000-0000-0000-000000000000' returning 1 $$, 'admin B não altera local do tenant A');
select is_empty($$ update app.proprietario set nome = nome
  where tenant_id = '10000000-0000-0000-0000-000000000000' returning 1 $$, 'admin B não altera proprietário do tenant A');
select is_empty($$ update app.local_proprietario set vigencia_fim = vigencia_fim
  where tenant_id = '10000000-0000-0000-0000-000000000000' returning 1 $$, 'admin B não altera vínculo de proprietário do tenant A');
select is_empty($$ update app.atribuicao_escopo set valido_ate = valido_ate
  where tenant_id = '10000000-0000-0000-0000-000000000000' returning 1 $$, 'admin B não altera atribuição do tenant A');
select is_empty($$ update staging.credencial_agente set descricao = descricao
  where tenant_id = '10000000-0000-0000-0000-000000000000' returning 1 $$, 'admin B não altera credencial do tenant A');

-- ---------------------------------------------------------------------------
-- Caso 2 — Gerente do hotel A1 não vê nem grava linhas de outro hotel.
-- Tabelas sem hotel_id: o gerente não grava o que é do Admin do grupo e não
-- vê staging nem vínculos de proprietário. O 002 cobre hotel, local e
-- proprietario na leitura, e local na escrita.
-- ---------------------------------------------------------------------------
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000002', true),
       set_config('app.tenant_id',  '10000000-0000-0000-0000-000000000000', true)) ctx;

select results_eq('select hotel_id::text from app.auditoria',
  $$ values ('11100000-0000-0000-0000-000000000001') $$,
  'gerente A1 vê só a auditoria do hotel A1 (nem A2, nem a do grupo)');
select throws_ok(
  $$ insert into app.auditoria (id, tenant_id, hotel_id, entidade, registro_id, acao, usuario_id) values
     ('c1000000-0000-0000-0000-0000000000a2', '10000000-0000-0000-0000-000000000000',
      '11100000-0000-0000-0000-000000000002', 'local', '11110000-0000-0000-0000-000000000003',
      'x', 'aaaaaaaa-0000-0000-0000-000000000002') $$,
  '42501', null, 'gerente A1 não grava auditoria do hotel A2');
select results_eq('select id::text from app.atribuicao_escopo',
  $$ values ('a1000000-0000-0000-0000-000000000002') $$,
  'gerente A1 vê só a própria atribuição');
select throws_ok(
  $$ insert into app.atribuicao_escopo (id, tenant_id, usuario_id, papel, escopo_tipo, hotel_id, concedido_por) values
     ('a1000000-0000-0000-0000-0000000000a2', '10000000-0000-0000-0000-000000000000',
      'aaaaaaaa-0000-0000-0000-000000000007', 'tecnico', 'hotel',
      '11100000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000002') $$,
  '42501', null, 'gerente A1 não concede papel no hotel A2');
select is_empty('select 1 from app.local_proprietario', 'gerente A1 não vê vínculos de proprietário');
select throws_ok(
  $$ insert into app.local_proprietario (id, tenant_id, proprietario_id, local_id, vigencia_inicio) values
     ('11210000-0000-0000-0000-0000000000a2', '10000000-0000-0000-0000-000000000000',
      '11200000-0000-0000-0000-000000000001', '11110000-0000-0000-0000-000000000002', current_date) $$,
  '42501', null, 'gerente A1 não vincula proprietário');
select is_empty($$ update app.local set nome = nome
  where hotel_id = '11100000-0000-0000-0000-000000000002' returning 1 $$, 'gerente A1 não altera local do hotel A2');
select is_empty($$ update app.hotel set nome = nome
  where id = '11100000-0000-0000-0000-000000000002' returning 1 $$, 'gerente A1 não altera o hotel A2');
select is_empty('select 1 from staging.credencial_agente', 'gerente A1 não vê credenciais de agente');
select is_empty('select 1 from staging.carga',             'gerente A1 não vê cargas do staging');
select is_empty('select 1 from staging.registro_externo',  'gerente A1 não vê registros do staging');
select throws_ok(
  $$ insert into app.membro (tenant_id, usuario_id, nome, email) values
     ('10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000008', 'x', 'x@a.test') $$,
  '42501', null, 'gerente A1 não cria membro');
select throws_ok(
  $$ insert into app.bandeira (id, tenant_id, nome) values
     ('11000000-0000-0000-0000-0000000000a2', '10000000-0000-0000-0000-000000000000', 'x') $$,
  '42501', null, 'gerente A1 não cria bandeira');
select throws_ok(
  $$ insert into app.proprietario (id, tenant_id, nome) values
     ('11200000-0000-0000-0000-0000000000a2', '10000000-0000-0000-0000-000000000000', 'x') $$,
  '42501', null, 'gerente A1 não cria proprietário');

-- ---------------------------------------------------------------------------
-- Caso 3 — Proprietário vê só o que é das próprias UHs e não grava.
-- O 002 cobre local, hotel e membro na leitura e local no UPDATE.
-- ---------------------------------------------------------------------------
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000006', true)) ctx;

select results_eq('select local_id::text from app.local_proprietario',
  $$ values ('11110000-0000-0000-0000-000000000001') $$,
  'proprietário vê só o vínculo da própria UH');
select results_eq('select id::text from app.atribuicao_escopo',
  $$ values ('a1000000-0000-0000-0000-000000000006') $$,
  'proprietário vê só a própria atribuição');
select results_eq('select id::text from app.auditoria',
  $ values ('c1000000-0000-0000-0000-000000000001') $,
  'proprietário lê só a auditoria da própria UH (0028), não a de outro hotel nem a do grupo');
select is_empty('select 1 from app.proprietario',          'proprietário não vê o cadastro de proprietários');
select is_empty('select 1 from staging.credencial_agente', 'proprietário não vê credenciais de agente');
select is_empty('select 1 from staging.carga',             'proprietário não vê cargas do staging');
select is_empty('select 1 from staging.registro_externo',  'proprietário não vê registros do staging');
select throws_ok(
  $$ insert into app.local (id, tenant_id, hotel_id, tipo, nome, busca, status) values
     ('11110000-0000-0000-0000-0000000000c6', '10000000-0000-0000-0000-000000000000',
      '11100000-0000-0000-0000-000000000001', 'uh', 'x', 'x', 'ativo') $$,
  '42501', null, 'proprietário não cria local nem no hotel da própria UH');
select throws_ok(
  $$ insert into app.auditoria (id, tenant_id, hotel_id, entidade, registro_id, acao, usuario_id) values
     ('c1000000-0000-0000-0000-0000000000c6', '10000000-0000-0000-0000-000000000000',
      '11100000-0000-0000-0000-000000000001', 'local', '11110000-0000-0000-0000-000000000001',
      'x', 'aaaaaaaa-0000-0000-0000-000000000006') $$,
  '42501', null, 'proprietário não grava auditoria do hotel da própria UH');
select throws_ok(
  $$ insert into app.local_proprietario (id, tenant_id, proprietario_id, local_id, vigencia_inicio) values
     ('11210000-0000-0000-0000-0000000000c6', '10000000-0000-0000-0000-000000000000',
      '11200000-0000-0000-0000-000000000001', '11110000-0000-0000-0000-000000000002', current_date) $$,
  '42501', null, 'proprietário não se vincula a outra UH');
select is_empty($$ update app.local_proprietario set vigencia_fim = vigencia_fim returning 1 $$,
  'proprietário não altera o próprio vínculo');
select throws_ok(
  $$ insert into app.atribuicao_escopo (id, tenant_id, usuario_id, papel, escopo_tipo, hotel_id, concedido_por) values
     ('a1000000-0000-0000-0000-0000000000c6', '10000000-0000-0000-0000-000000000000',
      'aaaaaaaa-0000-0000-0000-000000000007', 'tecnico', 'hotel',
      '11100000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000006') $$,
  '42501', null, 'proprietário não concede papel');
select throws_ok(
  $$ insert into app.bandeira (id, tenant_id, nome) values
     ('11000000-0000-0000-0000-0000000000c6', '10000000-0000-0000-0000-000000000000', 'x') $$,
  '42501', null, 'proprietário não cria bandeira');
select is_empty($$ update app.hotel set nome = nome returning 1 $$,
  'proprietário não altera o hotel da própria UH');
select throws_ok(
  $$ insert into app.membro (tenant_id, usuario_id, nome, email) values
     ('10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000008', 'x', 'x@a.test') $$,
  '42501', null, 'proprietário não cria membro');

-- ---------------------------------------------------------------------------
-- Caso 4 — Implantador vencido não vê nada do hotel nem do staging, e não
-- grava. Continua membro do tenant: vê o próprio cadastro e a própria
-- atribuição (vencida). O 002 cobre hotel.
-- ---------------------------------------------------------------------------
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000005', true)) ctx;

select is_empty('select 1 from app.local',                 'implantador vencido não vê locais');
select is_empty('select 1 from app.local_proprietario',    'implantador vencido não vê vínculos de proprietário');
select is_empty('select 1 from app.auditoria',             'implantador vencido não vê auditoria');
select is_empty('select 1 from app.proprietario',          'implantador vencido não vê proprietários');
select is_empty('select 1 from staging.credencial_agente', 'implantador vencido não vê credenciais de agente');
select is_empty('select 1 from staging.carga',             'implantador vencido não vê cargas do staging');
select is_empty('select 1 from staging.registro_externo',  'implantador vencido não vê registros do staging');
select results_eq('select usuario_id::text from app.membro',
  $$ values ('aaaaaaaa-0000-0000-0000-000000000005') $$,
  'implantador vencido vê só o próprio cadastro de membro');
select results_eq('select id::text from app.atribuicao_escopo',
  $$ values ('a1000000-0000-0000-0000-000000000005') $$,
  'implantador vencido vê só a própria atribuição');
select throws_ok(
  $$ insert into app.local (id, tenant_id, hotel_id, tipo, nome, busca, status) values
     ('11110000-0000-0000-0000-0000000000c5', '10000000-0000-0000-0000-000000000000',
      '11100000-0000-0000-0000-000000000001', 'uh', 'x', 'x', 'ativo') $$,
  '42501', null, 'implantador vencido não cria local no hotel que era dele');
select throws_ok(
  $$ insert into app.atribuicao_escopo (id, tenant_id, usuario_id, papel, escopo_tipo, hotel_id, concedido_por) values
     ('a1000000-0000-0000-0000-0000000000c5', '10000000-0000-0000-0000-000000000000',
      'aaaaaaaa-0000-0000-0000-000000000007', 'tecnico', 'hotel',
      '11100000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000005') $$,
  '42501', null, 'implantador vencido não concede papel');
select throws_ok(
  $$ insert into app.membro (tenant_id, usuario_id, nome, email) values
     ('10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000008', 'x', 'x@a.test') $$,
  '42501', null, 'implantador vencido não cria membro');
select is_empty($$ update app.local set nome = nome returning 1 $$,
  'implantador vencido não altera local');

-- ---------------------------------------------------------------------------
-- Outbox, auditoria do grupo e contrato de licença (migração 0003, ADR-021):
-- publicar evento exige Admin do grupo ou papel de escrita vigente; auditar sem
-- hotel, só Admin do grupo ou Implantador vigente; o contrato só o Admin lê.
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ insert into app.evento_dominio (id, tenant_id, tipo, entidade, registro_id, payload) values
     ('e1000000-0000-0000-0000-0000000000c5', '10000000-0000-0000-0000-000000000000',
      'x', 'x', '11100000-0000-0000-0000-000000000001', '{}') $$,
  '42501', null, 'implantador vencido não publica evento');
select throws_ok(
  $$ insert into app.auditoria (id, tenant_id, hotel_id, entidade, registro_id, acao, usuario_id) values
     ('c1000000-0000-0000-0000-0000000000d5', '10000000-0000-0000-0000-000000000000', null,
      'x', '11100000-0000-0000-0000-000000000001', 'x', 'aaaaaaaa-0000-0000-0000-000000000005') $$,
  '42501', null, 'implantador vencido não grava auditoria do grupo');

select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000006', true)) ctx;
select throws_ok(
  $$ insert into app.evento_dominio (id, tenant_id, tipo, entidade, registro_id, payload) values
     ('e1000000-0000-0000-0000-0000000000c6', '10000000-0000-0000-0000-000000000000',
      'x', 'x', '11100000-0000-0000-0000-000000000001', '{}') $$,
  '42501', null, 'proprietário não publica evento');
select throws_ok(
  $$ insert into app.auditoria (id, tenant_id, hotel_id, entidade, registro_id, acao, usuario_id) values
     ('c1000000-0000-0000-0000-0000000000d6', '10000000-0000-0000-0000-000000000000', null,
      'x', '11100000-0000-0000-0000-000000000001', 'x', 'aaaaaaaa-0000-0000-0000-000000000006') $$,
  '42501', null, 'proprietário não grava auditoria do grupo');
select is_empty('select 1 from licenca.contrato', 'proprietário não lê o contrato de licença');

select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000002', true)) ctx;
select lives_ok(
  $$ insert into app.evento_dominio (id, tenant_id, tipo, entidade, registro_id, payload) values
     ('e1000000-0000-0000-0000-0000000000c2', '10000000-0000-0000-0000-000000000000',
      'x', 'x', '11100000-0000-0000-0000-000000000001', '{}') $$,
  'gerente A1 publica evento (papel de escrita vigente)');
select throws_ok(
  $$ insert into app.auditoria (id, tenant_id, hotel_id, entidade, registro_id, acao, usuario_id) values
     ('c1000000-0000-0000-0000-0000000000d2', '10000000-0000-0000-0000-000000000000', null,
      'x', '11100000-0000-0000-0000-000000000001', 'x', 'aaaaaaaa-0000-0000-0000-000000000002') $$,
  '42501', null, 'gerente A1 não grava auditoria do grupo (só Admin ou Implantador vigente)');
select is_empty('select 1 from licenca.contrato', 'gerente A1 não lê o contrato de licença');

select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000004', true)) ctx;
select lives_ok(
  $$ insert into app.evento_dominio (id, tenant_id, tipo, entidade, registro_id, payload) values
     ('e1000000-0000-0000-0000-0000000000c4', '10000000-0000-0000-0000-000000000000',
      'x', 'x', '11100000-0000-0000-0000-000000000002', '{}') $$,
  'implantador válido publica evento');
select lives_ok(
  $$ insert into app.auditoria (id, tenant_id, hotel_id, entidade, registro_id, acao, usuario_id) values
     ('c1000000-0000-0000-0000-0000000000d4', '10000000-0000-0000-0000-000000000000', null,
      'membro', 'aaaaaaaa-0000-0000-0000-000000000007', 'x', 'aaaaaaaa-0000-0000-0000-000000000004') $$,
  'implantador válido grava auditoria do grupo');

select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000001', true)) ctx;
select results_eq('select tenant_id::text from licenca.contrato',
  $$ values ('10000000-0000-0000-0000-000000000000') $$, 'admin A lê o contrato do próprio tenant');
select lives_ok(
  $$ insert into app.auditoria (id, tenant_id, hotel_id, entidade, registro_id, acao, usuario_id) values
     ('c1000000-0000-0000-0000-0000000000d1', '10000000-0000-0000-0000-000000000000', null,
      'x', '11100000-0000-0000-0000-000000000001', 'x', 'aaaaaaaa-0000-0000-0000-000000000001') $$,
  'admin A grava auditoria do grupo');
reset role;

-- ---------------------------------------------------------------------------
-- hk_ingestao — grava só no staging do próprio tenant, não lê app e só
-- enxerga credencial não revogada. Quem define o tenant é a API, a partir do
-- prefixo da credencial (ADR-008); a comparação do hash também é da API.
-- ---------------------------------------------------------------------------
set local role hk_ingestao;
select from (select set_config('app.usuario_id', '', true),
       set_config('app.tenant_id', '10000000-0000-0000-0000-000000000000', true)) ctx;

select results_eq('select id::text from staging.credencial_agente',
  $$ values ('d1000000-0000-0000-0000-000000000001') $$,
  'ingestão vê só a credencial não revogada do próprio tenant');
select lives_ok(
  $$ insert into staging.carga (id, tenant_id, fonte, entidade, lote_hash) values
     ('f1000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000000', 'totvs_cm', 'uh', 'lote-a2') $$,
  'ingestão grava carga no próprio tenant');
select throws_ok(
  $$ insert into staging.carga (id, tenant_id, fonte, entidade, lote_hash) values
     ('f2000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000000', 'totvs_cm', 'uh', 'lote-b2') $$,
  '42501', null, 'ingestão não grava carga em outro tenant');
select lives_ok(
  $$ insert into staging.registro_externo (tenant_id, fonte, entidade, chave, payload, hash) values
     ('10000000-0000-0000-0000-000000000000', 'totvs_cm', 'uh', 'A1-102', '{}', 'h-a2') $$,
  'ingestão grava registro externo no próprio tenant');
select throws_ok(
  $$ insert into staging.registro_externo (tenant_id, fonte, entidade, chave, payload, hash) values
     ('20000000-0000-0000-0000-000000000000', 'totvs_cm', 'uh', 'B1-102', '{}', 'h-b2') $$,
  '42501', null, 'ingestão não grava registro externo em outro tenant');
select is_empty($$ update staging.carga set erro = erro
  where tenant_id = '20000000-0000-0000-0000-000000000000' returning 1 $$, 'ingestão não altera carga de outro tenant');
select is_empty($$ update staging.registro_externo set hash = hash
  where tenant_id = '20000000-0000-0000-0000-000000000000' returning 1 $$, 'ingestão não altera registro externo de outro tenant');
select results_eq('select distinct tenant_id::text from staging.carga',
  $$ values ('10000000-0000-0000-0000-000000000000') $$, 'ingestão vê só cargas do próprio tenant');
select results_eq('select distinct tenant_id::text from staging.registro_externo',
  $$ values ('10000000-0000-0000-0000-000000000000') $$, 'ingestão vê só registros do próprio tenant');
select throws_ok('select 1 from app.hotel', '42501', null, 'ingestão não lê app');
select throws_ok(
  $$ insert into app.local (id, tenant_id, hotel_id, tipo, nome, busca, status) values
     ('11110000-0000-0000-0000-0000000000d1', '10000000-0000-0000-0000-000000000000',
      '11100000-0000-0000-0000-000000000001', 'uh', 'x', 'x', 'ativo') $$,
  '42501', null, 'ingestão não grava em app (a promoção é do worker)');
select throws_ok('select 1 from licenca.contrato', '42501', null, 'ingestão não lê licença');
select throws_ok(
  $$ insert into staging.credencial_agente (id, tenant_id, descricao, hash_segredo) values
     ('d1000000-0000-0000-0000-0000000000d1', '10000000-0000-0000-0000-000000000000', 'x', 'x') $$,
  '42501', null, 'ingestão não cria credencial de agente');
select throws_ok(
  $$ update staging.credencial_agente set revogado_em = null
     where id = 'd1000000-0000-0000-0000-000000000002' $$,
  '42501', null, 'ingestão não reativa credencial revogada');

select from (select set_config('app.tenant_id', '', true)) ctx;
select is_empty('select 1 from staging.credencial_agente', 'ingestão sem contexto não vê credencial');
select throws_ok(
  $$ insert into staging.carga (id, tenant_id, fonte, entidade, lote_hash) values
     ('f1000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000000', 'totvs_cm', 'uh', 'lote-a3') $$,
  '42501', null, 'ingestão sem contexto não grava carga');
reset role;

select * from finish();
rollback;
