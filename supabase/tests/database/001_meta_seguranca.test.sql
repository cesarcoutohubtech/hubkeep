-- ============================================================================
-- Meta-testes de segurança. Protegem as regras estruturais do projeto contra
-- regressões: qualquer tabela, trigger, função ou grant novo que fure a regra
-- quebra a pipeline antes de chegar a produção.
-- ============================================================================
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(34);

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
    'authz.hoteis_leitura', 'authz.hoteis_proprietario', 'authz.locais_proprietario',
    'authz.membro_privilegiado',
    'authz.tenant_id', 'authz.tenant_sistema', 'authz.usuario_id', 'licenca.uso'
  ]::text[],
  'somente as funções de autorização aprovadas existem nos schemas do HubKeep'
);

-- 11b. O corpo de cada função também é fechado: mudar o que uma função de
--      autorização calcula exige ADR e a impressão (md5 do prosrc) atualizada
--      aqui no mesmo PR (regra 4). authz.locais_proprietario mudou na migração
--      0011 (ADR-031: locais dos hotéis vinculados ao proprietário);
--      authz.hoteis_proprietario entrou na 0012 (adendo ao ADR-031: hotel
--      inteiro visível ao proprietário, com ou sem locais).
select is(
  array(
    select n.nspname::text || '.' || p.proname::text || ':' || md5(p.prosrc)
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('app', 'authz', 'licenca', 'staging')
    order by (n.nspname::text || '.' || p.proname::text) collate "C"
  ),
  array[
    'authz.eh_admin_grupo:fb7e38bca20953a574c9058dc4b13f1d',
    'authz.hoteis_com_papel:a124350b101993fe7019ac0b3dd23248',
    'authz.hoteis_escrita:e5e2e4e572738251e60b87872364034f',
    'authz.hoteis_leitura:35b1e215481eb99c7b2f01ed503fdbcc',
    'authz.hoteis_proprietario:6cc95453cb18e2894fbb445952afb706',
    'authz.locais_proprietario:4dd32f437195d692fa3fc0b3f4b2474b',
    'authz.membro_privilegiado:d0f3166ae8d59adbb9ff0d9f1364f4f1',
    'authz.tenant_id:8c1f2279c07d6f5c86f4648182d93f29',
    'authz.tenant_sistema:45fc9046e9d6e9c2ecdcc4f6448fe67f',
    'authz.usuario_id:0b65b0c38489aa104f516c29eb7fe115',
    'licenca.uso:1265e9c74b95beaa5100a901c0f0ca9c'
  ]::text[],
  'o corpo de cada função de autorização é o aprovado (md5 do prosrc)'
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
    -- Colunas do catálogo têm collation "C"; os valores esperados, a padrão.
    -- Sem o collate explícito, o results_eq não sabe como comparar os registros.
    select r.rolname::text collate "default", r.rolconnlimit,
           array(select c collate "default" from unnest(coalesce(r.rolconfig, '{}')) c
                 order by c collate "C")
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

-- 16. Nenhum event trigger além dos do próprio Supabase. Um event trigger vale
--     para o banco inteiro (o "Enable automatic RLS" do painel cria um), então o
--     teste 3 não o pegaria. As exceções são por nome E dono: um event trigger
--     com um desses nomes criado por outro papel também quebra o teste.
select is_empty($$
  select e.evtname || ' (dono ' || pg_get_userbyid(e.evtowner) || ')'
  from pg_event_trigger e
  where (e.evtname, pg_get_userbyid(e.evtowner)) not in (
    values ('issue_graphql_placeholder', 'supabase_admin'),
           ('issue_pg_cron_access',      'supabase_admin'),
           ('issue_pg_graphql_access',   'supabase_admin'),
           ('issue_pg_net_access',       'supabase_admin'),
           ('pgrst_ddl_watch',           'supabase_admin'),
           ('pgrst_drop_watch',          'supabase_admin')
  )
$$, 'nenhum event trigger além dos do Supabase (por nome e dono)');

-- 17. Nenhuma trigger em auth.users. É o atalho clássico para criar o perfil
--     do usuário no banco (ADR-005 e ADR-014: o membro nasce na aplicação).
--     O Supabase não cria trigger nessa tabela; se um dia criar, a exceção
--     entra aqui por nome e dono da função, como no teste 16.
select is_empty($$
  select t.tgname || ' (função de ' || pg_get_userbyid(p.proowner) || ')'
  from pg_trigger t
  join pg_proc p on p.oid = t.tgfoid
  where t.tgrelid = 'auth.users'::regclass
    and not t.tgisinternal
$$, 'nenhuma trigger em auth.users');

-- 18. Campos de escopo não recebem UPDATE de nenhum papel da aplicação
--     (ADR-011): mudar o escopo de uma linha é o caminho mais curto para vazar
--     dados. column_privileges cobre grant por coluna e grant de tabela inteira.
--     Exceções nomeadas, registradas no ADR-011: app.hotel.bandeira_id, que só
--     o Admin do grupo altera (policy app_update de app.hotel), e
--     app.ativo.local_id (adendo de 28/09/2026, B3c), para mover o ativo
--     dentro do mesmo hotel: o hotel_id continua imutável, e a FK
--     (hotel_id, local_id) recusa local de outro hotel. hotel_ids é o alcance
--     do insight de rede (0038): também é escopo.
select is_empty($$
  select table_schema || '.' || table_name || '.' || column_name || ':' || grantee
  from information_schema.column_privileges
  where table_schema in ('app', 'staging', 'licenca')
    and privilege_type = 'UPDATE'
    and grantee like 'hk\_%'
    and column_name in ('id', 'tenant_id', 'hotel_id', 'local_id', 'usuario_id',
                        'proprietario_id', 'bandeira_id', 'papel', 'escopo_tipo',
                        'concedido_por', 'hotel_ids')
    and not (table_schema = 'app' and table_name = 'hotel'
             and column_name = 'bandeira_id' and grantee = 'hk_app')
    and not (table_schema = 'app' and table_name = 'ativo'
             and column_name = 'local_id' and grantee = 'hk_app')
$$, 'nenhum UPDATE em campo de escopo (exceto app.hotel.bandeira_id e app.ativo.local_id)');

-- 19. Policy que libera tudo (using/with check = true) só nas exceções
--     conhecidas: a leitura de hk_authz nas tabelas de escopo (evita recursão),
--     o backoffice no contrato de licença e nos módulos contratados (I7) e o
--     worker listando tenants. Nunca para hk_app.
select is_empty($$
  select schemaname || '.' || tablename || '.' || policyname
  from pg_policies
  where schemaname in ('app', 'staging', 'licenca')
    and (qual = 'true' or with_check = 'true')
    and (schemaname, tablename, policyname, roles::text) not in (
      values ('app',     'tenant',             'authz_leitura',     '{hk_authz}'),
             ('app',     'membro',             'authz_leitura',     '{hk_authz}'),
             ('app',     'hotel',              'authz_leitura',     '{hk_authz}'),
             ('app',     'local',              'authz_leitura',     '{hk_authz}'),
             ('app',     'local_proprietario', 'authz_leitura',     '{hk_authz}'),
             ('app',     'hotel_proprietario', 'authz_leitura',     '{hk_authz}'),
             ('app',     'atribuicao_escopo',  'authz_leitura',     '{hk_authz}'),
             ('licenca', 'contrato',           'authz_leitura',     '{hk_authz}'),
             ('licenca', 'contrato',           'backoffice_select', '{hk_backoffice}'),
             ('licenca', 'contrato',           'backoffice_insert', '{hk_backoffice}'),
             ('licenca', 'contrato',           'backoffice_update', '{hk_backoffice}'),
             ('licenca', 'modulo',             'backoffice_select', '{hk_backoffice}'),
             ('licenca', 'modulo',             'backoffice_insert', '{hk_backoffice}'),
             ('licenca', 'modulo',             'backoffice_update', '{hk_backoffice}'),
             ('app',     'tenant',             'worker_select',     '{hk_worker}')
    )
$$, 'policy com using/with check (true) só nas exceções de hk_authz, backoffice e worker em tenant');

-- 20. Nenhum privilégio de tabela ou de coluna para anon, authenticated ou
--     PUBLIC nos schemas do HubKeep. O teste 7 olha o USAGE do schema; este
--     pega o grant que ficaria pronto para quando alguém concedesse o USAGE.
select is_empty($$
  select n.nspname || '.' || c.relname || ':' ||
         coalesce(nullif(pg_get_userbyid(a.grantee), '-'), 'public') || ':' || a.privilege_type
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  cross join lateral aclexplode(c.relacl) a
  where n.nspname in ('app', 'staging', 'licenca', 'authz')
    and (a.grantee = 0 or pg_get_userbyid(a.grantee) in ('anon', 'authenticated'))
  union all
  select n.nspname || '.' || c.relname || '.' || att.attname || ':' ||
         coalesce(nullif(pg_get_userbyid(a.grantee), '-'), 'public') || ':' || a.privilege_type
  from pg_attribute att
  join pg_class c on c.oid = att.attrelid
  join pg_namespace n on n.oid = c.relnamespace
  cross join lateral aclexplode(att.attacl) a
  where n.nspname in ('app', 'staging', 'licenca', 'authz')
    and (a.grantee = 0 or pg_get_userbyid(a.grantee) in ('anon', 'authenticated'))
$$, 'nenhum grant de tabela ou coluna para anon, authenticated ou public');

-- 21. Toda FK entre tabelas do HubKeep é composta e leva tenant_id ou hotel_id
--     do lado de quem referencia: uma linha do tenant A não aponta para linha do
--     tenant B nem por engano. Exceção: a FK para a raiz app.tenant(id), que é o
--     próprio tenant da linha.
select is_empty($$
  select n.nspname || '.' || c.relname || '.' || k.conname
  from pg_constraint k
  join pg_class c on c.oid = k.conrelid
  join pg_namespace n on n.oid = c.relnamespace
  join pg_class alvo on alvo.oid = k.confrelid
  join pg_namespace na on na.oid = alvo.relnamespace
  where k.contype = 'f'
    and n.nspname in ('app', 'staging', 'licenca')
    and na.nspname in ('app', 'staging', 'licenca')
    and k.confrelid <> 'app.tenant'::regclass
    and not (
      cardinality(k.conkey) >= 2
      and exists (
        select 1 from pg_attribute a
        where a.attrelid = k.conrelid and a.attnum = any (k.conkey)
          and a.attname in ('tenant_id', 'hotel_id')
      )
    )
$$, 'toda FK entre tabelas do HubKeep é composta com tenant_id ou hotel_id');

-- 22. Nenhuma função do projeto fora dos schemas do HubKeep. O teste 11 fecha a
--     lista dentro de app, authz, licenca e staging; uma função criada em public
--     (ou em qualquer outro schema) pela migração passaria por ele. Ficam de
--     fora as funções de extensões e as dos papéis do próprio Supabase: a
--     migração roda como postgres, então é o dono que denuncia a origem.
select is_empty($$
  select n.nspname || '.' || p.proname || ' (dono ' || pg_get_userbyid(p.proowner) || ')'
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname not in ('app', 'authz', 'licenca', 'staging', 'pg_catalog', 'information_schema')
    and (pg_get_userbyid(p.proowner) = 'postgres' or pg_get_userbyid(p.proowner) like 'hk\_%')
    and not exists (
      select 1 from pg_depend d
      where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e'
    )
$$, 'nenhuma função de postgres ou hk_* fora dos schemas do HubKeep (exceto extensões)');

-- 23. Bucket de anexos existe e é privado (F0-10, ADR-024): sem URL pública,
--     20 MB por arquivo e só os tipos que a API aceita. O limite vale no
--     próprio Storage, mesmo para quem tiver uma URL de upload válida.
select results_eq(
  $$ select public, file_size_limit, allowed_mime_types
     from storage.buckets where id = 'anexos' $$,
  $$ values (false, 20971520::bigint,
       array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']::text[]) $$,
  'bucket anexos existe, é privado e limita tamanho (20 MB) e tipo'
);

-- 24. Nenhuma policy de storage.objects para anon, authenticated ou public: o
--     arquivo só sai por URL assinada emitida pela API depois da checagem de
--     escopo. Uma policy dessas abriria o bucket para a chave pública ou para
--     o JWT do usuário, sem passar pela RLS do HubKeep.
select is_empty($$
  select policyname from pg_policies
  where schemaname = 'storage' and tablename = 'objects'
    and roles && array['public', 'anon', 'authenticated']::name[]
$$, 'storage.objects sem policy para anon, authenticated ou public');

-- 25. Lista fechada de extensões (ADR-030): as do próprio Supabase, pgtap (que
--     os testes criam dentro da transação) e pg_trgm (busca por trecho).
--     Extensão nova traz funções que o teste 22 deixa passar; por isso entra
--     só por ADR, com esta lista atualizada no mesmo PR.
select is_empty($$
  select extname from pg_extension
  where extname not in (
    'plpgsql', 'pgcrypto', 'uuid-ossp', 'pg_stat_statements', 'supabase_vault',
    'pg_graphql', 'pgsodium', 'pgjwt',
    'pgtap', 'pg_trgm')
$$, 'só as extensões permitidas: as do Supabase, pgtap e pg_trgm');

-- 26. Busca sem acento (ADR-030): índice GIN de trigramas na coluna busca de
--     local, ativo e chamado (C2), com a classe de operadores de pg_trgm no schema
--     extensions (nunca em public).
--     Os nomes do catálogo têm collation "C", e os valores esperados, a
--     padrão: sem o collate explícito, a comparação falha ("could not determine
--     which collation to use").
select results_eq($$
  select c.relname::text collate "default", t.relname::text collate "default",
         a.attname::text collate "default", n.nspname::text collate "default"
  from pg_index i
  join pg_class c on c.oid = i.indexrelid
  join pg_class t on t.oid = i.indrelid
  join pg_attribute a on a.attrelid = i.indrelid and a.attnum = i.indkey[0]
  join pg_opclass o on o.oid = i.indclass[0]
  join pg_namespace n on n.oid = o.opcnamespace
  where o.opcname = 'gin_trgm_ops'
  order by 1
$$, $$ values ('ativo_busca_trgm_idx', 'ativo', 'busca', 'extensions'),
              ('chamado_busca_trgm_idx', 'chamado', 'busca', 'extensions'),
              ('local_busca_trgm_idx', 'local', 'busca', 'extensions') $$,
  'índices de trigramas só em busca de local, ativo e chamado, com pg_trgm em extensions');

-- 27. Nenhum ciclo entre policies (0024). O Postgres recusa, ao reescrever a
--     consulta, a policy que chega de volta à própria tabela, direto ou por
--     outras (42P17, "infinite recursion detected in policy"), e a recusa vale
--     para toda consulta daquele comando à tabela, de qualquer papel. A 0023
--     criou um ciclo (o UPDATE do chamado lê a OS; a leitura da OS lia o
--     chamado) que só aparecia no primeiro UPDATE do chamado. A aresta vai da
--     tabela da policy a cada tabela dos schemas do HubKeep citada no using ou
--     no with check; o pg_get_expr qualifica o nome com o schema, que está
--     fora do search_path. O primeiro teste prova que o grafo enxerga arestas.
create temporary table aresta_de_policy on commit drop as
  select distinct p.polrelid as de, r.oid as para
  from pg_policy p
  join pg_class t on t.oid = p.polrelid
  join pg_namespace tn on tn.oid = t.relnamespace
  cross join lateral regexp_matches(
    coalesce(pg_get_expr(p.polqual, p.polrelid), '') || ' ' ||
      coalesce(pg_get_expr(p.polwithcheck, p.polrelid), ''),
    '(app|staging|licenca)\.([a-z_][a-z0-9_]*)', 'g') m
  join pg_namespace n on n.nspname = m[1]
  join pg_class r on r.relnamespace = n.oid and r.relname = m[2] and r.relkind in ('r', 'p')
  where tn.nspname in ('app', 'staging', 'licenca');
select ok(
  exists (select 1 from aresta_de_policy
          where de = 'app.chamado'::regclass and para = 'app.os'::regclass),
  'o grafo de policies enxerga a aresta chamado → os (UPDATE do Técnico responsável)');
select is_empty($$
  with recursive caminho (origem, atual, passos) as (
    select de, para, 1 from aresta_de_policy
    union
    select c.origem, a.para, c.passos + 1
    from caminho c join aresta_de_policy a on a.de = c.atual
    where c.passos < 20
  )
  select distinct origem::regclass::text from caminho where origem = atual
$$, 'nenhuma policy chega de volta à própria tabela');

-- 28. Lista fechada de tabelas (B1 do docs/11). Os testes 1 e 2 pegam a
--     tabela sem RLS ou sem tenant_id, mas não a tabela nova sem os casos de
--     isolamento. Tabela nova entra aqui no mesmo PR que traz o pgTAP de
--     isolamento dela ("Modelo para tabela nova", docs/02); o revisor confere
--     os dois juntos.
select is(
  (select array_agg(n.nspname || '.' || c.relname order by n.nspname || '.' || c.relname)
   from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname in ('app', 'staging', 'licenca') and c.relkind in ('r', 'p')),
  array[
    'app.anexo', 'app.ativo', 'app.ativo_movimentacao', 'app.atribuicao_escopo',
    'app.auditoria', 'app.bandeira', 'app.categoria_ativo', 'app.chamado', 'app.checklist_modelo',
    'app.codigo_manutencao', 'app.equipe',
    'app.equipe_membro', 'app.evento_dominio', 'app.feriado_hotel', 'app.fornecedor', 'app.hotel', 'app.hotel_proprietario',
    'app.insight', 'app.local', 'app.local_proprietario', 'app.membro', 'app.metrica_ativo_diaria',
    'app.operacao_offline', 'app.os',
    'app.os_apontamento', 'app.os_checklist', 'app.os_material', 'app.os_transicao', 'app.parada_ativo', 'app.politica',
    'app.preferencia_membro', 'app.prioridade', 'app.proprietario', 'app.situacao',
    'app.tenant', 'app.uh_indisponivel', 'licenca.contrato', 'licenca.modulo', 'staging.carga', 'staging.credencial_agente',
    'staging.registro_externo'
  ]::text[],
  'lista fechada de tabelas: tabela nova entra aqui com os casos de isolamento dela');

-- 29. Toda policy do hk_app amarra o tenant do contexto (B1 do docs/11). O
--     teste 19 pega o true literal, mas não a condição sempre verdadeira nem a
--     policy que esquece o tenant e confia só no hotel ou no usuário.
select is_empty($$
  select schemaname || '.' || tablename || '.' || policyname
  from pg_policies
  where schemaname in ('app', 'staging', 'licenca')
    and 'hk_app' = any (roles)
    and position('authz.tenant_id()' in coalesce(qual, '') || ' ' || coalesce(with_check, '')) = 0
$$, 'toda policy do hk_app usa authz.tenant_id()');

-- 30. O destino da FK também leva tenant_id ou hotel_id (B8 do docs/11). O
--     teste 21 confere as colunas de quem referencia; uma FK (tenant_id, x)
--     apontando para (id, y) passaria por ele sem amarrar o tenant do outro lado.
select is_empty($$
  select n.nspname || '.' || c.relname || '.' || k.conname
  from pg_constraint k
  join pg_class c on c.oid = k.conrelid
  join pg_namespace n on n.oid = c.relnamespace
  join pg_class alvo on alvo.oid = k.confrelid
  join pg_namespace na on na.oid = alvo.relnamespace
  where k.contype = 'f'
    and n.nspname in ('app', 'staging', 'licenca')
    and na.nspname in ('app', 'staging', 'licenca')
    and k.confrelid <> 'app.tenant'::regclass
    and not exists (
      select 1 from pg_attribute a
      where a.attrelid = k.confrelid and a.attnum = any (k.confkey)
        and a.attname in ('tenant_id', 'hotel_id')
    )
$$, 'toda FK entre tabelas do HubKeep aponta para chave que leva tenant_id ou hotel_id');

-- 31. A service_role (secret key) não alcança os schemas do HubKeep (B8 do
--     docs/11; regra 5 e ADR-024): ela só serve ao Auth e ao Storage, pelo
--     auth-admin. Um GRANT USAGE a ela abriria as tabelas a quem tiver a chave.
select is_empty($$
  select nspname from pg_namespace
  where nspname in ('app', 'staging', 'licenca', 'authz')
    and has_schema_privilege('service_role', oid, 'USAGE')
$$, 'service_role sem USAGE em app, staging, licenca e authz');

-- 32. Tabelas só de inserção (I5 da 1b): o registro do que aconteceu não muda
--     depois de gravado. Nenhum papel da aplicação recebe UPDATE, de tabela
--     ou de coluna, nelas (o DELETE já é barrado pelo teste 9). Tabela nova
--     que seja histórico entra aqui.
select is_empty($$
  select r.papel || ' ' || t.tabela
  from (values ('hk_app'), ('hk_worker'), ('hk_ingestao'), ('hk_backoffice')) r(papel)
  cross join (values ('app.auditoria'), ('app.ativo_movimentacao'), ('app.metrica_ativo_diaria'),
                     ('app.os_apontamento'), ('app.os_material'), ('app.os_transicao')) t(tabela)
  where has_any_column_privilege(r.papel, t.tabela, 'UPDATE')
$$, 'nenhum UPDATE nas tabelas só de inserção (auditoria, movimentação, métrica diária, apontamento, material, transição)');

select * from finish();
rollback;
