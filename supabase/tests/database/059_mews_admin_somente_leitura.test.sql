begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(27);
grant usage on schema extensions to hk_app;

-- Apenas dados sinteticos; pgTAP sempre ROLLBACK no banco descartavel de CI.
insert into auth.users (id,email) values
 ('ca000000-0000-0000-0000-000000000001','admina@mewsview.invalid'),
 ('ca000000-0000-0000-0000-000000000002','gerentea@mewsview.invalid'),
 ('ca000000-0000-0000-0000-000000000003','proprietarioa@mewsview.invalid'),
 ('ca000000-0000-0000-0000-000000000004','implantadora@mewsview.invalid'),
 ('cb000000-0000-0000-0000-000000000001','adminb@mewsview.invalid');

insert into app.tenant(id,nome) values
 ('ca100000-0000-0000-0000-000000000000','Mews painel A'),
 ('cb100000-0000-0000-0000-000000000000','Mews painel B');
insert into app.membro(tenant_id,usuario_id,nome,email)
 select case when id='cb000000-0000-0000-0000-000000000001'
   then 'cb100000-0000-0000-0000-000000000000'::uuid
   else 'ca100000-0000-0000-0000-000000000000'::uuid end,id,email,email
 from auth.users where email like '%@mewsview.invalid';
insert into app.hotel(id,tenant_id,nome,fuso,status) values
 ('ca200000-0000-0000-0000-000000000001','ca100000-0000-0000-0000-000000000000','Hotel ativo A','UTC','ativo'),
 ('ca200000-0000-0000-0000-000000000002','ca100000-0000-0000-0000-000000000000','Hotel revogado A','UTC','ativo'),
 ('cb200000-0000-0000-0000-000000000001','cb100000-0000-0000-0000-000000000000','Hotel ativo B','UTC','ativo');
insert into app.atribuicao_escopo
(id,tenant_id,usuario_id,papel,escopo_tipo,hotel_id,valido_ate,concedido_por) values
(gen_random_uuid(),'ca100000-0000-0000-0000-000000000000','ca000000-0000-0000-0000-000000000001','admin_grupo','grupo',null,null,'ca000000-0000-0000-0000-000000000001'),
(gen_random_uuid(),'ca100000-0000-0000-0000-000000000000','ca000000-0000-0000-0000-000000000002','gerente_hotel','hotel','ca200000-0000-0000-0000-000000000001',null,'ca000000-0000-0000-0000-000000000001'),
(gen_random_uuid(),'ca100000-0000-0000-0000-000000000000','ca000000-0000-0000-0000-000000000003','proprietario','hotel','ca200000-0000-0000-0000-000000000001',null,'ca000000-0000-0000-0000-000000000001'),
(gen_random_uuid(),'ca100000-0000-0000-0000-000000000000','ca000000-0000-0000-0000-000000000004','implantador','hotel','ca200000-0000-0000-0000-000000000001',now()-interval '1 day','ca000000-0000-0000-0000-000000000001'),
(gen_random_uuid(),'cb100000-0000-0000-0000-000000000000','cb000000-0000-0000-0000-000000000001','admin_grupo','grupo',null,null,'cb000000-0000-0000-0000-000000000001');

insert into app.mews_vinculo
(id,tenant_id,hotel_id,enterprise_id,credencial_ref,validado_por,validado_em,revogado_em) values
('ca300000-0000-0000-0000-000000000001','ca100000-0000-0000-0000-000000000000','ca200000-0000-0000-0000-000000000001','E-A','cofre/sintetico-a','ca000000-0000-0000-0000-000000000001',now()-interval '1 day',null),
('ca300000-0000-0000-0000-000000000002','ca100000-0000-0000-0000-000000000000','ca200000-0000-0000-0000-000000000002','E-REV','cofre/sintetico-rev','ca000000-0000-0000-0000-000000000001',now()-interval '1 day',now()),
('cb300000-0000-0000-0000-000000000001','cb100000-0000-0000-0000-000000000000','cb200000-0000-0000-0000-000000000001','E-B','cofre/sintetico-b','cb000000-0000-0000-0000-000000000001',now()-interval '1 day',null);

insert into app.mews_checkpoint
(tenant_id,hotel_id,enterprise_id,versao,digest_incremental) values
('ca100000-0000-0000-0000-000000000000','ca200000-0000-0000-0000-000000000001','E-A',2,repeat('a',64)),
('ca100000-0000-0000-0000-000000000000','ca200000-0000-0000-0000-000000000002','E-REV',5,repeat('b',64)),
('cb100000-0000-0000-0000-000000000000','cb200000-0000-0000-0000-000000000001','E-B',1,repeat('c',64));
insert into app.mews_recurso (tenant_id,hotel_id,enterprise_id,resource_id,ativo) values
('ca100000-0000-0000-0000-000000000000','ca200000-0000-0000-0000-000000000001','E-A','R-A',true),
('ca100000-0000-0000-0000-000000000000','ca200000-0000-0000-0000-000000000002','E-REV','R-REV',true),
('cb100000-0000-0000-0000-000000000000','cb200000-0000-0000-0000-000000000001','E-B','R-B',true);
insert into app.mews_bloqueio
(tenant_id,hotel_id,enterprise_id,block_id,resource_id,tipo,inicio_utc,fim_utc,ativo,updated_utc) values
('ca100000-0000-0000-0000-000000000000','ca200000-0000-0000-0000-000000000001','E-A','B-A','R-A','OutOfOrder',now(),now()+interval '1 day',true,now()),
('ca100000-0000-0000-0000-000000000000','ca200000-0000-0000-0000-000000000002','E-REV','B-REV','R-REV','InternalUse',now(),now()+interval '1 day',true,now()),
('cb100000-0000-0000-0000-000000000000','cb200000-0000-0000-0000-000000000001','E-B','B-B','R-B','OutOfOrder',now(),now()+interval '1 day',true,now());

-- Privilégios mínimos por coluna; nada de acesso para tabelas inteiras.
select ok((select relrowsecurity and relforcerowsecurity from pg_class
 where oid='app.mews_checkpoint'::regclass),'checkpoint continua FORCE RLS');
select ok((select relrowsecurity and relforcerowsecurity from pg_class
 where oid='app.mews_recurso'::regclass),'recurso continua FORCE RLS');
select ok((select relrowsecurity and relforcerowsecurity from pg_class
 where oid='app.mews_bloqueio'::regclass),'bloqueio continua FORCE RLS');
select ok(has_column_privilege('hk_app','app.mews_checkpoint','versao','SELECT'),'app le versao');
select ok(not has_column_privilege('hk_app','app.mews_checkpoint','digest_incremental','SELECT'),'app nao le digest');
select ok(has_column_privilege('hk_app','app.mews_recurso','ativo','SELECT'),'app le flag de recurso');
select ok(not has_column_privilege('hk_app','app.mews_recurso','resource_id','SELECT'),'app nao le id externo de recurso');
select ok(has_column_privilege('hk_app','app.mews_bloqueio','tipo','SELECT'),'app le tipo tecnico');
select ok(not has_column_privilege('hk_app','app.mews_bloqueio','block_id','SELECT'),'app nao le id de bloqueio');
select ok(not has_table_privilege('hk_app','app.mews_checkpoint','INSERT'),'app nao insere checkpoint');
select ok(not has_table_privilege('hk_app','app.mews_checkpoint','UPDATE'),'app nao altera checkpoint');

set local role hk_app;
select from (select set_config('app.usuario_id','ca000000-0000-0000-0000-000000000001',true),
 set_config('app.tenant_id','ca100000-0000-0000-0000-000000000000',true)) ctx;
select results_eq($$select count(*)::int from app.mews_checkpoint$$,$$$values (1)$$$,
 'Admin A ve checkpoint apenas do vinculo ativo');
select results_eq($$select count(*)::int from app.mews_recurso where ativo$$,$$$values (1)$$$,
 'Admin A conta apenas recurso ativo autorizado');
select results_eq($$select count(*)::int from app.mews_bloqueio where ativo$$,$$values (1)$$,
 'Admin A conta apenas bloqueio autorizado');
select is_empty($$select 1 from app.mews_checkpoint where enterprise_id='E-REV'$$,
 'Vinculo revogado oculta checkpoint ate do Admin A');
select throws_ok($$select digest_incremental from app.mews_checkpoint$$,'42501',null,
 'Admin nao le digest do checkpoint');
select throws_ok($$select resource_id from app.mews_recurso$$,'42501',null,
 'Admin nao le resource_id');
select throws_ok($$select block_id from app.mews_bloqueio$$,'42501',null,
 'Admin nao le block_id');
select throws_ok($$update app.mews_checkpoint set versao=3$$,'42501',null,
 'Admin nao altera versao do checkpoint');

select from (select set_config('app.usuario_id','ca000000-0000-0000-0000-000000000002',true)) ctx;
select is_empty($$select 1 from app.mews_checkpoint$$,'Gerente nao ve checkpoint');
select is_empty($$select 1 from app.mews_recurso$$,'Gerente nao ve recurso');
select from (select set_config('app.usuario_id','ca000000-0000-0000-0000-000000000003',true)) ctx;
select is_empty($$select 1 from app.mews_bloqueio$$,'Proprietario nao ve bloqueio');
select from (select set_config('app.usuario_id','ca000000-0000-0000-0000-000000000004',true)) ctx;
select is_empty($$select 1 from app.mews_checkpoint$$,'Implantador vencido nao ve checkpoint');

select from (select set_config('app.usuario_id','cb000000-0000-0000-0000-000000000001',true),
 set_config('app.tenant_id','cb100000-0000-0000-0000-000000000000',true)) ctx;
select results_eq($$select count(*)::int from app.mews_checkpoint$$,$$$values (1)$$$,
 'Admin B le apenas B');
select is_empty($$select 1 from app.mews_checkpoint
 where tenant_id='ca100000-0000-0000-0000-000000000000'$$,
 'Tenant B nao le tenant A');
select from (select set_config('app.usuario_id','',true),
 set_config('app.tenant_id','',true)) ctx;
select is_empty($$select 1 from app.mews_checkpoint$$,'Sem contexto nao le checkpoint');
select is_empty($$select 1 from app.mews_bloqueio$$,'Sem contexto nao le bloqueio');
reset role;
select * from finish();
rollback;
