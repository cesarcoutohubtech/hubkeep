-- ============================================================================
-- HubKeep — Migração 0001: fundação de multi-tenancy, identidade, escopo e RLS
-- ----------------------------------------------------------------------------
-- Regras desta base (detalhe em docs/02-seguranca-multitenant-rls.md):
--   * Sem regra de negócio no banco. Aqui só existe estrutura, integridade
--     referencial e AUTORIZAÇÃO POR ESCOPO (regra 5 do projeto).
--   * Sem triggers.
--   * RLS habilitada e FORÇADA em toda tabela dos schemas app, staging e licenca.
--   * Nenhum papel da aplicação tem BYPASSRLS nem é dono de tabela.
--   * anon e authenticated (Supabase) não acessam nenhum schema do HubKeep.
--   * Campos de escopo (id, tenant_id, hotel_id) são imutáveis: o UPDATE é
--     concedido por coluna, sem esses campos.
-- ============================================================================


-- 1. Papéis de banco ---------------------------------------------------------
-- Criados sem LOGIN. LOGIN e senha são definidos por ambiente, fora do git.
--   hk_app         API e telas, sempre em nome de um usuário autenticado
--   hk_worker      jobs agendados (outbox, SLA, preventiva), um tenant por transação
--   hk_ingestao    endpoint que recebe dados do agente do TOTVS (só staging)
--   hk_backoffice  EasyGov: só licença, nunca dados de negócio
--   hk_authz       dono das funções de autorização; nunca recebe LOGIN
do $$
declare r text;
begin
  foreach r in array array['hk_app','hk_worker','hk_ingestao','hk_backoffice','hk_authz'] loop
    if not exists (select 1 from pg_roles where rolname = r) then
      execute format('create role %I nologin noinherit nobypassrls', r);
    end if;
  end loop;
end $$;

-- Necessário para transferir a posse das funções e para os testes (set role).
grant hk_app, hk_worker, hk_ingestao, hk_backoffice, hk_authz to postgres;


-- 2. Schemas ------------------------------------------------------------------
-- Nenhum destes schemas é exposto pela Data API (PostgREST) do Supabase.
create schema app;      -- tabelas de negócio
create schema authz;    -- funções de autorização usadas pelas policies
create schema staging;  -- dados recebidos de sistemas externos (TOTVS CM)
create schema licenca;  -- limite contratado; única área visível ao backoffice

revoke all on schema app, authz, staging, licenca from public;
revoke all on schema app, authz, staging, licenca from anon, authenticated;


-- 3. Tipos --------------------------------------------------------------------
create type app.papel as enum (
  'admin_grupo', 'gestor_csc', 'implantador', 'gerente_hotel',
  'tecnico', 'solicitante', 'proprietario'
);
create type app.escopo_tipo  as enum ('grupo', 'bandeira', 'hotel', 'proprietario');
create type app.hotel_status as enum ('em_implantacao', 'ativo', 'desativado');
create type app.local_tipo   as enum ('uh', 'area_comum');
create type app.local_status as enum ('ativo', 'pendente_licenca', 'inativo');


-- 4. Tabelas: identidade e hierarquia -----------------------------------------
-- IDs são gerados pela aplicação (UUID v7). O banco não gera identidade de negócio.

create table app.tenant (
  id        uuid primary key,
  nome      text not null,
  criado_em timestamptz not null default now()
);

-- Perfil do usuário DENTRO de um tenant. Um usuário do Supabase Auth pode ser
-- membro de mais de um tenant (ex.: equipe EasyGov convidada pelo cliente).
create table app.membro (
  tenant_id     uuid not null references app.tenant (id),
  usuario_id    uuid not null references auth.users (id),
  nome          text not null,
  email         text not null,
  ativo         boolean not null default true,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  primary key (tenant_id, usuario_id)
);

create table app.bandeira (
  id        uuid primary key,
  tenant_id uuid not null references app.tenant (id),
  nome      text not null,
  criado_em timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, nome)
);

create table app.hotel (
  id                 uuid primary key,
  tenant_id          uuid not null references app.tenant (id),
  bandeira_id        uuid,
  nome               text not null,
  fuso               text not null,
  status             app.hotel_status not null,
  sistema_origem     text,
  cod_externo        text,
  easytools_hotel_id text,
  criado_em          timestamptz not null default now(),
  atualizado_em      timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, sistema_origem, cod_externo),
  foreign key (tenant_id, bandeira_id) references app.bandeira (tenant_id, id)
);
create index hotel_bandeira_idx on app.hotel (tenant_id, bandeira_id);

create table app.local (
  id            uuid primary key,
  tenant_id     uuid not null,
  hotel_id      uuid not null,
  tipo          app.local_tipo not null,
  nome          text not null,
  andar         text,
  status        app.local_status not null,
  cod_externo   text,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (tenant_id, id),
  unique (hotel_id, id),
  unique (hotel_id, cod_externo),
  foreign key (tenant_id, hotel_id) references app.hotel (tenant_id, id)
);
create index local_hotel_idx on app.local (tenant_id, hotel_id);

create table app.proprietario (
  id        uuid primary key,
  tenant_id uuid not null references app.tenant (id),
  nome      text not null,
  documento text,
  criado_em timestamptz not null default now(),
  unique (tenant_id, id)
);

create table app.local_proprietario (
  id              uuid primary key,
  tenant_id       uuid not null,
  proprietario_id uuid not null,
  local_id        uuid not null,
  vigencia_inicio date not null,
  vigencia_fim    date,
  foreign key (tenant_id, proprietario_id) references app.proprietario (tenant_id, id),
  foreign key (tenant_id, local_id)        references app.local (tenant_id, id),
  constraint vigencia_valida check (vigencia_fim is null or vigencia_fim >= vigencia_inicio)
);
create index local_proprietario_idx on app.local_proprietario (tenant_id, proprietario_id);

-- Papel do usuário em um escopo. Uma coluna com FK por tipo de escopo, em vez
-- de escopo_id genérico: concessão entre tenants fica impossível por integridade.
create table app.atribuicao_escopo (
  id              uuid primary key,
  tenant_id       uuid not null,
  usuario_id      uuid not null,
  papel           app.papel not null,
  escopo_tipo     app.escopo_tipo not null,
  bandeira_id     uuid,
  hotel_id        uuid,
  proprietario_id uuid,
  valido_ate      timestamptz,
  concedido_por   uuid not null,
  concedido_em    timestamptz not null default now(),
  revogado_em     timestamptz,
  revogado_por    uuid,
  foreign key (tenant_id, usuario_id)      references app.membro (tenant_id, usuario_id),
  foreign key (tenant_id, concedido_por)   references app.membro (tenant_id, usuario_id),
  foreign key (tenant_id, revogado_por)    references app.membro (tenant_id, usuario_id),
  foreign key (tenant_id, bandeira_id)     references app.bandeira (tenant_id, id),
  foreign key (tenant_id, hotel_id)        references app.hotel (tenant_id, id),
  foreign key (tenant_id, proprietario_id) references app.proprietario (tenant_id, id),
  -- Invariantes de autorização (não são regras de negócio: definem o escopo).
  constraint escopo_coerente check (
       (escopo_tipo = 'grupo'        and bandeira_id is null     and hotel_id is null     and proprietario_id is null)
    or (escopo_tipo = 'bandeira'     and bandeira_id is not null and hotel_id is null     and proprietario_id is null)
    or (escopo_tipo = 'hotel'        and hotel_id is not null    and bandeira_id is null  and proprietario_id is null)
    or (escopo_tipo = 'proprietario' and proprietario_id is not null and bandeira_id is null and hotel_id is null)
  ),
  constraint proprietario_so_em_escopo_proprietario_ou_hotel check (
    papel <> 'proprietario' or escopo_tipo in ('proprietario', 'hotel')
  ),
  constraint escopo_proprietario_so_para_proprietario check (
    escopo_tipo <> 'proprietario' or papel = 'proprietario'
  ),
  constraint implantador_por_hotel_com_validade check (
    papel <> 'implantador' or (escopo_tipo = 'hotel' and valido_ate is not null)
  ),
  constraint revogacao_consistente check ((revogado_em is null) = (revogado_por is null))
);
create index atribuicao_usuario_idx on app.atribuicao_escopo (tenant_id, usuario_id)
  where revogado_em is null;


-- 5. Tabelas: auditoria e fila de eventos (outbox) -----------------------------
-- Escritas pela aplicação na MESMA transação da mudança (unit of work).
create table app.auditoria (
  id          uuid primary key,
  tenant_id   uuid not null references app.tenant (id),
  hotel_id    uuid,
  entidade    text not null,
  registro_id uuid not null,
  acao        text not null,
  antes       jsonb,
  depois      jsonb,
  usuario_id  uuid,               -- nulo quando a origem é um job do sistema
  em          timestamptz not null default now(),
  foreign key (tenant_id, hotel_id) references app.hotel (tenant_id, id)
);
create index auditoria_registro_idx on app.auditoria (tenant_id, entidade, registro_id);

create table app.evento_dominio (
  id            uuid primary key,
  tenant_id     uuid not null references app.tenant (id),
  tipo          text not null,
  entidade      text not null,
  registro_id   uuid not null,
  payload       jsonb not null,
  criado_em     timestamptz not null default now(),
  disponivel_em timestamptz not null default now(),
  processado_em timestamptz,
  tentativas    integer not null default 0,
  erro          text
);
create index evento_pendente_idx on app.evento_dominio (tenant_id, disponivel_em)
  where processado_em is null;


-- 6. Tabelas: staging do conector ---------------------------------------------
-- Contrato genérico de adaptador: cada sistema hoteleiro grava aqui, sem limite
-- de licença. A promoção para app.local é feita por job da aplicação.
create table staging.credencial_agente (
  id            uuid primary key,
  tenant_id     uuid not null references app.tenant (id),
  descricao     text not null,
  hash_segredo  text not null,
  criado_em     timestamptz not null default now(),
  revogado_em   timestamptz
);

create table staging.carga (
  id            uuid primary key,
  tenant_id     uuid not null references app.tenant (id),
  fonte         text not null,          -- ex.: 'totvs_cm'
  entidade      text not null,          -- ex.: 'hotel', 'uh', 'status_uh'
  lote_hash     text not null,
  iniciada_em   timestamptz not null default now(),
  finalizada_em timestamptz,
  linhas        integer,
  erro          text,
  unique (tenant_id, fonte, entidade, lote_hash)
);

create table staging.registro_externo (
  tenant_id   uuid not null references app.tenant (id),
  fonte       text not null,
  entidade    text not null,
  chave       text not null,            -- código no sistema de origem
  payload     jsonb not null,
  hash        text not null,
  recebido_em timestamptz not null default now(),
  primary key (tenant_id, fonte, entidade, chave)
);


-- 7. Tabelas: licença ---------------------------------------------------------
create table licenca.contrato (
  tenant_id     uuid primary key references app.tenant (id),
  max_hoteis    integer not null check (max_hoteis >= 0),
  max_uhs       integer not null check (max_uhs >= 0),
  atualizado_em timestamptz not null default now(),
  atualizado_por text not null
);


-- 8. Funções de autorização ---------------------------------------------------
-- Única lógica permitida no banco: quem vê e em que escopo escreve.
-- Todas com search_path vazio. As SECURITY DEFINER pertencem a hk_authz,
-- que só tem SELECT nas tabelas de escopo e nenhum LOGIN.

-- Contexto da sessão, definido pela API em cada transação (set_config local).
-- Sem contexto, retornam nulo e toda policy nega acesso (falha fechada).
create function authz.usuario_id() returns uuid
language sql stable set search_path = ''
as $$ select nullif(current_setting('app.usuario_id', true), '')::uuid $$;

-- Tenant da sessão SÓ se o usuário for membro ativo dele.
-- Um app.tenant_id forjado, sem vínculo, não dá acesso a nada.
create function authz.tenant_id() returns uuid
language sql stable security definer set search_path = ''
as $$
  select m.tenant_id
  from app.membro m
  where m.usuario_id = authz.usuario_id()
    and m.tenant_id  = nullif(current_setting('app.tenant_id', true), '')::uuid
    and m.ativo
$$;

-- Tenant de processos do sistema (worker e ingestão). Só esses papéis executam.
create function authz.tenant_sistema() returns uuid
language sql stable set search_path = ''
as $$ select nullif(current_setting('app.tenant_id', true), '')::uuid $$;

-- Hotéis em que o usuário tem algum dos papéis informados (nulo = qualquer papel).
-- Calculado a partir da fonte, sem tabela derivada: não existe acesso "velho".
create function authz.hoteis_com_papel(p_papeis app.papel[] default null)
returns setof uuid
language sql stable security definer set search_path = ''
as $$
  select h.id
  from app.atribuicao_escopo a
  join app.hotel h on h.tenant_id = a.tenant_id
  where a.tenant_id  = authz.tenant_id()
    and a.usuario_id = authz.usuario_id()
    and a.revogado_em is null
    and (a.valido_ate is null or a.valido_ate > now())
    and (p_papeis is null or a.papel = any (p_papeis))
    and (
         a.escopo_tipo = 'grupo'
      or (a.escopo_tipo = 'bandeira' and h.bandeira_id = a.bandeira_id)
      or (a.escopo_tipo = 'hotel'    and h.id = a.hotel_id)
    )
$$;

-- Leitura: qualquer papel no hotel (inclui proprietário de hotel inteiro).
create function authz.hoteis_leitura() returns setof uuid
language sql stable set search_path = ''
as $$ select * from authz.hoteis_com_papel(null) $$;

-- Escrita: qualquer papel, exceto proprietário (somente leitura).
create function authz.hoteis_escrita() returns setof uuid
language sql stable set search_path = ''
as $$
  select * from authz.hoteis_com_papel(array[
    'admin_grupo', 'gestor_csc', 'implantador', 'gerente_hotel', 'tecnico', 'solicitante'
  ]::app.papel[])
$$;

-- UHs do proprietário/locador vinculado ao usuário, com vigência.
create function authz.locais_proprietario()
returns table (local_id uuid, hotel_id uuid)
language sql stable security definer set search_path = ''
as $$
  select l.id, l.hotel_id
  from app.atribuicao_escopo a
  join app.local_proprietario lp
    on lp.tenant_id = a.tenant_id and lp.proprietario_id = a.proprietario_id
  join app.local l
    on l.tenant_id = lp.tenant_id and l.id = lp.local_id
  where a.tenant_id  = authz.tenant_id()
    and a.usuario_id = authz.usuario_id()
    and a.escopo_tipo = 'proprietario'
    and a.revogado_em is null
    and (a.valido_ate is null or a.valido_ate > now())
    and lp.vigencia_inicio <= current_date
    and (lp.vigencia_fim is null or lp.vigencia_fim >= current_date)
$$;

create function authz.eh_admin_grupo() returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from app.atribuicao_escopo a
    where a.tenant_id  = authz.tenant_id()
      and a.usuario_id = authz.usuario_id()
      and a.papel = 'admin_grupo'
      and a.escopo_tipo = 'grupo'
      and a.revogado_em is null
      and (a.valido_ate is null or a.valido_ate > now())
  )
$$;

-- Usado para impedir que um Implantador altere membros com papel Admin ou Implantador.
create function authz.membro_privilegiado(p_usuario uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from app.atribuicao_escopo a
    where a.tenant_id  = authz.tenant_id()
      and a.usuario_id = p_usuario
      and a.papel in ('admin_grupo', 'implantador')
      and a.revogado_em is null
      and (a.valido_ate is null or a.valido_ate > now())
  )
$$;

-- Backoffice EasyGov: só agregados de licença. Métrica provisória de UH:
-- local do tipo 'uh' com status 'ativo' (pendência comercial em aberto).
create function licenca.uso()
returns table (
  tenant_id uuid, tenant_nome text, max_hoteis integer, max_uhs integer,
  hoteis_ativos bigint, uhs_ativas bigint
)
language sql stable security definer set search_path = ''
as $$
  select t.id, t.nome, c.max_hoteis, c.max_uhs,
         (select count(*) from app.hotel h where h.tenant_id = t.id and h.status = 'ativo'),
         (select count(*) from app.local l where l.tenant_id = t.id and l.tipo = 'uh' and l.status = 'ativo')
  from app.tenant t
  left join licenca.contrato c on c.tenant_id = t.id
$$;

-- Posse e execução
-- No Supabase o postgres não é superusuário, e o PostgreSQL só transfere a posse
-- de uma função se o novo dono tiver CREATE no schema dela. O CREATE vale só
-- durante a transferência e é revogado logo abaixo: hk_authz não cria nada.
grant create on schema authz, licenca to hk_authz;
alter function authz.tenant_id()                   owner to hk_authz;
alter function authz.hoteis_com_papel(app.papel[]) owner to hk_authz;
alter function authz.locais_proprietario()         owner to hk_authz;
alter function authz.eh_admin_grupo()              owner to hk_authz;
alter function authz.membro_privilegiado(uuid)     owner to hk_authz;
alter function licenca.uso()                       owner to hk_authz;
revoke create on schema authz, licenca from hk_authz;

revoke all on all functions in schema authz, licenca from public;

grant execute on function
  authz.usuario_id(), authz.tenant_id(), authz.hoteis_com_papel(app.papel[]),
  authz.hoteis_leitura(), authz.hoteis_escrita(), authz.locais_proprietario(),
  authz.eh_admin_grupo(), authz.membro_privilegiado(uuid)
to hk_app;

grant execute on function authz.tenant_sistema() to hk_worker, hk_ingestao;
grant execute on function licenca.uso() to hk_backoffice;
grant execute on function authz.usuario_id() to hk_authz;


-- 9. Privilégios em schemas e tabelas -----------------------------------------
grant usage on schema app     to hk_app, hk_worker, hk_authz;
grant usage on schema authz   to hk_app, hk_worker, hk_ingestao, hk_authz;
grant usage on schema staging to hk_app, hk_worker, hk_ingestao;
grant usage on schema licenca to hk_app, hk_worker, hk_backoffice, hk_authz;

-- hk_authz: somente leitura das tabelas que definem escopo
grant select on app.tenant, app.membro, app.hotel, app.local,
                app.local_proprietario, app.atribuicao_escopo, licenca.contrato
to hk_authz;

-- hk_app (sem DELETE em nenhuma tabela; UPDATE só nas colunas mutáveis)
grant select on app.tenant, app.bandeira to hk_app;
grant select, insert on app.membro, app.hotel, app.local, app.proprietario,
                       app.local_proprietario, app.atribuicao_escopo to hk_app;
grant insert (tenant_id, id, nome) on app.bandeira to hk_app;
grant update (nome) on app.bandeira to hk_app;
grant update (nome, email, ativo, atualizado_em) on app.membro to hk_app;
grant update (bandeira_id, nome, fuso, status, sistema_origem, cod_externo,
              easytools_hotel_id, atualizado_em) on app.hotel to hk_app;
grant update (tipo, nome, andar, status, cod_externo, atualizado_em) on app.local to hk_app;
grant update (nome, documento) on app.proprietario to hk_app;
grant update (vigencia_inicio, vigencia_fim) on app.local_proprietario to hk_app;
grant update (valido_ate, revogado_em, revogado_por) on app.atribuicao_escopo to hk_app;
grant select, insert on app.auditoria to hk_app;
grant insert on app.evento_dominio to hk_app;
grant select, insert on staging.credencial_agente to hk_app;
grant update (descricao, revogado_em) on staging.credencial_agente to hk_app;
grant select on staging.carga, staging.registro_externo to hk_app;
grant select on licenca.contrato to hk_app;

-- hk_worker
grant select on app.tenant, app.membro, app.bandeira, app.hotel, app.local,
                app.proprietario, app.local_proprietario, app.atribuicao_escopo to hk_worker;
grant insert on app.local to hk_worker;
grant update (tipo, nome, andar, status, cod_externo, atualizado_em) on app.local to hk_worker;
grant insert on app.auditoria to hk_worker;
-- O worker também escreve (promove UH, gera OS preventiva) e toda escrita
-- publica evento pela unit of work (ADR-006), então ele precisa inserir (ADR-013).
grant select, insert on app.evento_dominio to hk_worker;
grant update (processado_em, tentativas, erro, disponivel_em) on app.evento_dominio to hk_worker;
grant select on staging.registro_externo, staging.carga to hk_worker;
grant select on licenca.contrato to hk_worker;

-- hk_ingestao
grant select on staging.credencial_agente to hk_ingestao;
grant select, insert on staging.carga, staging.registro_externo to hk_ingestao;
grant update (finalizada_em, linhas, erro) on staging.carga to hk_ingestao;
grant update (payload, hash, recebido_em) on staging.registro_externo to hk_ingestao;

-- hk_backoffice: só o contrato de licença
grant select, insert on licenca.contrato to hk_backoffice;
grant update (max_hoteis, max_uhs, atualizado_em, atualizado_por) on licenca.contrato to hk_backoffice;


-- 10. RLS ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'app.tenant','app.membro','app.bandeira','app.hotel','app.local','app.proprietario',
    'app.local_proprietario','app.atribuicao_escopo','app.auditoria','app.evento_dominio',
    'staging.credencial_agente','staging.carga','staging.registro_externo','licenca.contrato'
  ] loop
    execute format('alter table %s enable row level security', t);
    execute format('alter table %s force row level security', t);
  end loop;
end $$;

-- hk_authz: leitura irrestrita das tabelas de escopo (evita recursão de policy).
create policy authz_leitura on app.tenant             for select to hk_authz using (true);
create policy authz_leitura on app.membro             for select to hk_authz using (true);
create policy authz_leitura on app.hotel              for select to hk_authz using (true);
create policy authz_leitura on app.local              for select to hk_authz using (true);
create policy authz_leitura on app.local_proprietario for select to hk_authz using (true);
create policy authz_leitura on app.atribuicao_escopo  for select to hk_authz using (true);
create policy authz_leitura on licenca.contrato       for select to hk_authz using (true);

-- tenant
create policy app_select on app.tenant for select to hk_app
  using (id = (select authz.tenant_id()));
create policy worker_select on app.tenant for select to hk_worker
  using (true);  -- o worker lista tenants para processar um por transação

-- membro: proprietário vê só a si mesmo; demais papéis veem os membros do tenant
create policy app_select on app.membro for select to hk_app
  using (
    tenant_id = (select authz.tenant_id())
    and (usuario_id = (select authz.usuario_id())
         or exists (select 1 from authz.hoteis_escrita()))
  );
create policy app_insert on app.membro for insert to hk_app
  with check (
    tenant_id = (select authz.tenant_id())
    and ((select authz.eh_admin_grupo())
         or (exists (select 1 from authz.hoteis_com_papel(array['implantador']::app.papel[]))
             and not authz.membro_privilegiado(usuario_id)))
  );
create policy app_update on app.membro for update to hk_app
  using (
    tenant_id = (select authz.tenant_id())
    and ((select authz.eh_admin_grupo())
         or (exists (select 1 from authz.hoteis_com_papel(array['implantador']::app.papel[]))
             and not authz.membro_privilegiado(usuario_id)))
  )
  with check (tenant_id = (select authz.tenant_id()));
create policy worker_select on app.membro for select to hk_worker
  using (tenant_id = (select authz.tenant_sistema()));

-- bandeira
create policy app_select on app.bandeira for select to hk_app
  using (tenant_id = (select authz.tenant_id()));
create policy app_insert on app.bandeira for insert to hk_app
  with check (tenant_id = (select authz.tenant_id()) and (select authz.eh_admin_grupo()));
create policy app_update on app.bandeira for update to hk_app
  using (tenant_id = (select authz.tenant_id()) and (select authz.eh_admin_grupo()))
  with check (tenant_id = (select authz.tenant_id()));
create policy worker_select on app.bandeira for select to hk_worker
  using (tenant_id = (select authz.tenant_sistema()));

-- hotel: escrita só do Admin do grupo (bandeira_id define escopo de terceiros)
create policy app_select on app.hotel for select to hk_app
  using (
    tenant_id = (select authz.tenant_id())
    and (id in (select authz.hoteis_leitura())
         or id in (select lp.hotel_id from authz.locais_proprietario() lp))
  );
create policy app_insert on app.hotel for insert to hk_app
  with check (tenant_id = (select authz.tenant_id()) and (select authz.eh_admin_grupo()));
create policy app_update on app.hotel for update to hk_app
  using (tenant_id = (select authz.tenant_id()) and (select authz.eh_admin_grupo()))
  with check (tenant_id = (select authz.tenant_id()));
create policy worker_select on app.hotel for select to hk_worker
  using (tenant_id = (select authz.tenant_sistema()));

-- local
create policy app_select on app.local for select to hk_app
  using (
    tenant_id = (select authz.tenant_id())
    and (hotel_id in (select authz.hoteis_leitura())
         or id in (select lp.local_id from authz.locais_proprietario() lp))
  );
create policy app_insert on app.local for insert to hk_app
  with check (tenant_id = (select authz.tenant_id())
              and hotel_id in (select authz.hoteis_escrita()));
create policy app_update on app.local for update to hk_app
  using (tenant_id = (select authz.tenant_id())
         and hotel_id in (select authz.hoteis_escrita()))
  with check (tenant_id = (select authz.tenant_id())
              and hotel_id in (select authz.hoteis_escrita()));
create policy worker_select on app.local for select to hk_worker
  using (tenant_id = (select authz.tenant_sistema()));
create policy worker_insert on app.local for insert to hk_worker
  with check (tenant_id = (select authz.tenant_sistema()));
create policy worker_update on app.local for update to hk_worker
  using (tenant_id = (select authz.tenant_sistema()))
  with check (tenant_id = (select authz.tenant_sistema()));

-- proprietario: dado pessoal; só o Admin do grupo lê no MVP
create policy app_select on app.proprietario for select to hk_app
  using (tenant_id = (select authz.tenant_id()) and (select authz.eh_admin_grupo()));
create policy app_insert on app.proprietario for insert to hk_app
  with check (tenant_id = (select authz.tenant_id()) and (select authz.eh_admin_grupo()));
create policy app_update on app.proprietario for update to hk_app
  using (tenant_id = (select authz.tenant_id()) and (select authz.eh_admin_grupo()))
  with check (tenant_id = (select authz.tenant_id()));
create policy worker_select on app.proprietario for select to hk_worker
  using (tenant_id = (select authz.tenant_sistema()));

-- local_proprietario
create policy app_select on app.local_proprietario for select to hk_app
  using (
    tenant_id = (select authz.tenant_id())
    and ((select authz.eh_admin_grupo())
         or local_id in (select lp.local_id from authz.locais_proprietario() lp))
  );
create policy app_insert on app.local_proprietario for insert to hk_app
  with check (tenant_id = (select authz.tenant_id()) and (select authz.eh_admin_grupo()));
create policy app_update on app.local_proprietario for update to hk_app
  using (tenant_id = (select authz.tenant_id()) and (select authz.eh_admin_grupo()))
  with check (tenant_id = (select authz.tenant_id()));
create policy worker_select on app.local_proprietario for select to hk_worker
  using (tenant_id = (select authz.tenant_sistema()));

-- atribuicao_escopo: sem escalada. O Implantador só concede papéis abaixo do
-- próprio, só nos hotéis do seu escopo, e não altera a própria concessão.
create policy app_select on app.atribuicao_escopo for select to hk_app
  using (
    tenant_id = (select authz.tenant_id())
    and ((select authz.eh_admin_grupo())
         or usuario_id = (select authz.usuario_id())
         or hotel_id in (select authz.hoteis_com_papel(array['implantador']::app.papel[])))
  );
create policy app_insert on app.atribuicao_escopo for insert to hk_app
  with check (
    tenant_id = (select authz.tenant_id())
    and concedido_por = (select authz.usuario_id())
    and ((select authz.eh_admin_grupo())
         or (papel not in ('admin_grupo', 'implantador', 'proprietario')
             and escopo_tipo = 'hotel'
             and hotel_id in (select authz.hoteis_com_papel(array['implantador']::app.papel[]))))
  );
create policy app_update on app.atribuicao_escopo for update to hk_app
  using (
    tenant_id = (select authz.tenant_id())
    and ((select authz.eh_admin_grupo())
         or hotel_id in (select authz.hoteis_com_papel(array['implantador']::app.papel[])))
  )
  with check (
    tenant_id = (select authz.tenant_id())
    and (revogado_por is null or revogado_por = (select authz.usuario_id()))
    and ((select authz.eh_admin_grupo())
         or (papel not in ('admin_grupo', 'implantador', 'proprietario')
             and escopo_tipo = 'hotel'
             and hotel_id in (select authz.hoteis_com_papel(array['implantador']::app.papel[]))))
  );
create policy worker_select on app.atribuicao_escopo for select to hk_worker
  using (tenant_id = (select authz.tenant_sistema()));

-- auditoria: sem UPDATE nem DELETE para nenhum papel
create policy app_select on app.auditoria for select to hk_app
  using (
    tenant_id = (select authz.tenant_id())
    and ((select authz.eh_admin_grupo()) or hotel_id in (select authz.hoteis_escrita()))
  );
create policy app_insert on app.auditoria for insert to hk_app
  with check (
    tenant_id = (select authz.tenant_id())
    and usuario_id = (select authz.usuario_id())
    and (hotel_id is null or hotel_id in (select authz.hoteis_escrita()))
  );
create policy worker_insert on app.auditoria for insert to hk_worker
  with check (tenant_id = (select authz.tenant_sistema()) and usuario_id is null);

-- evento_dominio: a API só publica; o worker publica (ADR-013) e consome
create policy app_insert on app.evento_dominio for insert to hk_app
  with check (tenant_id = (select authz.tenant_id()));
create policy worker_insert on app.evento_dominio for insert to hk_worker
  with check (tenant_id = (select authz.tenant_sistema()));
create policy worker_select on app.evento_dominio for select to hk_worker
  using (tenant_id = (select authz.tenant_sistema()));
create policy worker_update on app.evento_dominio for update to hk_worker
  using (tenant_id = (select authz.tenant_sistema()))
  with check (tenant_id = (select authz.tenant_sistema()));

-- staging.credencial_agente
create policy app_select on staging.credencial_agente for select to hk_app
  using (tenant_id = (select authz.tenant_id()) and (select authz.eh_admin_grupo()));
create policy app_insert on staging.credencial_agente for insert to hk_app
  with check (tenant_id = (select authz.tenant_id()) and (select authz.eh_admin_grupo()));
create policy app_update on staging.credencial_agente for update to hk_app
  using (tenant_id = (select authz.tenant_id()) and (select authz.eh_admin_grupo()))
  with check (tenant_id = (select authz.tenant_id()));
create policy ingestao_select on staging.credencial_agente for select to hk_ingestao
  using (tenant_id = (select authz.tenant_sistema()) and revogado_em is null);

-- staging.carga e staging.registro_externo
create policy app_select on staging.carga for select to hk_app
  using (tenant_id = (select authz.tenant_id()) and (select authz.eh_admin_grupo()));
create policy worker_select on staging.carga for select to hk_worker
  using (tenant_id = (select authz.tenant_sistema()));
create policy ingestao_select on staging.carga for select to hk_ingestao
  using (tenant_id = (select authz.tenant_sistema()));
create policy ingestao_insert on staging.carga for insert to hk_ingestao
  with check (tenant_id = (select authz.tenant_sistema()));
create policy ingestao_update on staging.carga for update to hk_ingestao
  using (tenant_id = (select authz.tenant_sistema()))
  with check (tenant_id = (select authz.tenant_sistema()));

create policy app_select on staging.registro_externo for select to hk_app
  using (
    tenant_id = (select authz.tenant_id())
    and ((select authz.eh_admin_grupo())
         or exists (select 1 from authz.hoteis_com_papel(array['implantador']::app.papel[])))
  );
create policy worker_select on staging.registro_externo for select to hk_worker
  using (tenant_id = (select authz.tenant_sistema()));
create policy ingestao_select on staging.registro_externo for select to hk_ingestao
  using (tenant_id = (select authz.tenant_sistema()));
create policy ingestao_insert on staging.registro_externo for insert to hk_ingestao
  with check (tenant_id = (select authz.tenant_sistema()));
create policy ingestao_update on staging.registro_externo for update to hk_ingestao
  using (tenant_id = (select authz.tenant_sistema()))
  with check (tenant_id = (select authz.tenant_sistema()));

-- licenca.contrato
create policy app_select on licenca.contrato for select to hk_app
  using (tenant_id = (select authz.tenant_id()));
create policy worker_select on licenca.contrato for select to hk_worker
  using (tenant_id = (select authz.tenant_sistema()));
create policy backoffice_select on licenca.contrato for select to hk_backoffice using (true);
create policy backoffice_insert on licenca.contrato for insert to hk_backoffice with check (true);
create policy backoffice_update on licenca.contrato for update to hk_backoffice
  using (true) with check (true);
