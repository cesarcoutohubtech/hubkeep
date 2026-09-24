-- ============================================================================
-- Isolamento por tenant, bandeira, hotel e proprietário; validade do
-- Implantador; bloqueio de escalada de papel; papéis de sistema.
--
-- Cenário:
--   Tenant A: bandeira A1; hotel A1 (bandeira A1, ativo), hotel A2 (sem bandeira)
--             UH A1-101 e A1-102 (hotel A1), UH A2-201 (hotel A2, pendente)
--             proprietário P, dono da UH A1-101
--   Tenant B: hotel B1 (ativo), UH B1-101
-- ============================================================================
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(30);

-- pgTAP precisa ser executável pelos papéis testados (só nesta transação)
grant usage on schema extensions to hk_app, hk_worker, hk_backoffice;

-- ---------------------------------------------------------------------------
-- Fixtures (inseridas como postgres)
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'admin@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'gerente.a1@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000003', 'gestor.bandeira@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000004', 'implantador.a2@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000005', 'implantador.expirado@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000006', 'proprietario@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000007', 'tecnico.novo@a.test'),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'admin@b.test');

insert into app.tenant (id, nome) values
  ('10000000-0000-0000-0000-000000000000', 'Grupo A'),
  ('20000000-0000-0000-0000-000000000000', 'Grupo B');

insert into app.membro (tenant_id, usuario_id, nome, email) values
  ('10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000001', 'Admin A', 'admin@a.test'),
  ('10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000002', 'Gerente A1', 'gerente.a1@a.test'),
  ('10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000003', 'Gestor Bandeira', 'gestor.bandeira@a.test'),
  ('10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000004', 'Implantador A2', 'implantador.a2@a.test'),
  ('10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000005', 'Implantador Exp', 'implantador.expirado@a.test'),
  ('10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000006', 'Proprietário', 'proprietario@a.test'),
  ('10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000007', 'Técnico Novo', 'tecnico.novo@a.test'),
  ('20000000-0000-0000-0000-000000000000', 'bbbbbbbb-0000-0000-0000-000000000001', 'Admin B', 'admin@b.test');

insert into app.bandeira (id, tenant_id, nome) values
  ('11000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', 'Bandeira A1');

insert into app.hotel (id, tenant_id, bandeira_id, nome, fuso, status) values
  ('11100000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11000000-0000-0000-0000-000000000001', 'Hotel A1', 'America/Sao_Paulo', 'ativo'),
  ('11100000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000000', null,                                   'Hotel A2', 'America/Sao_Paulo', 'em_implantacao'),
  ('21100000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000000', null,                                   'Hotel B1', 'America/Sao_Paulo', 'ativo');

insert into app.local (id, tenant_id, hotel_id, tipo, nome, status) values
  ('11110000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'uh', 'UH A1-101', 'ativo'),
  ('11110000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'uh', 'UH A1-102', 'ativo'),
  ('11110000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000002', 'uh', 'UH A2-201', 'pendente_licenca'),
  ('21110000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000000', '21100000-0000-0000-0000-000000000001', 'uh', 'UH B1-101', 'ativo');

insert into app.proprietario (id, tenant_id, nome) values
  ('11200000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', 'Proprietário P');

insert into app.local_proprietario (id, tenant_id, proprietario_id, local_id, vigencia_inicio) values
  ('11210000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000',
   '11200000-0000-0000-0000-000000000001', '11110000-0000-0000-0000-000000000001', current_date - 30);

insert into app.atribuicao_escopo
  (id, tenant_id, usuario_id, papel, escopo_tipo, bandeira_id, hotel_id, proprietario_id, valido_ate, concedido_por)
values
  ('a1000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000001',
   'admin_grupo', 'grupo', null, null, null, null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('a1000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000002',
   'gerente_hotel', 'hotel', null, '11100000-0000-0000-0000-000000000001', null, null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('a1000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000003',
   'gestor_csc', 'bandeira', '11000000-0000-0000-0000-000000000001', null, null, null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('a1000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000004',
   'implantador', 'hotel', null, '11100000-0000-0000-0000-000000000002', null, now() + interval '60 days', 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('a1000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000005',
   'implantador', 'hotel', null, '11100000-0000-0000-0000-000000000001', null, now() - interval '1 day', 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('a1000000-0000-0000-0000-000000000006', '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000006',
   'proprietario', 'proprietario', null, null, '11200000-0000-0000-0000-000000000001', null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('b1000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000000', 'bbbbbbbb-0000-0000-0000-000000000001',
   'admin_grupo', 'grupo', null, null, null, null, 'bbbbbbbb-0000-0000-0000-000000000001');

insert into licenca.contrato (tenant_id, max_hoteis, max_uhs, atualizado_por) values
  ('10000000-0000-0000-0000-000000000000', 2, 300, 'teste'),
  ('20000000-0000-0000-0000-000000000000', 1, 100, 'teste');

-- ---------------------------------------------------------------------------
-- Integridade: referência cruzada entre tenants é impossível por FK
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ insert into app.local (id, tenant_id, hotel_id, tipo, nome, status) values
     ('11110000-0000-0000-0000-0000000000ff', '10000000-0000-0000-0000-000000000000',
      '21100000-0000-0000-0000-000000000001', 'uh', 'invasora', 'ativo') $$,
  '23503', null,
  'local do tenant A não pode apontar para hotel do tenant B (FK composta)'
);

select throws_ok(
  $$ insert into app.atribuicao_escopo (id, tenant_id, usuario_id, papel, escopo_tipo, valido_ate, hotel_id, concedido_por)
     values ('a1000000-0000-0000-0000-0000000000ff', '10000000-0000-0000-0000-000000000000',
             'aaaaaaaa-0000-0000-0000-000000000007', 'implantador', 'hotel', null,
             '11100000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001') $$,
  '23514', null,
  'Implantador sem validade é rejeitado pela constraint'
);

-- ---------------------------------------------------------------------------
-- Leitura por papel (hk_app)
-- ---------------------------------------------------------------------------
set local role hk_app;

-- Sem contexto: falha fechada
select is_empty('select id from app.hotel', 'sem contexto de sessão, nenhum hotel é visível');

-- Admin do grupo A
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000001', true),
       set_config('app.tenant_id',  '10000000-0000-0000-0000-000000000000', true)) ctx;
select results_eq('select nome from app.hotel order by nome',
  $$ values ('Hotel A1'), ('Hotel A2') $$, 'admin A vê os hotéis do tenant A');
select results_eq('select count(*)::int from app.local', $$ values (3) $$,
  'admin A vê as 3 UHs do tenant A');
select results_eq('select count(*)::int from app.proprietario', $$ values (1) $$,
  'admin A vê proprietários');

-- Admin A tentando se passar pelo tenant B
select from (select set_config('app.tenant_id', '20000000-0000-0000-0000-000000000000', true)) ctx;
select is_empty('select id from app.hotel',
  'admin A com tenant_id forjado para B não vê nada (não é membro de B)');

-- Gerente do hotel A1
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000002', true),
       set_config('app.tenant_id',  '10000000-0000-0000-0000-000000000000', true)) ctx;
select results_eq('select nome from app.hotel', $$ values ('Hotel A1') $$,
  'gerente A1 vê só o hotel A1');
select results_eq('select nome from app.local order by nome',
  $$ values ('UH A1-101'), ('UH A1-102') $$, 'gerente A1 vê só as UHs do hotel A1');
select is_empty('select id from app.proprietario', 'gerente A1 não vê dados pessoais de proprietários');

-- Gestor da bandeira A1 (hotel A2 não tem bandeira)
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000003', true)) ctx;
select results_eq('select nome from app.hotel', $$ values ('Hotel A1') $$,
  'gestor da bandeira A1 vê só hotéis da bandeira');

-- Implantador válido no hotel A2
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000004', true)) ctx;
select results_eq('select nome from app.hotel', $$ values ('Hotel A2') $$,
  'implantador vê só o hotel do seu escopo');

-- Implantador expirado no hotel A1
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000005', true)) ctx;
select is_empty('select id from app.hotel', 'implantador com validade vencida não vê nada');

-- Proprietário da UH A1-101
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000006', true)) ctx;
select results_eq('select nome from app.local', $$ values ('UH A1-101') $$,
  'proprietário vê só a própria UH');
select results_eq('select nome from app.hotel', $$ values ('Hotel A1') $$,
  'proprietário vê o hotel da própria UH');
select results_eq('select count(*)::int from app.membro', $$ values (1) $$,
  'proprietário vê só o próprio cadastro de membro');

-- Admin do grupo B
select from (select set_config('app.usuario_id', 'bbbbbbbb-0000-0000-0000-000000000001', true),
       set_config('app.tenant_id',  '20000000-0000-0000-0000-000000000000', true)) ctx;
select results_eq('select nome from app.hotel', $$ values ('Hotel B1') $$,
  'admin B vê só o tenant B');

-- ---------------------------------------------------------------------------
-- Escrita e escalada (hk_app)
-- ---------------------------------------------------------------------------
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000004', true),
       set_config('app.tenant_id',  '10000000-0000-0000-0000-000000000000', true)) ctx;

select lives_ok(
  $$ insert into app.atribuicao_escopo (id, tenant_id, usuario_id, papel, escopo_tipo, hotel_id, concedido_por)
     values ('a1000000-0000-0000-0000-000000000010', '10000000-0000-0000-0000-000000000000',
             'aaaaaaaa-0000-0000-0000-000000000007', 'tecnico', 'hotel',
             '11100000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000004') $$,
  'implantador concede papel de técnico no hotel do seu escopo'
);

select throws_ok(
  $$ insert into app.atribuicao_escopo (id, tenant_id, usuario_id, papel, escopo_tipo, concedido_por)
     values ('a1000000-0000-0000-0000-000000000011', '10000000-0000-0000-0000-000000000000',
             'aaaaaaaa-0000-0000-0000-000000000007', 'admin_grupo', 'grupo',
             'aaaaaaaa-0000-0000-0000-000000000004') $$,
  '42501', null, 'implantador não concede Admin do grupo'
);

select throws_ok(
  $$ insert into app.atribuicao_escopo (id, tenant_id, usuario_id, papel, escopo_tipo, hotel_id, concedido_por)
     values ('a1000000-0000-0000-0000-000000000012', '10000000-0000-0000-0000-000000000000',
             'aaaaaaaa-0000-0000-0000-000000000007', 'tecnico', 'hotel',
             '11100000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000004') $$,
  '42501', null, 'implantador não concede papel fora do seu escopo'
);

select throws_ok(
  $$ update app.atribuicao_escopo set valido_ate = now() + interval '5 years'
     where id = 'a1000000-0000-0000-0000-000000000004' $$,
  '42501', null, 'implantador não prorroga a própria validade'
);

select throws_ok(
  $$ insert into app.atribuicao_escopo (id, tenant_id, usuario_id, papel, escopo_tipo, hotel_id, concedido_por)
     values ('a1000000-0000-0000-0000-000000000013', '10000000-0000-0000-0000-000000000000',
             'aaaaaaaa-0000-0000-0000-000000000007', 'tecnico', 'hotel',
             '11100000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001') $$,
  '42501', null, 'ninguém registra concessão em nome de outro usuário'
);

-- Gerente A1 tentando criar local no hotel A2
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000002', true)) ctx;
select throws_ok(
  $$ insert into app.local (id, tenant_id, hotel_id, tipo, nome, status)
     values ('11110000-0000-0000-0000-0000000000aa', '10000000-0000-0000-0000-000000000000',
             '11100000-0000-0000-0000-000000000002', 'uh', 'fora do escopo', 'ativo') $$,
  '42501', null, 'gerente A1 não cria local no hotel A2'
);

-- Proprietário tentando alterar a própria UH (somente leitura): nada muda
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000006', true)) ctx;
update app.local set nome = 'alterado' where id = '11110000-0000-0000-0000-000000000001';
reset role;
select is((select nome from app.local where id = '11110000-0000-0000-0000-000000000001'),
  'UH A1-101', 'proprietário não altera UH');

-- ---------------------------------------------------------------------------
-- Papéis de sistema
-- ---------------------------------------------------------------------------
set local role hk_worker;
select from (select set_config('app.usuario_id', '', true),
       set_config('app.tenant_id', '10000000-0000-0000-0000-000000000000', true)) ctx;
select results_eq('select count(*)::int from app.hotel', $$ values (2) $$,
  'worker processando o tenant A vê só os hotéis de A');
select lives_ok(
  $$ insert into app.evento_dominio (id, tenant_id, tipo, entidade, registro_id, payload)
     values ('e1000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000',
             'local.promovido', 'local', '11110000-0000-0000-0000-000000000001', '{}') $$,
  'worker publica evento no outbox do tenant que está processando (ADR-013)'
);
select throws_ok(
  $$ insert into app.evento_dominio (id, tenant_id, tipo, entidade, registro_id, payload)
     values ('e1000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000000',
             'local.promovido', 'local', '21110000-0000-0000-0000-000000000001', '{}') $$,
  '42501', null, 'worker processando o tenant A não publica evento no tenant B'
);
reset role;

set local role hk_backoffice;
select results_eq(
  'select tenant_nome, hoteis_ativos::int, uhs_ativas::int from licenca.uso() order by tenant_nome',
  $$ values ('Grupo A', 1, 2), ('Grupo B', 1, 1) $$,
  'backoffice vê só agregados de licença');
select throws_ok('select * from app.hotel', '42501', null,
  'backoffice não lê tabelas de negócio');
reset role;

set local role anon;
select throws_ok('select * from app.hotel', '42501', null,
  'anon (Data API do Supabase) não lê tabelas do HubKeep');
reset role;

select * from finish();
rollback;
