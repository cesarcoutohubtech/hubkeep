-- ============================================================================
-- Isolamento do registro dos envios e das inscrições de push (migração 0049,
-- fase 1c, item 5; ADR-046). Os seis casos mínimos do doc 02:
--   app.envio_notificacao
--     1. admin de outro tenant não vê nem grava;
--     2. a gestão lê: o Admin do grupo, todos os hotéis; o Gerente e o Gestor
--        CSC, só os hotéis deles. Ninguém do hk_app grava, altera ou apaga: o
--        envio é do worker;
--     3. o proprietário não vê;
--     4. o Técnico e o Solicitante do hotel não veem;
--     5. sem contexto, nada;
--     6. FK composta: o envio só existe no hotel do tenant e para membro do
--        tenant.
--   app.inscricao_push
--     cada pessoa lê, cria e revoga só as próprias; ninguém altera o endpoint
--     nem as chaves; o admin de outro tenant e quem está sem contexto não
--     veem; a inscrição é de membro do tenant.
-- Mais: canal e situação só na lista do domínio; um envio por evento,
-- destinatário e canal, com a falha fora da conta; o registro dos envios sem
-- UPDATE e sem DELETE para ninguém; o worker grava e vê só o tenant do job,
-- e revoga a inscrição recusada sem mudar o resto.
-- ============================================================================
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(45);

grant usage on schema extensions to hk_app, hk_worker;

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'admin@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'gerente@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000003', 'gestor-h2@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000004', 'tecnico@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000005', 'solicitante@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000006', 'proprietario@a.test'),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'admin@b.test');

insert into app.tenant (id, nome) values
  ('10000000-0000-0000-0000-000000000000', 'Grupo A'),
  ('20000000-0000-0000-0000-000000000000', 'Grupo B');
insert into app.membro (tenant_id, usuario_id, nome, email)
select '10000000-0000-0000-0000-000000000000', id, email, email from auth.users where email like '%@a.test';
insert into app.membro (tenant_id, usuario_id, nome, email) values
  ('20000000-0000-0000-0000-000000000000', 'bbbbbbbb-0000-0000-0000-000000000001', 'Admin B', 'admin@b.test');
insert into app.hotel (id, tenant_id, nome, fuso, status) values
  ('11100000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', 'Hotel 1', 'America/Sao_Paulo', 'ativo'),
  ('11100000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000000', 'Hotel 2', 'America/Manaus', 'ativo'),
  ('22200000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000000', 'Hotel B', 'America/Sao_Paulo', 'ativo');
insert into app.local (id, tenant_id, hotel_id, tipo, nome, busca, status) values
  ('11110000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'uh', 'UH 101', 'uh 101', 'ativo');
insert into app.proprietario (id, tenant_id, nome) values
  ('11200000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', 'Dono do Hotel 1');
insert into app.hotel_proprietario (id, tenant_id, proprietario_id, hotel_id, vigencia_inicio) values
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11200000-0000-0000-0000-000000000001',
   '11100000-0000-0000-0000-000000000001', current_date - 1);
insert into app.atribuicao_escopo (id, tenant_id, usuario_id, papel, escopo_tipo, hotel_id, proprietario_id, valido_ate, concedido_por) values
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000001', 'admin_grupo', 'grupo', null, null, null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000002', 'gerente_hotel', 'hotel', '11100000-0000-0000-0000-000000000001', null, null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000003', 'gestor_csc', 'hotel', '11100000-0000-0000-0000-000000000002', null, null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000004', 'tecnico', 'hotel', '11100000-0000-0000-0000-000000000001', null, null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000005', 'solicitante', 'hotel', '11100000-0000-0000-0000-000000000001', null, null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000006', 'proprietario', 'proprietario', null, '11200000-0000-0000-0000-000000000001', null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '20000000-0000-0000-0000-000000000000', 'bbbbbbbb-0000-0000-0000-000000000001', 'admin_grupo', 'grupo', null, null, null, 'bbbbbbbb-0000-0000-0000-000000000001');

-- Envios: e1 (Hotel 1, ao gerente), e2 (Hotel 2, ao gestor), eb (tenant B).
insert into app.envio_notificacao (id, tenant_id, hotel_id, evento_id, tipo_evento, usuario_id, canal, situacao) values
  ('e1000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
   'ee000000-0000-0000-0000-000000000001', 'chamado.sla_alerta', 'aaaaaaaa-0000-0000-0000-000000000002', 'email', 'sem_provedor'),
  ('e2000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000002',
   'ee000000-0000-0000-0000-000000000002', 'chamado.sla_alerta', 'aaaaaaaa-0000-0000-0000-000000000003', 'email', 'enviado'),
  ('eb000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000000', '22200000-0000-0000-0000-000000000001',
   'ee000000-0000-0000-0000-00000000000b', 'chamado.sla_alerta', 'bbbbbbbb-0000-0000-0000-000000000001', 'email', 'enviado');
-- Inscrições: p1 (técnico), p2 (gerente), pb (tenant B).
insert into app.inscricao_push (id, tenant_id, usuario_id, endpoint, chave_p256dh, chave_auth) values
  ('f1000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000004',
   'https://push.example/tecnico-1', 'p256dh-1', 'auth-1'),
  ('f2000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000002',
   'https://push.example/gerente-1', 'p256dh-2', 'auth-2'),
  ('fb000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000000', 'bbbbbbbb-0000-0000-0000-000000000001',
   'https://push.example/admin-b', 'p256dh-b', 'auth-b');

-- Caso 6 — FK composta, checks e unicidade (como postgres)
select throws_ok(
  $$ insert into app.envio_notificacao (id, tenant_id, hotel_id, evento_id, tipo_evento, usuario_id, canal, situacao)
     values (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '22200000-0000-0000-0000-000000000001',
             gen_random_uuid(), 'chamado.sla_alerta', 'aaaaaaaa-0000-0000-0000-000000000002', 'email', 'enviado') $$,
  '23503', null, 'envio em hotel de outro tenant');
select throws_ok(
  $$ insert into app.envio_notificacao (id, tenant_id, hotel_id, evento_id, tipo_evento, usuario_id, canal, situacao)
     values (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
             gen_random_uuid(), 'chamado.sla_alerta', 'bbbbbbbb-0000-0000-0000-000000000001', 'email', 'enviado') $$,
  '23503', null, 'envio a quem não é membro do tenant');
select throws_ok(
  $$ insert into app.envio_notificacao (id, tenant_id, hotel_id, evento_id, tipo_evento, usuario_id, canal, situacao)
     values (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
             gen_random_uuid(), 'chamado.sla_alerta', 'aaaaaaaa-0000-0000-0000-000000000002', 'sms', 'enviado') $$,
  '23514', null, 'canal fora da lista do domínio');
select throws_ok(
  $$ insert into app.envio_notificacao (id, tenant_id, hotel_id, evento_id, tipo_evento, usuario_id, canal, situacao)
     values (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
             gen_random_uuid(), 'chamado.sla_alerta', 'aaaaaaaa-0000-0000-0000-000000000002', 'email', 'agrupado') $$,
  '23514', null, 'situação fora da lista do domínio');
select throws_ok(
  $$ insert into app.envio_notificacao (id, tenant_id, hotel_id, evento_id, tipo_evento, usuario_id, canal, situacao)
     values (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
             'ee000000-0000-0000-0000-000000000001', 'chamado.sla_alerta', 'aaaaaaaa-0000-0000-0000-000000000002', 'email', 'enviado') $$,
  '23505', null, 'um envio por evento, destinatário e canal');
select lives_ok(
  $$ insert into app.envio_notificacao (id, tenant_id, hotel_id, evento_id, tipo_evento, usuario_id, canal, situacao) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
      'ee000000-0000-0000-0000-000000000003', 'chamado.sla_alerta', 'aaaaaaaa-0000-0000-0000-000000000002', 'push', 'falhou'),
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
      'ee000000-0000-0000-0000-000000000003', 'chamado.sla_alerta', 'aaaaaaaa-0000-0000-0000-000000000002', 'push', 'falhou'),
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
      'ee000000-0000-0000-0000-000000000003', 'chamado.sla_alerta', 'aaaaaaaa-0000-0000-0000-000000000002', 'push', 'enviado') $$,
  'a falha não conta: as tentativas gravam outra linha até o envio');
select throws_ok(
  $$ insert into app.inscricao_push (id, tenant_id, usuario_id, endpoint, chave_p256dh, chave_auth)
     values (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'bbbbbbbb-0000-0000-0000-000000000001',
             'https://push.example/x', 'p', 'a') $$,
  '23503', null, 'inscrição de quem não é membro do tenant');
select ok(
  not has_any_column_privilege('hk_app', 'app.envio_notificacao', 'UPDATE')
  and not has_any_column_privilege('hk_worker', 'app.envio_notificacao', 'UPDATE')
  and not has_table_privilege('hk_app', 'app.envio_notificacao', 'INSERT')
  and not has_table_privilege('hk_app', 'app.envio_notificacao', 'DELETE')
  and not has_table_privilege('hk_worker', 'app.envio_notificacao', 'DELETE'),
  'envio: o hk_app só lê; o worker só lê e grava; ninguém altera nem apaga');
select ok(
  has_column_privilege('hk_app', 'app.inscricao_push', 'revogada_em', 'UPDATE')
  and has_column_privilege('hk_worker', 'app.inscricao_push', 'revogada_em', 'UPDATE')
  and not has_column_privilege('hk_app', 'app.inscricao_push', 'endpoint', 'UPDATE')
  and not has_column_privilege('hk_app', 'app.inscricao_push', 'chave_auth', 'UPDATE')
  and not has_column_privilege('hk_worker', 'app.inscricao_push', 'endpoint', 'UPDATE')
  and not has_table_privilege('hk_worker', 'app.inscricao_push', 'INSERT')
  and not has_table_privilege('hk_app', 'app.inscricao_push', 'DELETE')
  and not has_table_privilege('hk_worker', 'app.inscricao_push', 'DELETE'),
  'inscrição: só a revogação muda, e ninguém apaga');

set local role hk_app;

-- Caso 5 — sem contexto
select from (select set_config('app.usuario_id', '', true), set_config('app.tenant_id', '', true)) ctx;
select is_empty('select 1 from app.envio_notificacao', 'sem contexto: nenhum envio');
select is_empty('select 1 from app.inscricao_push', 'sem contexto: nenhuma inscrição');

-- Caso 1 — admin B
select from (select set_config('app.usuario_id', 'bbbbbbbb-0000-0000-0000-000000000001', true),
       set_config('app.tenant_id',  '20000000-0000-0000-0000-000000000000', true)) ctx;
select results_eq($$ select count(*)::int from app.envio_notificacao where tenant_id = '10000000-0000-0000-0000-000000000000' $$,
  $$ values (0) $$, 'admin B não vê envios do A');
select results_eq($$ select count(*)::int from app.inscricao_push where tenant_id = '10000000-0000-0000-0000-000000000000' $$,
  $$ values (0) $$, 'admin B não vê inscrições do A');
select throws_ok(
  $$ insert into app.inscricao_push (id, tenant_id, usuario_id, endpoint, chave_p256dh, chave_auth)
     values (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000004',
             'https://push.example/invasor', 'p', 'a') $$,
  '42501', null, 'admin B não cria inscrição no A');

-- Caso 2 — admin A: todos os hotéis do grupo, e não grava envio
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000001', true),
       set_config('app.tenant_id',  '10000000-0000-0000-0000-000000000000', true)) ctx;
select results_eq('select count(*)::int from app.envio_notificacao', $$ values (5) $$,
  'admin do grupo vê os envios de todos os hotéis');
select throws_ok(
  $$ insert into app.envio_notificacao (id, tenant_id, hotel_id, evento_id, tipo_evento, usuario_id, canal, situacao)
     values (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
             gen_random_uuid(), 'chamado.sla_alerta', 'aaaaaaaa-0000-0000-0000-000000000002', 'email', 'enviado') $$,
  '42501', null, 'admin do grupo não grava envio: é do worker');
select throws_ok(
  $$ delete from app.envio_notificacao where id = 'e1000000-0000-0000-0000-000000000001' $$,
  '42501', null, 'admin do grupo não apaga envio');
select is_empty('select 1 from app.inscricao_push', 'admin do grupo não vê a inscrição dos outros');

-- Caso 2 — gerente do Hotel 1: só o hotel dele; a própria inscrição
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000002', true)) ctx;
select results_eq($$ select count(*)::int from app.envio_notificacao where hotel_id = '11100000-0000-0000-0000-000000000001' $$,
  $$ values (4) $$, 'gerente vê os envios do hotel dele');
select results_eq($$ select count(*)::int from app.envio_notificacao where hotel_id = '11100000-0000-0000-0000-000000000002' $$,
  $$ values (0) $$, 'gerente do Hotel 1 não vê os do Hotel 2');
select throws_ok(
  $$ update app.envio_notificacao set situacao = 'enviado' where id = 'e1000000-0000-0000-0000-000000000001' $$,
  '42501', null, 'gerente não altera envio');
select results_eq('select id::text from app.inscricao_push',
  $$ values ('f2000000-0000-0000-0000-000000000001') $$, 'gerente vê só a própria inscrição');

-- Caso 2 — Gestor CSC do Hotel 2: só o hotel dele
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000003', true)) ctx;
select results_eq('select count(*)::int from app.envio_notificacao', $$ values (1) $$,
  'Gestor CSC vê só os envios do hotel dele');

-- Caso 4 — Solicitante do Hotel 1 não vê envio
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000005', true)) ctx;
select is_empty('select 1 from app.envio_notificacao', 'solicitante não vê envio');

-- Caso 3 — proprietário do Hotel 1 não vê envio
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000006', true)) ctx;
select is_empty('select 1 from app.envio_notificacao', 'proprietário não vê envio');

-- Caso 4 — Técnico do Hotel 1: não vê envio; só as próprias inscrições
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000004', true)) ctx;
select is_empty('select 1 from app.envio_notificacao', 'técnico não vê envio');
select results_eq('select id::text from app.inscricao_push',
  $$ values ('f1000000-0000-0000-0000-000000000001') $$, 'técnico vê só a própria inscrição');
select lives_ok(
  $$ insert into app.inscricao_push (id, tenant_id, usuario_id, endpoint, chave_p256dh, chave_auth)
     values ('f1000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000004',
             'https://push.example/tecnico-2', 'p256dh-3', 'auth-3') $$,
  'técnico cria a inscrição de outro aparelho');
select throws_ok(
  $$ insert into app.inscricao_push (id, tenant_id, usuario_id, endpoint, chave_p256dh, chave_auth)
     values (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000004',
             'https://push.example/tecnico-1', 'p', 'a') $$,
  '23505', null, 'uma inscrição ativa por pessoa e endpoint');
select throws_ok(
  $$ insert into app.inscricao_push (id, tenant_id, usuario_id, endpoint, chave_p256dh, chave_auth)
     values (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000002',
             'https://push.example/em-nome-do-gerente', 'p', 'a') $$,
  '42501', null, 'técnico não cria inscrição em nome de outra pessoa');
select throws_ok(
  $$ update app.inscricao_push set endpoint = 'https://push.example/outro' where id = 'f1000000-0000-0000-0000-000000000001' $$,
  '42501', null, 'técnico não altera o endpoint');
select results_eq(
  $$ with r as (update app.inscricao_push set revogada_em = now()
                where id = 'f2000000-0000-0000-0000-000000000001' returning 1)
     select count(*)::int from r $$,
  $$ values (0) $$, 'técnico não revoga a inscrição do gerente');
select results_eq(
  $$ with r as (update app.inscricao_push set revogada_em = now()
                where id = 'f1000000-0000-0000-0000-000000000001' returning 1)
     select count(*)::int from r $$,
  $$ values (1) $$, 'técnico revoga a própria inscrição');
select lives_ok(
  $$ insert into app.inscricao_push (id, tenant_id, usuario_id, endpoint, chave_p256dh, chave_auth)
     values (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000004',
             'https://push.example/tecnico-1', 'p256dh-4', 'auth-4') $$,
  'depois da revogação, o mesmo aparelho se inscreve de novo');
select throws_ok(
  $$ delete from app.inscricao_push where id = 'f1000000-0000-0000-0000-000000000002' $$,
  '42501', null, 'técnico não apaga inscrição: a revogação é lógica');

reset role;

-- Worker: grava e vê só o tenant do job
set local role hk_worker;
select from (select set_config('app.tenant_id', '10000000-0000-0000-0000-000000000000', true)) ctx;
select results_eq('select count(distinct tenant_id)::int from app.envio_notificacao', $$ values (1) $$,
  'worker vê os envios só do tenant do job');
select results_eq('select count(*)::int from app.inscricao_push', $$ values (4) $$,
  'worker vê as inscrições do tenant do job, também as revogadas');
select lives_ok(
  $$ insert into app.envio_notificacao (id, tenant_id, hotel_id, evento_id, tipo_evento, usuario_id, canal, situacao)
     values (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000002',
             gen_random_uuid(), 'chamado.sla_alerta', 'aaaaaaaa-0000-0000-0000-000000000003', 'email', 'sem_provedor') $$,
  'worker grava envio no tenant do job');
select throws_ok(
  $$ insert into app.envio_notificacao (id, tenant_id, hotel_id, evento_id, tipo_evento, usuario_id, canal, situacao)
     values (gen_random_uuid(), '20000000-0000-0000-0000-000000000000', '22200000-0000-0000-0000-000000000001',
             gen_random_uuid(), 'chamado.sla_alerta', 'bbbbbbbb-0000-0000-0000-000000000001', 'email', 'enviado') $$,
  '42501', null, 'worker não grava envio de outro tenant');
select throws_ok(
  $$ update app.envio_notificacao set situacao = 'falhou' where id = 'e1000000-0000-0000-0000-000000000001' $$,
  '42501', null, 'worker não altera envio');
select throws_ok(
  $$ delete from app.envio_notificacao where id = 'e1000000-0000-0000-0000-000000000001' $$,
  '42501', null, 'worker não apaga envio');
select results_eq(
  $$ with r as (update app.inscricao_push set revogada_em = now()
                where id = 'f2000000-0000-0000-0000-000000000001' returning 1)
     select count(*)::int from r $$,
  $$ values (1) $$, 'worker revoga a inscrição que o serviço de push recusou');
select results_eq(
  $$ with r as (update app.inscricao_push set revogada_em = now()
                where id = 'fb000000-0000-0000-0000-000000000001' returning 1)
     select count(*)::int from r $$,
  $$ values (0) $$, 'worker não revoga inscrição de outro tenant');
select throws_ok(
  $$ update app.inscricao_push set chave_auth = 'x' where id = 'f1000000-0000-0000-0000-000000000002' $$,
  '42501', null, 'worker não altera as chaves');
select throws_ok(
  $$ insert into app.inscricao_push (id, tenant_id, usuario_id, endpoint, chave_p256dh, chave_auth)
     values (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000004',
             'https://push.example/pelo-worker', 'p', 'a') $$,
  '42501', null, 'worker não cria inscrição: é de cada pessoa');

reset role;

select * from finish();
rollback;
