begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(14);
grant usage on schema extensions to hk_app, hk_worker;
insert into auth.users (id,email) values ('aaaaaaaa-0000-0000-0000-000000000001','admina@mews.test'),('aaaaaaaa-0000-0000-0000-000000000002','gerente@mews.test'),('aaaaaaaa-0000-0000-0000-000000000003','proprietario@mews.test'),('aaaaaaaa-0000-0000-0000-000000000004','implantador@mews.test'),('bbbbbbbb-0000-0000-0000-000000000001','adminb@mews.test');
insert into app.tenant(id,nome) values ('10000000-0000-0000-0000-000000000000','Grupo A'),('20000000-0000-0000-0000-000000000000','Grupo B');
insert into app.membro (tenant_id,usuario_id,nome,email)
 select case when id='bbbbbbbb-0000-0000-0000-000000000001' then '20000000-0000-0000-0000-000000000000'::uuid else '10000000-0000-0000-0000-000000000000'::uuid end, id,email,email from auth.users where email like '%@mews.test';
insert into app.hotel(id,tenant_id,nome,fuso,status) values
 ('11100000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000000','Hotel A1','UTC','ativo'),('11100000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000000','Hotel A2','UTC','ativo'),('21100000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000000','Hotel B','UTC','ativo');
insert into app.atribuicao_escopo
 (id,tenant_id,usuario_id,papel,escopo_tipo,hotel_id,valido_ate,concedido_por) values
 (gen_random_uuid(),'10000000-0000-0000-0000-000000000000','aaaaaaaa-0000-0000-0000-000000000001','admin_grupo','grupo',null,null,'aaaaaaaa-0000-0000-0000-000000000001'),
 (gen_random_uuid(),'10000000-0000-0000-0000-000000000000','aaaaaaaa-0000-0000-0000-000000000002','gerente_hotel','hotel','11100000-0000-0000-0000-000000000001',null,'aaaaaaaa-0000-0000-0000-000000000001'),
 (gen_random_uuid(),'10000000-0000-0000-0000-000000000000','aaaaaaaa-0000-0000-0000-000000000003','proprietario','hotel','11100000-0000-0000-0000-000000000001',null,'aaaaaaaa-0000-0000-0000-000000000001'),
 (gen_random_uuid(),'10000000-0000-0000-0000-000000000000','aaaaaaaa-0000-0000-0000-000000000004','implantador','hotel','11100000-0000-0000-0000-000000000001',now()-interval '1 day','aaaaaaaa-0000-0000-0000-000000000001'),
 (gen_random_uuid(),'20000000-0000-0000-0000-000000000000','bbbbbbbb-0000-0000-0000-000000000001','admin_grupo','grupo',null,null,'bbbbbbbb-0000-0000-0000-000000000001');
insert into app.mews_vinculo (id,tenant_id,hotel_id,enterprise_id,credencial_ref,validado_por,validado_em) values
 ('e1000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000000','11100000-0000-0000-0000-000000000001','E-A1','cofre/a1','aaaaaaaa-0000-0000-0000-000000000001',now()-interval '1 day'),
 ('e1000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000000','11100000-0000-0000-0000-000000000002','E-A2','cofre/a2','aaaaaaaa-0000-0000-0000-000000000001',now()-interval '1 day'),
 ('e2000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000000','21100000-0000-0000-0000-000000000001','E-B','cofre/b','bbbbbbbb-0000-0000-0000-000000000001',now()-interval '1 day');
select throws_ok($$ insert into app.mews_vinculo(id,tenant_id,hotel_id,enterprise_id,credencial_ref,validado_por,validado_em) values (gen_random_uuid(),'10000000-0000-0000-0000-000000000000','21100000-0000-0000-0000-000000000001','E-X','cofre/invalid','aaaaaaaa-0000-0000-0000-000000000001',now()) $$, '23503',null,'FK composta rejeita hotel em tenant incorreto');
select throws_ok($$ insert into app.mews_vinculo(id,tenant_id,hotel_id,enterprise_id,credencial_ref,validado_por,validado_em) values (gen_random_uuid(),'10000000-0000-0000-0000-000000000000','11100000-0000-0000-0000-000000000002','E-A1','cofre/x','aaaaaaaa-0000-0000-0000-000000000001',now()) $$, '23505',null,'EnterpriseId repetida e recusada');
set local role hk_app;
select from (select set_config('app.usuario_id','',true),set_config('app.tenant_id','',true)) ctx;
select is_empty($$ select 1 from app.mews_vinculo $$,'sem contexto nao ve vinculos');
select from (select set_config('app.usuario_id','bbbbbbbb-0000-0000-0000-000000000001',true),set_config('app.tenant_id','20000000-0000-0000-0000-000000000000',true)) ctx;
select results_eq($$ select count(*)::int from app.mews_vinculo $$,$$values (1)$$,'Admin do tenant B ve somente B');
select throws_ok($$ insert into app.mews_vinculo(id,tenant_id,hotel_id,enterprise_id,credencial_ref,validado_por,validado_em) values (gen_random_uuid(),'10000000-0000-0000-0000-000000000000','11100000-0000-0000-0000-000000000001','E-XX','cofre/x','bbbbbbbb-0000-0000-0000-000000000001',now()) $$, '42501',null,'Admin B nao insere no tenant A');
select from (select set_config('app.usuario_id','aaaaaaaa-0000-0000-0000-000000000001',true),set_config('app.tenant_id','10000000-0000-0000-0000-000000000000',true)) ctx;
select results_eq($$ select count(*)::int from app.mews_vinculo $$,$$values (2)$$,'Admin A ve apenas os proprios vinculos');
select throws_ok($$ select credencial_ref from app.mews_vinculo $$, '42501',null,'hk_app nunca consulta a referencia da credencial');
select from (select set_config('app.usuario_id','aaaaaaaa-0000-0000-0000-000000000002',true),set_config('app.tenant_id','10000000-0000-0000-0000-000000000000',true)) ctx;
select is_empty($$ select 1 from app.mews_vinculo $$,'Gerente nao ve vinculos');
select from (select set_config('app.usuario_id','aaaaaaaa-0000-0000-0000-000000000003',true),set_config('app.tenant_id','10000000-0000-0000-0000-000000000000',true)) ctx;
select is_empty($$ select 1 from app.mews_vinculo $$,'Proprietario nao ve vinculos');
select from (select set_config('app.usuario_id','aaaaaaaa-0000-0000-0000-000000000004',true),set_config('app.tenant_id','10000000-0000-0000-0000-000000000000',true)) ctx;
select is_empty($$ select 1 from app.mews_vinculo $$,'Implantador vencido nao ve vinculos');
reset role;
set local role hk_worker;
select from (select set_config('app.usuario_id','',true),set_config('app.tenant_id','10000000-0000-0000-0000-000000000000',true)) ctx;
select results_eq($$ select count(*)::int from app.mews_vinculo $$,$$values (2)$$,'worker do tenant A ve dois vinculos');
select throws_ok($$ update app.mews_vinculo set revogado_em=now() $$, '42501',null,'worker nao altera vinculo');
select from (select set_config('app.usuario_id','',true),set_config('app.tenant_id','20000000-0000-0000-0000-000000000000',true)) ctx;
select results_eq($$ select count(*)::int from app.mews_vinculo $$,$$values (1)$$,'worker do tenant B ve B');
select from (select set_config('app.usuario_id','',true),set_config('app.tenant_id','',true)) ctx;
select is_empty($$ select 1 from app.mews_vinculo $$,'worker sem tenant nao ve vinculos');
reset role;
select * from finish();
rollback;
