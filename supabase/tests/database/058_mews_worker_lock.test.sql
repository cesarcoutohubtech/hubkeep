begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(17);

-- Só fixtures descartáveis do runner pgTAP. Não alcança Supabase-dev/prod.
insert into auth.users (id, email) values
  ('ad000000-0000-0000-0000-000000000001', 'admin@mewslock.invalid'),
  ('bd000000-0000-0000-0000-000000000001', 'adminb@mewslock.invalid');
insert into app.tenant (id,nome) values
  ('aa000000-0000-0000-0000-000000000000','Tenant lock A'),
  ('bb000000-0000-0000-0000-000000000000','Tenant lock B');
insert into app.membro (tenant_id,usuario_id,nome,email) values
  ('aa000000-0000-0000-0000-000000000000','ad000000-0000-0000-0000-000000000001','Admin A','admin@mewslock.invalid'),
  ('bb000000-0000-0000-0000-000000000000','bd000000-0000-0000-0000-000000000001','Admin B','adminb@mewslock.invalid');
insert into app.hotel (id,tenant_id,nome,fuso,status) values
  ('aa100000-0000-0000-0000-000000000001','aa000000-0000-0000-0000-000000000000','Hotel lock A','UTC','ativo'),
  ('aa100000-0000-0000-0000-000000000002','aa000000-0000-0000-0000-000000000000','Hotel lock revogado','UTC','ativo'),
  ('bb100000-0000-0000-0000-000000000001','bb000000-0000-0000-0000-000000000000','Hotel lock B','UTC','ativo');
insert into app.mews_vinculo
  (id,tenant_id,hotel_id,enterprise_id,credencial_ref,validado_por,validado_em,revogado_em)
values
  ('aa200000-0000-0000-0000-000000000001','aa000000-0000-0000-0000-000000000000',
   'aa100000-0000-0000-0000-000000000001','E-A','vault:test-a',
   'ad000000-0000-0000-0000-000000000001',now()-interval '1 day',null),
  ('aa200000-0000-0000-0000-000000000002','aa000000-0000-0000-0000-000000000000',
   'aa100000-0000-0000-0000-000000000002','E-REV','vault:test-rev',
   'ad000000-0000-0000-0000-000000000001',now()-interval '1 day',now()),
  ('bb200000-0000-0000-0000-000000000001','bb000000-0000-0000-0000-000000000000',
   'bb100000-0000-0000-0000-000000000001','E-B','vault:test-b',
   'bd000000-0000-0000-0000-000000000001',now()-interval '1 day',null);

select has_column('app','mews_vinculo','lock_versao','coluna inerte para lock existe');
select col_type_is('app','mews_vinculo','lock_versao','bigint','lock_versao é bigint');
select ok((select relrowsecurity and relforcerowsecurity from pg_class
           where oid='app.mews_vinculo'::regclass), 'RLS permanece ENABLE/FORCE');
select ok(has_column_privilege('hk_worker','app.mews_vinculo','lock_versao','UPDATE'),
          'worker tem UPDATE mínimo para lock');
select ok(not has_column_privilege('hk_worker','app.mews_vinculo','revogado_em','UPDATE'),
          'worker não revoga vínculo');
select ok(not has_column_privilege('hk_worker','app.mews_vinculo','credencial_ref','UPDATE'),
          'worker não altera referência de cofre');
select ok(not has_column_privilege('hk_worker','app.mews_vinculo','hotel_id','UPDATE'),
          'worker não muda hotel');
select ok(not has_column_privilege('hk_worker','app.mews_vinculo','enterprise_id','UPDATE'),
          'worker não muda EnterpriseId');
select ok(not has_column_privilege('hk_worker','app.mews_vinculo','validado_por','UPDATE'),
          'worker não muda aprovador');

set local role hk_worker;
select from (select set_config('app.usuario_id','',true),
                    set_config('app.tenant_id','aa000000-0000-0000-0000-000000000000',true)) ctx;
select results_eq(
  $$ select id from app.mews_vinculo where enterprise_id='E-A' for update $$,
  $$ values ('aa200000-0000-0000-0000-000000000001'::uuid) $$,
  'worker pode bloquear vínculo ativo no próprio tenant');
select is_empty(
  $$ select id from app.mews_vinculo where enterprise_id='E-B' for update $$,
  'worker não trava vínculo de outro tenant');
select is_empty(
  $$ select id from app.mews_vinculo where enterprise_id='E-REV' for update $$,
  'worker não trava vínculo revogado');
select throws_ok(
  $$ update app.mews_vinculo set revogado_em=now() where enterprise_id='E-A' $$,
  '42501',null,'worker continua proibido de revogar');
select results_eq(
  $$ update app.mews_vinculo set lock_versao=lock_versao+1 where enterprise_id='E-A'
     returning lock_versao $$,
  $$ values (1::bigint) $$,
  'worker só pode mudar coluna inerte do tenant');
select is_empty(
  $$ update app.mews_vinculo set lock_versao=lock_versao+1 where enterprise_id='E-REV'
     returning id $$,
  'worker não atualiza lock em vínculo revogado');
select from (select set_config('app.tenant_id','bb000000-0000-0000-0000-000000000000',true)) ctx;
select is_empty(
  $$ select id from app.mews_vinculo where enterprise_id='E-A' for update $$,
  'outro tenant não consegue lock do primeiro');
select from (select set_config('app.tenant_id','',true)) ctx;
select is_empty(
  $$ select id from app.mews_vinculo for update $$,
  'worker sem tenant não consegue lock');
reset role;
select * from finish();
rollback;
