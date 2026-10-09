-- ============================================================================
-- Isolamento da UH indisponível e das colunas novas do chamado e da OS
-- (migração 0034, fase 1b I4). Os seis casos mínimos do doc 02 para
-- app.uh_indisponivel:
--   1. admin de outro tenant não vê, não grava nem encerra;
--   2. quem tem escrita no hotel registra, em nome dele mesmo (o solicitante
--      na abertura, a gestão depois); encerram a gestão do hotel e o técnico
--      responsável por OS não cancelada do chamado; outro técnico do hotel, o
--      da OS cancelada e o solicitante, não;
--   3. o proprietário da UH vê os períodos da UH dele, e só eles; não grava
--      nem encerra;
--   4. técnico de outro hotel não vê nem grava;
--   5. sem contexto, nada;
--   6. FK composta: o período só existe para o local do próprio chamado e
--      com usuário do tenant.
-- E o implantador vencido do Hotel 1, que não vê nem registra (B2 do docs/11).
-- Mais: fim depois do início; fim e quem encerrou juntos; um período aberto
-- por chamado, e vários na mesma UH; UPDATE só de fim, encerrada_por e
-- atualizado_em; sem DELETE; worker vê só o tenant do job.
-- Chamado e OS: origem com padrão e sem UPDATE; impacto no hóspede gravado
-- pela triagem e por quem abriu; quem executa (equipe interna ou fornecedor
-- do grupo, amarrados pelo check) gravado pela triagem; custo não negativo,
-- gravado por quem aceita; o proprietário e o técnico sem a OS não gravam.
-- ============================================================================
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(50);

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
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000009', 'solicitante', 'hotel', '11100000-0000-0000-0000-000000000001', null, null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '20000000-0000-0000-0000-000000000000', 'bbbbbbbb-0000-0000-0000-000000000001', 'admin_grupo', 'grupo', null, null, null, 'bbbbbbbb-0000-0000-0000-000000000001');
insert into app.fornecedor (id, tenant_id, nome) values
  ('f0a00000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', 'Refrigeração A'),
  ('f0b00000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000000', 'Refrigeração B');

insert into app.situacao (id, tenant_id, entidade, estado, chave_padrao, ordem, cor) values
  ('5a000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', 'chamado', 'em_execucao', 'chamado_em_execucao', 10, '#2563eb'),
  ('5a000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000000', 'os', 'em_execucao', 'os_em_execucao', 10, '#2563eb'),
  ('5b000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000000', 'chamado', 'em_execucao', 'chamado_em_execucao', 10, '#2563eb'),
  ('5b000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000000', 'os', 'em_execucao', 'os_em_execucao', 10, '#2563eb');
insert into app.prioridade (id, tenant_id, chave_padrao, ordem, peso) values
  ('9a000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', 'baixa', 40, 10),
  ('9b000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000000', 'baixa', 40, 10);
-- c1 (UH 101, OS do técnico), c2 (UH 102, aberto pelo solicitante, OS do
-- técnico), c4 (UH 101, OS cancelada), c5 (Hotel 2), cb (tenant B).
insert into app.chamado (id, tenant_id, hotel_id, local_id, descricao, busca, estado, situacao_id, prioridade_id, politica_aplicada, aberto_por)
select c.id::uuid, c.tenant::uuid, c.hotel::uuid, c.local::uuid, c.descricao, c.descricao, 'em_execucao', c.situacao::uuid,
       c.prioridade::uuid, '{}', c.aberto_por::uuid
from (values
  ('c1000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', '11110000-0000-0000-0000-000000000001', 'chuveiro', '5a000000-0000-0000-0000-000000000001', '9a000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000002'),
  ('c1000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', '11110000-0000-0000-0000-000000000002', 'vazamento', '5a000000-0000-0000-0000-000000000001', '9a000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000009'),
  ('c1000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', '11110000-0000-0000-0000-000000000001', 'ar', '5a000000-0000-0000-0000-000000000001', '9a000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000002'),
  ('c2000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000002', '11120000-0000-0000-0000-000000000001', 'porta', '5a000000-0000-0000-0000-000000000001', '9a000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('cb000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000000', '22200000-0000-0000-0000-000000000001', '22210000-0000-0000-0000-000000000001', 'chamado b', '5b000000-0000-0000-0000-000000000001', '9b000000-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001')
) as c (id, tenant, hotel, local, descricao, situacao, prioridade, aberto_por);
insert into app.os (id, tenant_id, hotel_id, chamado_id, local_id, chamado_aberto_por, estado, situacao_id, tecnico_id, motivo_cancelamento, criado_por) values
  ('0a100000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', '11110000-0000-0000-0000-000000000001',
   'aaaaaaaa-0000-0000-0000-000000000002', 'em_execucao', '5a000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000004', null, 'aaaaaaaa-0000-0000-0000-000000000002'),
  ('0a100000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000002', '11110000-0000-0000-0000-000000000002',
   'aaaaaaaa-0000-0000-0000-000000000009', 'concluida', '5a000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000004', null, 'aaaaaaaa-0000-0000-0000-000000000002'),
  ('0a100000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000004', '11110000-0000-0000-0000-000000000001',
   'aaaaaaaa-0000-0000-0000-000000000002', 'cancelada', '5a000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000004', 'Trocada', 'aaaaaaaa-0000-0000-0000-000000000002'),
  ('0a200000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000002', 'c2000000-0000-0000-0000-000000000001', '11120000-0000-0000-0000-000000000001',
   'aaaaaaaa-0000-0000-0000-000000000001', 'em_execucao', '5a000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000007', null, 'aaaaaaaa-0000-0000-0000-000000000001');
-- Períodos abertos: u1 (c1/UH 101), u2 (c2/UH 102), u4 (c4/UH 101), u5 (Hotel 2), ub (tenant B).
insert into app.uh_indisponivel (id, tenant_id, hotel_id, local_id, chamado_id, inicio, aberta_por) values
  ('ea100000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', '11110000-0000-0000-0000-000000000001',
   'c1000000-0000-0000-0000-000000000001', now() - interval '5 hours', 'aaaaaaaa-0000-0000-0000-000000000002'),
  ('ea100000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', '11110000-0000-0000-0000-000000000002',
   'c1000000-0000-0000-0000-000000000002', now() - interval '5 hours', 'aaaaaaaa-0000-0000-0000-000000000009'),
  ('ea100000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', '11110000-0000-0000-0000-000000000001',
   'c1000000-0000-0000-0000-000000000004', now() - interval '5 hours', 'aaaaaaaa-0000-0000-0000-000000000002'),
  ('ea200000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000002', '11120000-0000-0000-0000-000000000001',
   'c2000000-0000-0000-0000-000000000001', now() - interval '5 hours', 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('eb000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000000', '22200000-0000-0000-0000-000000000001', '22210000-0000-0000-0000-000000000001',
   'cb000000-0000-0000-0000-000000000001', now() - interval '5 hours', 'bbbbbbbb-0000-0000-0000-000000000001');

-- Caso 6 — FK composta, checks e o período aberto único por chamado (como postgres)
select throws_ok(
  $$ insert into app.uh_indisponivel (id, tenant_id, hotel_id, local_id, chamado_id, inicio, fim, aberta_por, encerrada_por)
     values (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', '11110000-0000-0000-0000-000000000002',
             'c1000000-0000-0000-0000-000000000001', now() - interval '2 hours', now() - interval '1 hour',
             'aaaaaaaa-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000002') $$,
  '23503', null, 'período numa UH que não é o local do chamado');
select throws_ok(
  $$ insert into app.uh_indisponivel (id, tenant_id, hotel_id, local_id, chamado_id, inicio, fim, aberta_por, encerrada_por)
     values (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', '11110000-0000-0000-0000-000000000001',
             'c1000000-0000-0000-0000-000000000001', now() - interval '2 hours', now() - interval '1 hour',
             'bbbbbbbb-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001') $$,
  '23503', null, 'período aberto por usuário de outro tenant');
select throws_ok(
  $$ insert into app.uh_indisponivel (id, tenant_id, hotel_id, local_id, chamado_id, inicio, fim, aberta_por, encerrada_por)
     values (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', '11110000-0000-0000-0000-000000000001',
             'c1000000-0000-0000-0000-000000000001', now() - interval '1 hour', now() - interval '2 hours',
             'aaaaaaaa-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000002') $$,
  '23514', null, 'fim precisa ser depois do início');
select throws_ok(
  $$ insert into app.uh_indisponivel (id, tenant_id, hotel_id, local_id, chamado_id, inicio, fim, aberta_por)
     values (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', '11110000-0000-0000-0000-000000000001',
             'c1000000-0000-0000-0000-000000000001', now() - interval '2 hours', now() - interval '1 hour',
             'aaaaaaaa-0000-0000-0000-000000000002') $$,
  '23514', null, 'fim sem quem encerrou');
select throws_ok(
  $$ insert into app.uh_indisponivel (id, tenant_id, hotel_id, local_id, chamado_id, inicio, aberta_por)
     values (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', '11110000-0000-0000-0000-000000000001',
             'c1000000-0000-0000-0000-000000000001', now() - interval '1 hour', 'aaaaaaaa-0000-0000-0000-000000000002') $$,
  '23505', null, 'um período aberto por chamado');
select lives_ok(
  $$ insert into app.uh_indisponivel (id, tenant_id, hotel_id, local_id, chamado_id, inicio, fim, aberta_por, encerrada_por)
     values (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', '11110000-0000-0000-0000-000000000001',
             'c1000000-0000-0000-0000-000000000001', now() - interval '9 hours', now() - interval '8 hours',
             'aaaaaaaa-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000002') $$,
  'período já encerrado não conflita com o aberto do mesmo chamado');
select results_eq(
  $$ select count(*)::int from app.uh_indisponivel where local_id = '11110000-0000-0000-0000-000000000001' and fim is null $$,
  $$ values (2) $$, 'a mesma UH tem períodos abertos de chamados diferentes');

select results_eq(
  $$ select origem, impacto_hospede is null from app.chamado where id = 'c1000000-0000-0000-0000-000000000001' $$,
  $$ values ('interno', true) $$, 'chamado nasce com origem interno e impacto não informado');
select throws_ok(
  $$ update app.chamado set origem = 'Interno!' where id = 'c1000000-0000-0000-0000-000000000001' $$,
  '23514', null, 'origem fora da lista do domínio');
select results_eq(
  $$ select executado_por, fornecedor_id is null, custo_informado is null from app.os where id = '0a100000-0000-0000-0000-000000000001' $$,
  $$ values ('equipe_interna', true, true) $$, 'OS nasce executada pela equipe interna, sem fornecedor nem custo');
select throws_ok(
  $$ update app.os set fornecedor_id = 'f0a00000-0000-0000-0000-000000000001' where id = '0a100000-0000-0000-0000-000000000001' $$,
  '23514', null, 'equipe interna não leva fornecedor');
select throws_ok(
  $$ update app.os set executado_por = 'fornecedor' where id = '0a100000-0000-0000-0000-000000000001' $$,
  '23514', null, 'executada por fornecedor exige o fornecedor');
select throws_ok(
  $$ update app.os set executado_por = 'fornecedor', fornecedor_id = 'f0b00000-0000-0000-0000-000000000001'
     where id = '0a100000-0000-0000-0000-000000000001' $$,
  '23503', null, 'fornecedor de outro tenant');
select throws_ok(
  $$ update app.os set custo_informado = -0.01 where id = '0a100000-0000-0000-0000-000000000001' $$,
  '23514', null, 'custo negativo');

set local role hk_app;

-- Caso 5 — sem contexto
select from (select set_config('app.usuario_id', '', true), set_config('app.tenant_id', '', true)) ctx;
select is_empty('select 1 from app.uh_indisponivel', 'sem contexto: nenhum período');

-- Caso 1 — admin B
select from (select set_config('app.usuario_id', 'bbbbbbbb-0000-0000-0000-000000000001', true),
       set_config('app.tenant_id',  '20000000-0000-0000-0000-000000000000', true)) ctx;
select results_eq($$ select count(*)::int from app.uh_indisponivel where tenant_id = '10000000-0000-0000-0000-000000000000' $$,
  $$ values (0) $$, 'admin B não vê períodos do A');
select throws_ok(
  $$ insert into app.uh_indisponivel (id, tenant_id, hotel_id, local_id, chamado_id, inicio, fim, aberta_por, encerrada_por)
     values (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', '11110000-0000-0000-0000-000000000001',
             'c1000000-0000-0000-0000-000000000001', now() - interval '2 hours', now() - interval '1 hour',
             'bbbbbbbb-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001') $$,
  '42501', null, 'admin B não registra período no A');
select is_empty($$ update app.uh_indisponivel set fim = now(), encerrada_por = 'bbbbbbbb-0000-0000-0000-000000000001'
  where id = 'ea100000-0000-0000-0000-000000000001' returning 1 $$, 'admin B não encerra período do A');

-- Caso 2 — outro técnico do Hotel 1 (sem OS no chamado)
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000005', true),
       set_config('app.tenant_id',  '10000000-0000-0000-0000-000000000000', true)) ctx;
select is_empty($$ update app.uh_indisponivel set fim = now(), encerrada_por = 'aaaaaaaa-0000-0000-0000-000000000005'
  where id = 'ea100000-0000-0000-0000-000000000001' returning 1 $$, 'técnico sem a OS não libera a UH');
select is_empty($$ update app.os set custo_informado = 10 where id = '0a100000-0000-0000-0000-000000000001' returning 1 $$,
  'técnico sem a OS não grava o custo');

-- Caso 2 — o Técnico responsável pela OS do chamado c1
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000004', true)) ctx;
select isnt_empty($$ select 1 from app.uh_indisponivel where hotel_id = '11100000-0000-0000-0000-000000000001' $$,
  'técnico do hotel vê os períodos do hotel');
select throws_ok(
  $$ update app.uh_indisponivel set fim = now(), encerrada_por = 'aaaaaaaa-0000-0000-0000-000000000005'
     where id = 'ea100000-0000-0000-0000-000000000001' $$,
  '42501', null, 'técnico não libera em nome de outro');
select throws_ok(
  $$ update app.uh_indisponivel set inicio = now() where id = 'ea100000-0000-0000-0000-000000000001' $$,
  '42501', null, 'sem UPDATE no início do período');
select throws_ok(
  $$ update app.uh_indisponivel set local_id = '11110000-0000-0000-0000-000000000002' where id = 'ea100000-0000-0000-0000-000000000001' $$,
  '42501', null, 'sem UPDATE na UH do período');
select isnt_empty($$ update app.uh_indisponivel set fim = now(), encerrada_por = 'aaaaaaaa-0000-0000-0000-000000000004', atualizado_em = now()
  where id = 'ea100000-0000-0000-0000-000000000001' returning 1 $$, 'responsável libera a UH do chamado da OS dele');
select is_empty($$ update app.uh_indisponivel set fim = now(), encerrada_por = 'aaaaaaaa-0000-0000-0000-000000000004'
  where id = 'ea100000-0000-0000-0000-000000000004' returning 1 $$, 'com a OS cancelada, o técnico não libera');

-- Caso 4 — técnico do Hotel 2
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000007', true)) ctx;
select results_eq($$ select count(*)::int from app.uh_indisponivel where hotel_id = '11100000-0000-0000-0000-000000000001' $$,
  $$ values (0) $$, 'técnico do Hotel 2 não vê períodos do Hotel 1');
select throws_ok(
  $$ insert into app.uh_indisponivel (id, tenant_id, hotel_id, local_id, chamado_id, inicio, fim, aberta_por, encerrada_por)
     values (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', '11110000-0000-0000-0000-000000000001',
             'c1000000-0000-0000-0000-000000000001', now() - interval '12 hours', now() - interval '11 hours',
             'aaaaaaaa-0000-0000-0000-000000000007', 'aaaaaaaa-0000-0000-0000-000000000007') $$,
  '42501', null, 'técnico do Hotel 2 não registra no Hotel 1');

-- Implantador vencido do Hotel 1 (B2 do docs/11)
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000008', true)) ctx;
select is_empty($$ select 1 from app.uh_indisponivel $$, 'implantador vencido não vê período');
select throws_ok(
  $$ insert into app.uh_indisponivel (id, tenant_id, hotel_id, local_id, chamado_id, inicio, fim, aberta_por, encerrada_por)
     values (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', '11110000-0000-0000-0000-000000000001',
             'c1000000-0000-0000-0000-000000000001', now() - interval '12 hours', now() - interval '11 hours',
             'aaaaaaaa-0000-0000-0000-000000000008', 'aaaaaaaa-0000-0000-0000-000000000008') $$,
  '42501', null, 'implantador vencido não registra período');

-- Caso 2 — gerente do Hotel 1: a triagem corrige o impacto e quem executa, libera e marca depois
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000002', true)) ctx;
select isnt_empty($$ update app.chamado set impacto_hospede = true
  where id = 'c1000000-0000-0000-0000-000000000001' returning 1 $$, 'gerente corrige o impacto no hóspede');
select isnt_empty($$ update app.os set executado_por = 'fornecedor', fornecedor_id = 'f0a00000-0000-0000-0000-000000000001'
  where id = '0a100000-0000-0000-0000-000000000001' returning 1 $$, 'gerente põe a OS com o fornecedor do grupo');
select throws_ok(
  $$ update app.chamado set origem = 'integracao' where id = 'c1000000-0000-0000-0000-000000000001' $$,
  '42501', null, 'sem UPDATE na origem do chamado');
select isnt_empty($$ update app.uh_indisponivel set fim = now(), encerrada_por = 'aaaaaaaa-0000-0000-0000-000000000002'
  where id = 'ea100000-0000-0000-0000-000000000002' returning 1 $$, 'gerente libera a UH do hotel dele');
select lives_ok(
  $$ insert into app.uh_indisponivel (id, tenant_id, hotel_id, local_id, chamado_id, inicio, aberta_por)
     values (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', '11110000-0000-0000-0000-000000000001',
             'c1000000-0000-0000-0000-000000000001', now() - interval '10 minutes', 'aaaaaaaa-0000-0000-0000-000000000002') $$,
  'gerente marca a UH indisponível depois da abertura');

-- Caso 2 — solicitante: marca na abertura (em nome dele), informa o impacto e o custo do chamado que abriu, não libera
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000009', true)) ctx;
select lives_ok(
  $$ insert into app.uh_indisponivel (id, tenant_id, hotel_id, local_id, chamado_id, inicio, aberta_por)
     values ('ea100000-0000-0000-0000-000000000022', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', '11110000-0000-0000-0000-000000000002',
             'c1000000-0000-0000-0000-000000000002', now() - interval '10 minutes', 'aaaaaaaa-0000-0000-0000-000000000009') $$,
  'solicitante marca a UH indisponível');
select isnt_empty($$ update app.os set custo_informado = 150.50 where id = '0a100000-0000-0000-0000-000000000002' returning 1 $$,
  'quem abriu o chamado informa o custo no aceite');
select isnt_empty($$ update app.chamado set impacto_hospede = false
  where id = 'c1000000-0000-0000-0000-000000000002' returning 1 $$, 'quem abriu informa o impacto do chamado dele');
select is_empty($$ update app.uh_indisponivel set fim = now(), encerrada_por = 'aaaaaaaa-0000-0000-0000-000000000009'
  where id = 'ea100000-0000-0000-0000-000000000022' returning 1 $$, 'solicitante não libera a UH');

-- Caso 3 — proprietário da UH 101
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000006', true)) ctx;
select isnt_empty($$ select 1 from app.uh_indisponivel where local_id = '11110000-0000-0000-0000-000000000001' $$,
  'proprietário vê os períodos da UH dele');
select results_eq($$ select count(*)::int from app.uh_indisponivel where local_id <> '11110000-0000-0000-0000-000000000001' $$,
  $$ values (0) $$, 'proprietário não vê os períodos de outra UH');
select throws_ok(
  $$ insert into app.uh_indisponivel (id, tenant_id, hotel_id, local_id, chamado_id, inicio, fim, aberta_por, encerrada_por)
     values (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', '11110000-0000-0000-0000-000000000001',
             'c1000000-0000-0000-0000-000000000001', now() - interval '12 hours', now() - interval '11 hours',
             'aaaaaaaa-0000-0000-0000-000000000006', 'aaaaaaaa-0000-0000-0000-000000000006') $$,
  '42501', null, 'proprietário não registra período');
select is_empty($$ update app.uh_indisponivel set fim = now(), encerrada_por = 'aaaaaaaa-0000-0000-0000-000000000006'
  where id = 'ea100000-0000-0000-0000-000000000004' returning 1 $$, 'proprietário não libera a UH');
select is_empty($$ update app.chamado set impacto_hospede = false
  where id = 'c1000000-0000-0000-0000-000000000001' returning 1 $$, 'proprietário não informa o impacto');
select is_empty($$ update app.os set custo_informado = 1 where id = '0a100000-0000-0000-0000-000000000001' returning 1 $$,
  'proprietário não grava o custo');

-- Admin A: vê tudo do tenant, libera, sem DELETE
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000001', true)) ctx;
select results_eq($$ select count(distinct hotel_id)::int from app.uh_indisponivel $$, $$ values (2) $$,
  'admin A vê os períodos dos dois hotéis do tenant');
select isnt_empty($$ update app.uh_indisponivel set fim = now(), encerrada_por = 'aaaaaaaa-0000-0000-0000-000000000001'
  where id = 'ea100000-0000-0000-0000-000000000004' returning 1 $$, 'admin A libera a UH');
select throws_ok($$ delete from app.uh_indisponivel $$, '42501', null, 'sem DELETE em UH indisponível');
reset role;

-- Worker vê só o tenant do job, com as colunas novas da OS
set local role hk_worker;
select from (select set_config('app.tenant_id', '10000000-0000-0000-0000-000000000000', true)) ctx;
select results_eq('select count(distinct tenant_id)::int from app.uh_indisponivel', $$ values (1) $$,
  'worker vê só o tenant do job');
select results_eq(
  $$ select executado_por, fornecedor_id::text from app.os where id = '0a100000-0000-0000-0000-000000000001' $$,
  $$ values ('fornecedor', 'f0a00000-0000-0000-0000-000000000001') $$,
  'worker lê quem executou a OS');
reset role;

select * from finish();
rollback;
