-- ============================================================================
-- Meta-testes de segurança. Protegem as regras estruturais do projeto contra
-- regressões: qualquer tabela, trigger, função ou grant novo que fure a regra
-- quebra a pipeline antes de chegar a produção.
-- ============================================================================
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(15);

-- 1. RLS habilitada e forçada em toda tabela dos schemas protegidos
select is_empty($$
  select n.nspname || '.' || c.relname
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname in ('app', 'staging', 'licenca')
    and c.relkind in ('r', 'p')
    and (not c.relrowsecurity or not c.relforcerowsecurity)
$$, 'toda tabela em app, staging e licenca tem RLS habilitada e forçada');

-- 2. Toda tabela tem tenant_id NOT NULL (exceto a própria app.tenant)
select is_empty($$
  select n.nspname || '.' || c.relname
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname in ('app', 'staging', 'licenca')
    and c.relkind in ('r', 'p')
    and not (n.nspname = 'app' and c.relname = 'tenant')
    and not exists (
      select 1 from pg_attribute a
      where a.attrelid = c.oid and a.attname = 'tenant_id'
        and a.attnotnull and not a.attisdropped
    )
$$, 'toda tabela de negócio, staging e licença tem tenant_id NOT NULL');

-- 3. Nenhuma trigger nos schemas do HubKeep
select is_empty($$
  select n.nspname || '.' || c.relname || '.' || t.tgname
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname in ('app', 'staging', 'licenca', 'authz')
    and not t.tgisinternal
$$, 'nenhuma trigger nos schemas do HubKeep');

-- 4. Papéis da aplicação sem superuser, sem BYPASSRLS e sem LOGIN no git
select is_empty($$
  select rolname from pg_roles
  where rolname in ('hk_app', 'hk_worker', 'hk_ingestao', 'hk_backoffice', 'hk_authz')
    and (rolsuper or rolbypassrls or rolcreaterole or rolcreatedb)
$$, 'papéis da aplicação sem superuser, BYPASSRLS, CREATEROLE ou CREATEDB');

-- 5. hk_authz nunca pode fazer login
select ok(
  not (select rolcanlogin from pg_roles where rolname = 'hk_authz'),
  'hk_authz não tem LOGIN'
);

-- 6. Papéis da aplicação não são donos de tabelas
select is_empty($$
  select n.nspname || '.' || c.relname
  from pg_class c
  join pg_roles r on r.oid = c.relowner
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname in ('app', 'staging', 'licenca')
    and r.rolname in ('hk_app', 'hk_worker', 'hk_ingestao', 'hk_backoffice', 'hk_authz')
$$, 'nenhum papel da aplicação é dono de tabela (FORCE RLS vale para todos)');

-- 7. anon e authenticated (Data API do Supabase) sem acesso aos schemas
select is_empty($$
  select r.rolname || ':' || s.nspname
  from pg_roles r
  cross join (select nspname from pg_namespace
              where nspname in ('app', 'staging', 'licenca', 'authz')) s
  where r.rolname in ('anon', 'authenticated')
    and has_schema_privilege(r.rolname, s.nspname, 'usage')
$$, 'anon e authenticated não têm USAGE nos schemas do HubKeep');

-- 8. Nenhuma policy para PUBLIC, anon ou authenticated
select is_empty($$
  select schemaname || '.' || tablename || '.' || policyname
  from pg_policies
  where schemaname in ('app', 'staging', 'licenca')
    and roles && array['public', 'anon', 'authenticated']::name[]
$$, 'nenhuma policy aplicada a public, anon ou authenticated');

-- 9. Nenhum DELETE concedido nos schemas do HubKeep (exclusão é lógica)
select is_empty($$
  select table_schema || '.' || table_name || ':' || grantee
  from information_schema.role_table_grants
  where table_schema in ('app', 'staging', 'licenca')
    and privilege_type in ('DELETE', 'TRUNCATE')
    and grantee like 'hk\_%'
$$, 'nenhum papel da aplicação tem DELETE ou TRUNCATE');

-- 10. Funções SECURITY DEFINER sempre com search_path fixo
select is_empty($$
  select n.nspname || '.' || p.proname
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('app', 'authz', 'licenca', 'staging')
    and p.prosecdef
    and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) cfg
                    where cfg like 'search_path=%')
$$, 'funções SECURITY DEFINER têm search_path fixo');

-- 11. Lista fechada de funções: função nova no banco exige revisão explícita.
--     Regra de negócio não entra aqui; só autorização.
select is(
  array(
    select n.nspname::text || '.' || p.proname::text
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('app', 'authz', 'licenca', 'staging')
    order by (n.nspname::text || '.' || p.proname::text) collate "C"
  ),
  array[
    'authz.eh_admin_grupo', 'authz.hoteis_com_papel', 'authz.hoteis_escrita',
    'authz.hoteis_leitura', 'authz.locais_proprietario', 'authz.membro_privilegiado',
    'authz.tenant_id', 'authz.tenant_sistema', 'authz.usuario_id', 'licenca.uso'
  ]::text[],
  'somente as funções de autorização aprovadas existem nos schemas do HubKeep'
);

-- 12. Funções de autorização não executáveis por anon ou authenticated
select is_empty($$
  select n.nspname || '.' || p.proname
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('authz', 'licenca')
    and (has_function_privilege('anon', p.oid, 'execute')
         or has_function_privilege('authenticated', p.oid, 'execute'))
$$, 'anon e authenticated não executam funções de autorização');

-- 13. hk_authz é dono das funções SECURITY DEFINER: tudo o que ele pode, as
--     policies podem. Ele só lê. A migração lhe concede CREATE por um instante,
--     para transferir a posse das funções no Supabase, e revoga em seguida; este
--     teste garante que a revogação não some numa edição futura. Vale para
--     qualquer schema e qualquer relação, inclusive privilégio herdado de PUBLIC
--     e grant por coluna (has_any_column_privilege cobre os dois casos).
--     Schemas temporários de sessão ficam de fora: não são objetos do banco.
--     Única exceção nomeada: UPDATE em pg_catalog.pg_settings, que o próprio
--     PostgreSQL concede a PUBLIC (system_views.sql). A view não guarda dado:
--     o UPDATE nela equivale a SET de parâmetro da sessão, que todo papel já faz.
select is_empty($$
  select 'CREATE em ' || n.nspname
  from pg_namespace n
  where n.nspname not like 'pg\_temp\_%' and n.nspname not like 'pg\_toast\_temp\_%'
    and has_schema_privilege('hk_authz', n.oid, 'create')
  union all
  select priv || ' em ' || n.nspname || '.' || c.relname
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  cross join (values ('INSERT'), ('UPDATE'), ('DELETE')) p(priv)
  where c.relkind in ('r', 'p', 'v', 'm', 'f')
    and n.nspname not like 'pg\_temp\_%' and n.nspname not like 'pg\_toast\_temp\_%'
    and not (n.nspname = 'pg_catalog' and c.relname = 'pg_settings' and priv = 'UPDATE')
    and case priv
          when 'DELETE' then has_table_privilege('hk_authz', c.oid, 'DELETE')
          else has_any_column_privilege('hk_authz', c.oid, priv)
        end
$$, 'hk_authz não tem CREATE em schema algum nem INSERT, UPDATE ou DELETE em relação alguma');

-- 14. Limites por papel (migração 0002). Mudar um valor é decisão revisada em
--     PR, com a justificativa no cabeçalho da migração, e este teste junto.
select results_eq(
  $$
    select r.rolname::text, r.rolconnlimit,
           array(select c from unnest(coalesce(r.rolconfig, '{}')) c order by c collate "C")
    from pg_roles r
    where r.rolname in ('hk_app', 'hk_worker', 'hk_ingestao')
    order by r.rolname collate "C"
  $$,
  $$
    values
      ('hk_app',      30, array['idle_in_transaction_session_timeout=10s', 'statement_timeout=8s']),
      ('hk_ingestao',  5, array['idle_in_transaction_session_timeout=10s', 'statement_timeout=15s']),
      ('hk_worker',    5, array['idle_in_transaction_session_timeout=15s', 'statement_timeout=30s'])
  $$,
  'hk_app, hk_worker e hk_ingestao têm connection limit, statement_timeout e idle_in_transaction definidos'
);

-- 15. Só hk_app, hk_worker e hk_ingestao recebem LOGIN (por ambiente, fora do
--     git). hk_backoffice ganha LOGIN quando o backoffice existir; hk_authz, nunca.
select is_empty($$
  select rolname from pg_roles
  where rolname in ('hk_backoffice', 'hk_authz') and rolcanlogin
$$, 'hk_backoffice e hk_authz não têm LOGIN');

select * from finish();
rollback;
