-- ============================================================================
-- Idioma e região (F0-10b, migração 0005): restrições das colunas novas de
-- tenant e hotel e os casos mínimos do doc 02 para app.preferencia_membro,
-- mais a autoauditoria das preferências.
--
--   - idioma fora da lista é recusado pelo banco nas três tabelas (o fuso
--     inválido é recusado pela aplicação: packages/i18n, fusoValido);
--   - cada membro lê e grava só a própria preferência, no próprio tenant;
--   - quem só lê (proprietário) também troca o próprio idioma e audita isso,
--     mas não audita outra coisa sem hotel.
--
-- Cenário: tenant A com admin, gerente do hotel A1 e proprietário; tenant B
-- com admin. Preferência gravada para o admin A e para o admin B.
--
-- Sem o caso do implantador vencido (B2 do docs/11): a preferência é do
-- usuário, não do papel. As policies olham só o tenant e o próprio usuário, e
-- o papel vencido não muda o idioma de ninguém nem abre a linha de outro.
-- ============================================================================
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(38);

grant usage on schema extensions to hk_app, hk_worker, hk_ingestao;

-- ---------------------------------------------------------------------------
-- Fixtures (inseridas como postgres)
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'admin@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'gerente.a1@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000006', 'proprietario@a.test'),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'admin@b.test');

insert into app.tenant (id, nome) values
  ('10000000-0000-0000-0000-000000000000', 'Grupo A'),
  ('20000000-0000-0000-0000-000000000000', 'Grupo B');

insert into app.membro (tenant_id, usuario_id, nome, email) values
  ('10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000001', 'Admin A', 'admin@a.test'),
  ('10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000002', 'Gerente A1', 'gerente.a1@a.test'),
  ('10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000006', 'Proprietário', 'proprietario@a.test'),
  ('20000000-0000-0000-0000-000000000000', 'bbbbbbbb-0000-0000-0000-000000000001', 'Admin B', 'admin@b.test');

insert into app.hotel (id, tenant_id, nome, fuso, status) values
  ('11100000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', 'Hotel A1', 'America/Sao_Paulo', 'ativo'),
  ('21100000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000000', 'Hotel B1', 'America/Sao_Paulo', 'ativo');

insert into app.proprietario (id, tenant_id, nome) values
  ('11200000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', 'Proprietário P');

insert into app.atribuicao_escopo
  (id, tenant_id, usuario_id, papel, escopo_tipo, hotel_id, proprietario_id, concedido_por)
values
  ('a1000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000001',
   'admin_grupo', 'grupo', null, null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('a1000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000002',
   'gerente_hotel', 'hotel', '11100000-0000-0000-0000-000000000001', null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('a1000000-0000-0000-0000-000000000006', '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000006',
   'proprietario', 'proprietario', null, '11200000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('b1000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000000', 'bbbbbbbb-0000-0000-0000-000000000001',
   'admin_grupo', 'grupo', null, null, 'bbbbbbbb-0000-0000-0000-000000000001');

insert into app.preferencia_membro (tenant_id, usuario_id, idioma, formato_regional, fuso) values
  ('10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000001', 'en', 'en-GB', 'Europe/London'),
  ('20000000-0000-0000-0000-000000000000', 'bbbbbbbb-0000-0000-0000-000000000001', 'fr', null, null);

-- ---------------------------------------------------------------------------
-- Restrições (como postgres: quem barra é a integridade, não a RLS)
-- ---------------------------------------------------------------------------
select results_eq(
  $$ select pais, moeda, idioma_padrao from app.tenant where id = '10000000-0000-0000-0000-000000000000' $$,
  $$ values ('BR'::text, 'BRL'::text, 'pt-BR'::text) $$,
  'tenant novo: BR, BRL e pt-BR por padrão');
select throws_ok(
  $$ update app.tenant set idioma_padrao = 'de' where id = '10000000-0000-0000-0000-000000000000' $$,
  '23514', null, 'tenant: idioma fora da lista é recusado');
select throws_ok(
  $$ update app.tenant set pais = 'Brasil' where id = '10000000-0000-0000-0000-000000000000' $$,
  '23514', null, 'tenant: país fora do ISO 3166-1 alfa-2 é recusado');
select throws_ok(
  $$ update app.tenant set moeda = 'real' where id = '10000000-0000-0000-0000-000000000000' $$,
  '23514', null, 'tenant: moeda fora do ISO 4217 é recusada');
select throws_ok(
  $$ update app.tenant set subdivisao = 'AR-B' where id = '10000000-0000-0000-0000-000000000000' $$,
  '23514', null, 'tenant: subdivisão de outro país é recusada');
select lives_ok(
  $$ update app.tenant set subdivisao = 'BR-PR' where id = '10000000-0000-0000-0000-000000000000' $$,
  'tenant: subdivisão ISO 3166-2 do próprio país é aceita');
select throws_ok(
  $$ update app.hotel set idioma_padrao = 'pt-PT' where id = '11100000-0000-0000-0000-000000000001' $$,
  '23514', null, 'hotel: idioma fora da lista é recusado');
select throws_ok(
  $$ update app.hotel set pais = 'AR', subdivisao = 'BR-SP' where id = '11100000-0000-0000-0000-000000000001' $$,
  '23514', null, 'hotel: subdivisão que não é do país do hotel é recusada');
select lives_ok(
  $$ update app.hotel set pais = null, subdivisao = null, moeda = null, idioma_padrao = null
     where id = '11100000-0000-0000-0000-000000000001' $$,
  'hotel: nulo herda do tenant');
select throws_ok(
  $$ update app.preferencia_membro set idioma = 'de'
     where usuario_id = 'aaaaaaaa-0000-0000-0000-000000000001' $$,
  '23514', null, 'preferência: idioma fora da lista é recusado');
select throws_ok(
  $$ update app.preferencia_membro set formato_regional = 'pt_BR'
     where usuario_id = 'aaaaaaaa-0000-0000-0000-000000000001' $$,
  '23514', null, 'preferência: formato regional fora do BCP 47 é recusado');

-- Caso 6 — FK composta: preferência para quem não é membro daquele tenant.
select throws_ok(
  $$ insert into app.preferencia_membro (tenant_id, usuario_id, idioma) values
     ('10000000-0000-0000-0000-000000000000', 'bbbbbbbb-0000-0000-0000-000000000001', 'es') $$,
  '23503', null, 'preferência: usuário que só é membro de outro tenant é recusado pela FK composta');

-- ---------------------------------------------------------------------------
-- Caso 5 — Sem contexto, nada é visível nem gravável (falha fechada)
-- ---------------------------------------------------------------------------
set local role hk_app;
select from (select set_config('app.usuario_id', '', true),
       set_config('app.tenant_id', '', true)) ctx;
select is_empty('select 1 from app.preferencia_membro', 'sem contexto: preferência vazia');
select throws_ok(
  $$ insert into app.preferencia_membro (tenant_id, usuario_id, idioma) values
     ('10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000002', 'es') $$,
  '42501', null, 'sem contexto: não grava preferência');

-- ---------------------------------------------------------------------------
-- Casos 1 a 4 — Gerente A1 (membro comum do tenant A)
-- ---------------------------------------------------------------------------
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000002', true),
       set_config('app.tenant_id',  '10000000-0000-0000-0000-000000000000', true)) ctx;

select is_empty('select 1 from app.preferencia_membro',
  'gerente A1 não vê a preferência do admin A (só a própria, que ainda não existe)');
select lives_ok(
  $$ insert into app.preferencia_membro (tenant_id, usuario_id, idioma, fuso) values
     ('10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000002', 'es', 'America/Santiago') $$,
  'gerente A1 grava a própria preferência');
select results_eq('select usuario_id::text from app.preferencia_membro',
  $$ values ('aaaaaaaa-0000-0000-0000-000000000002') $$, 'gerente A1 vê só a própria preferência');
select throws_ok(
  $$ insert into app.preferencia_membro (tenant_id, usuario_id, idioma) values
     ('10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000006', 'fr') $$,
  '42501', null, 'gerente A1 não grava a preferência de outro membro');
select is_empty($$ update app.preferencia_membro set idioma = 'fr'
  where usuario_id = 'aaaaaaaa-0000-0000-0000-000000000001' returning 1 $$,
  'gerente A1 não altera a preferência do admin A');
select isnt_empty($$ update app.preferencia_membro set idioma = 'fr', atualizado_em = now()
  where usuario_id = 'aaaaaaaa-0000-0000-0000-000000000002' returning 1 $$,
  'gerente A1 altera a própria preferência');
select throws_ok(
  $$ update app.preferencia_membro set usuario_id = 'aaaaaaaa-0000-0000-0000-000000000001'
     where usuario_id = 'aaaaaaaa-0000-0000-0000-000000000002' $$,
  '42501', null, 'gerente A1 não muda o dono da preferência (sem UPDATE em usuario_id)');
select throws_ok(
  $$ update app.preferencia_membro set tenant_id = '20000000-0000-0000-0000-000000000000'
     where usuario_id = 'aaaaaaaa-0000-0000-0000-000000000002' $$,
  '42501', null, 'gerente A1 não muda o tenant da preferência (sem UPDATE em tenant_id)');
select throws_ok(
  $$ delete from app.preferencia_membro where usuario_id = 'aaaaaaaa-0000-0000-0000-000000000002' $$,
  '42501', null, 'gerente A1 não apaga preferência (sem DELETE)');
select is_empty($$ update app.hotel set idioma_padrao = 'es'
  where id = '11100000-0000-0000-0000-000000000001' returning 1 $$,
  'gerente A1 não muda o idioma do hotel (só o Admin do grupo altera hotel)');
select lives_ok(
  $$ insert into app.auditoria (id, tenant_id, hotel_id, entidade, registro_id, acao, usuario_id) values
     ('c1000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-000000000000', null,
      'preferencia_membro', 'aaaaaaaa-0000-0000-0000-000000000002', 'atualizar',
      'aaaaaaaa-0000-0000-0000-000000000002') $$,
  'gerente A1 audita a própria preferência sem hotel');

-- ---------------------------------------------------------------------------
-- Proprietário: só lê o negócio, mas troca o próprio idioma e audita só isso
-- ---------------------------------------------------------------------------
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000006', true),
       set_config('app.tenant_id',  '10000000-0000-0000-0000-000000000000', true)) ctx;

select lives_ok(
  $$ insert into app.preferencia_membro (tenant_id, usuario_id, idioma) values
     ('10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000006', 'en') $$,
  'proprietário grava a própria preferência');
select lives_ok(
  $$ insert into app.auditoria (id, tenant_id, hotel_id, entidade, registro_id, acao, usuario_id) values
     ('c1000000-0000-0000-0000-0000000000a6', '10000000-0000-0000-0000-000000000000', null,
      'preferencia_membro', 'aaaaaaaa-0000-0000-0000-000000000006', 'criar',
      'aaaaaaaa-0000-0000-0000-000000000006') $$,
  'proprietário audita a própria preferência sem hotel');
select throws_ok(
  $$ insert into app.auditoria (id, tenant_id, hotel_id, entidade, registro_id, acao, usuario_id) values
     ('c1000000-0000-0000-0000-0000000000a7', '10000000-0000-0000-0000-000000000000', null,
      'preferencia_membro', 'aaaaaaaa-0000-0000-0000-000000000002', 'atualizar',
      'aaaaaaaa-0000-0000-0000-000000000006') $$,
  '42501', null, 'proprietário não audita a preferência de outro membro');
select throws_ok(
  $$ insert into app.auditoria (id, tenant_id, hotel_id, entidade, registro_id, acao, usuario_id) values
     ('c1000000-0000-0000-0000-0000000000a8', '10000000-0000-0000-0000-000000000000', null,
      'membro', 'aaaaaaaa-0000-0000-0000-000000000006', 'atualizar',
      'aaaaaaaa-0000-0000-0000-000000000006') $$,
  '42501', null, 'proprietário não audita outra entidade sem hotel (a exceção é só preferencia_membro)');
select throws_ok(
  $$ insert into app.evento_dominio (id, tenant_id, tipo, entidade, registro_id, payload) values
     ('e1000000-0000-0000-0000-0000000000a6', '10000000-0000-0000-0000-000000000000', 'preferencia.alterada',
      'preferencia_membro', 'aaaaaaaa-0000-0000-0000-000000000006', '{}') $$,
  '42501', null, 'proprietário continua sem publicar evento (a preferência não publica)');

-- ---------------------------------------------------------------------------
-- Caso 1 — Admin do tenant B não vê nem grava no tenant A
-- ---------------------------------------------------------------------------
select from (select set_config('app.usuario_id', 'bbbbbbbb-0000-0000-0000-000000000001', true),
       set_config('app.tenant_id',  '20000000-0000-0000-0000-000000000000', true)) ctx;

select results_eq('select tenant_id::text || ''/'' || idioma from app.preferencia_membro',
  $$ values ('20000000-0000-0000-0000-000000000000/fr') $$, 'admin B vê só a própria preferência, no B');
select throws_ok(
  $$ insert into app.preferencia_membro (tenant_id, usuario_id, idioma) values
     ('10000000-0000-0000-0000-000000000000', 'bbbbbbbb-0000-0000-0000-000000000001', 'es') $$,
  '42501', null, 'admin B não grava preferência no tenant A');

-- Tenant forjado: admin B com o tenant A no contexto não é membro de A.
select from (select set_config('app.tenant_id', '10000000-0000-0000-0000-000000000000', true)) ctx;
select is_empty('select 1 from app.preferencia_membro', 'tenant forjado: admin B não vê nada do A');

-- ---------------------------------------------------------------------------
-- Admin A: vê só a própria (as dos outros membros não são dele)
-- ---------------------------------------------------------------------------
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000001', true),
       set_config('app.tenant_id',  '10000000-0000-0000-0000-000000000000', true)) ctx;
select results_eq('select usuario_id::text from app.preferencia_membro',
  $$ values ('aaaaaaaa-0000-0000-0000-000000000001') $$,
  'admin A vê só a própria preferência (não é dado de negócio do grupo)');
select isnt_empty($$ update app.hotel set idioma_padrao = 'es', moeda = 'CLP', pais = 'CL'
  where id = '11100000-0000-0000-0000-000000000001' returning 1 $$,
  'admin A muda idioma, moeda e país do hotel');
reset role;

-- ---------------------------------------------------------------------------
-- Worker e ingestão
-- ---------------------------------------------------------------------------
set local role hk_worker;
select from (select set_config('app.tenant_id', '10000000-0000-0000-0000-000000000000', true)) ctx;
select results_eq('select distinct tenant_id::text from app.preferencia_membro',
  $$ values ('10000000-0000-0000-0000-000000000000') $$, 'worker vê só as preferências do tenant do job');
select throws_ok(
  $$ update app.preferencia_membro set idioma = 'es' $$,
  '42501', null, 'worker não altera preferência');
reset role;

set local role hk_ingestao;
select throws_ok('select 1 from app.preferencia_membro', '42501', null, 'ingestão não lê preferência');
reset role;

select * from finish();
rollback;
