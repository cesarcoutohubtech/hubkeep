# 02 — Segurança, multi-tenancy e RLS

O vazamento de dados entre tenants, hotéis ou proprietários é o pior bug possível deste produto. Este documento define as garantias, onde cada uma é aplicada e como manter.

## Fronteira entre banco e aplicação

| No banco (migrações) | Na aplicação (TypeScript) |
|---|---|
| Tabelas, tipos, índices | Regras de negócio: SLA, status, preventiva, prioridade |
| FK composta com `tenant_id`/`hotel_id` | Permissão de ação: quem ativa hotel, libera UH, muda status, aceita OS |
| Checks de integridade e invariantes de autorização (ex.: Implantador exige validade) | Limite de licença na ativação e na promoção de UHs |
| RLS: o que o usuário vê e em que escopo escreve | Validação de entrada (Zod) |
| Bloqueio de escalada de papel | Auditoria e outbox, pela unit of work |
| Imutabilidade de campos de escopo (GRANT por coluna) | Cálculo de indicadores |

A regra de bolso: **se a pergunta é "esta pessoa pode ver ou gravar esta linha?", é banco. Se a pergunta é "esta ação faz sentido agora?", é aplicação.**

Consequência: a RLS não impede, por exemplo, que um técnico mude o status de um chamado do próprio hotel para "aceito". Quem impede é o caso de uso. O que a RLS garante é que nenhum bug da aplicação faça esse técnico enxergar ou gravar dados de outro hotel ou tenant.

## Camadas de proteção

1. **Data API fechada.** `anon` e `authenticated` não têm USAGE em nenhum schema do HubKeep. A chave pública do Supabase no navegador só serve para autenticar.
2. **Papel sem privilégio.** A API usa `hk_app`, que não é superuser, não tem BYPASSRLS, não é dono de tabela, não tem DELETE e só faz UPDATE em colunas mutáveis.
3. **RLS forçada** em todas as tabelas, inclusive para o dono.
4. **Contexto verificado pelo banco.** `authz.tenant_id()` só retorna o tenant se o usuário for membro ativo dele. Um `app.tenant_id` forjado resulta em nenhum acesso.
5. **Falha fechada.** Sem contexto, as funções retornam nulo e todas as policies negam.
6. **Escopo calculado na fonte.** `authz.hoteis_com_papel()` lê `atribuicao_escopo` e `hotel` a cada consulta. Não existe tabela derivada de acesso que possa ficar desatualizada; revogação e vencimento valem na hora.
7. **Integridade entre tenants.** FKs compostas impedem que uma linha do tenant A aponte para hotel, local ou membro do tenant B.
8. **Meta-testes** verificam as regras estruturais a cada PR.

## Contexto da sessão

A API define o contexto em toda transação, sempre com `is_local = true`, para que o valor morra no fim da transação e não vaze para a próxima requisição que reusar a conexão do pool:

```ts
// packages/db/src/contexto.ts (esboço)
export async function withContext<T>(
  ctx: { usuarioId: string; tenantId: string },
  fn: (tx: Transaction<DB>) => Promise<T>,
): Promise<T> {
  return dbApp.transaction().execute(async (tx) => {
    await sql`select set_config('app.usuario_id', ${ctx.usuarioId}, true),
                     set_config('app.tenant_id',  ${ctx.tenantId},  true)`.execute(tx);
    return fn(tx);
  });
}
```

Regras:

- O pool `hk_app` não é exportado de `packages/db`; só o acesso com contexto é. Na implementação (ADR-016), `withContext` é método do objeto devolvido por `criarAcessoBanco()`, e o esboço acima é ilustrativo.
- `usuarioId` vem exclusivamente do JWT validado no servidor, nunca do corpo da requisição.
- Conexão via Supavisor em modo transação (porta 6543), com prepared statements desligados.
- O worker usa `withSistema({ tenantId }, fn)`, com o pool `hk_worker`, uma transação por tenant.

## Funções de autorização

| Função | Retorna |
|---|---|
| `authz.usuario_id()` | Usuário da sessão |
| `authz.tenant_id()` | Tenant da sessão, só se o usuário for membro ativo |
| `authz.tenant_sistema()` | Tenant da sessão para worker e ingestão |
| `authz.hoteis_com_papel(papeis)` | Hotéis em que o usuário tem algum dos papéis (grupo, bandeira ou hotel), com validade |
| `authz.hoteis_leitura()` | Hotéis com qualquer papel |
| `authz.hoteis_escrita()` | Hotéis com papel diferente de proprietário |
| `authz.locais_proprietario()` | UHs do proprietário vinculado ao usuário, com vigência |
| `authz.eh_admin_grupo()` | Se o usuário é Admin do grupo no tenant |
| `authz.membro_privilegiado(usuario)` | Se o usuário alvo é Admin ou Implantador |

Nas policies, chame sempre dentro de subconsulta, `(select authz.tenant_id())` e `hotel_id in (select authz.hoteis_leitura())`. Assim o PostgreSQL avalia a função uma vez por consulta, e não uma vez por linha.

## Regras de escalada (aplicadas na RLS)

- Só o Admin do grupo cria ou altera hotel (o `bandeira_id` define o escopo de gestores de bandeira), bandeira, proprietário e vínculo de proprietário.
- O Implantador concede papéis que não sejam Admin, Implantador ou Proprietário, só com escopo de hotel e só nos hotéis em que é Implantador.
- Ninguém altera a própria concessão de Implantador. Papel e escopo de uma concessão são imutáveis (sem GRANT de UPDATE); para mudar, revoga-se e concede-se de novo.
- `concedido_por` e `revogado_por` precisam ser o próprio usuário da sessão.
- O Implantador não altera membros que tenham papel Admin ou Implantador.

## Modelo para tabela nova

Toda tabela de negócio segue este modelo. A única tabela sem `tenant_id` é `app.tenant`, que é a raiz (exceção nomeada no meta-teste 2). Exemplo com o chamado da fase 1a:

```sql
create table app.chamado (
  id            uuid primary key,
  tenant_id     uuid not null,
  hotel_id      uuid not null,
  local_id      uuid not null,
  -- ... colunas de negócio ...
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, hotel_id) references app.hotel (tenant_id, id),
  foreign key (hotel_id, local_id)  references app.local (hotel_id, id)
);
create index chamado_hotel_idx on app.chamado (tenant_id, hotel_id);

alter table app.chamado enable row level security;
alter table app.chamado force  row level security;

grant select, insert on app.chamado to hk_app;
grant update (/* só colunas mutáveis; nunca id, tenant_id, hotel_id */) on app.chamado to hk_app;

create policy app_select on app.chamado for select to hk_app
  using (
    tenant_id = (select authz.tenant_id())
    and (hotel_id in (select authz.hoteis_leitura())
         or local_id in (select lp.local_id from authz.locais_proprietario() lp))
  );
create policy app_insert on app.chamado for insert to hk_app
  with check (tenant_id = (select authz.tenant_id())
              and hotel_id in (select authz.hoteis_escrita()));
create policy app_update on app.chamado for update to hk_app
  using      (tenant_id = (select authz.tenant_id()) and hotel_id in (select authz.hoteis_escrita()))
  with check (tenant_id = (select authz.tenant_id()) and hotel_id in (select authz.hoteis_escrita()));

create policy worker_select on app.chamado for select to hk_worker
  using (tenant_id = (select authz.tenant_sistema()));
```

Casos mínimos no teste de isolamento para cada tabela nova:

- Admin do tenant B não vê linhas do tenant A.
- Gerente de um hotel não vê nem grava linhas de outro hotel.
- Proprietário vê só linhas das próprias UHs e não grava.
- Implantador vencido não vê nada.
- Sem contexto, nada é visível.
- FK composta rejeita referência a hotel ou local de outro tenant.

Os casos de cada tabela ficam em `supabase/tests/database/003_isolamento_por_tabela.test.sql`, junto com os do `hk_ingestao`. Quando um caso não se aplica à tabela (sem `hotel_id`, ou sem FK para outra tabela do tenant), o motivo fica escrito no bloco dela. Tabela nova entra ali, nos seis blocos.

## Checklist de PR que mexe no banco

- [ ] Tabela nova segue o modelo acima e tem casos no teste de isolamento.
- [ ] Nenhuma trigger, nenhuma função fora da lista, nenhuma regra de negócio em SQL.
- [ ] Nenhum GRANT para `anon`, `authenticated` ou `public`; nenhum DELETE.
- [ ] UPDATE concedido só nas colunas mutáveis.
- [ ] `supabase test db` passando.
- [ ] Se mudou policy existente, teste que falhava antes e passa depois.

## Pontos a verificar no primeiro ambiente Supabase

A migração e os testes foram validados em PostgreSQL 16 local, com stubs de `auth.users`, `anon` e `authenticated`. No projeto Supabase de dev (e depois em staging e produção), confirmar:

1. Se o papel `postgres` tem BYPASSRLS. Os fixtures dos testes são inseridos como `postgres`. Se ele não tiver, criar um papel de teste com BYPASSRLS só no ambiente local.
2. Se o `grant ... to postgres` e o `alter function ... owner to hk_authz` funcionam com o `postgres` não superuser do Supabase.
3. Se o Supavisor aceita login dos papéis customizados (`hk_app.<ref_do_projeto>`) em modo transação.
4. Se os schemas do HubKeep estão fora da lista de schemas expostos em `supabase/config.toml` (seção `[api]`) e no painel.

### Resultado no Supabase local (CLI 2.116, PostgreSQL 17.6 — 24/09/2026)

Rodado antes do ADR-015, na máquina de desenvolvimento. A partir dele a conferência oficial é no `HubKeep-dev` (F0-02).

| # | Resultado |
|---|---|
| 1 | ✅ `postgres` tem BYPASSRLS (e não é superuser). Os fixtures funcionam sem papel extra. |
| 2 | ⚠️→✅ `grant ... to postgres` funciona. **`alter function ... owner to hk_authz` falhava** com `permission denied for schema authz`: sem superuser, o PostgreSQL exige que o novo dono tenha CREATE no schema da função. A migração concede CREATE a `hk_authz` só durante a transferência e revoga em seguida; conferido que nenhum `hk_*` fica com CREATE em schema algum. Virou o **meta-teste 13**: `hk_authz` sem CREATE em schema algum e sem INSERT/UPDATE/DELETE em relação alguma. |
| 3 | ⏳ Não se verifica localmente (o CLI não sobe o Supavisor com papéis customizados). Fica para a F0-03, em staging. |
| 4 | ✅ `config.toml` gerado pelo `supabase init` expõe só `public` e `graphql_public`. O painel do projeto de staging se confere na F0-03. |

`supabase test db`: 42/42, duas execuções com `supabase db reset` no meio (antes do meta-teste 13).

### Resultado no `HubKeep-dev` (PostgreSQL 17.6, sa-east-1 — 24/09/2026, F0-02)

Conferência oficial (ADR-015). Migração aplicada por `supabase db push`; consultas feitas pelo Session pooler.

| # | Resultado |
|---|---|
| 1 | ✅ `postgres`: `rolsuper = false`, `rolbypassrls = true`. |
| 2 | ✅ `db push` aplicou a fundação sem erro. As funções `SECURITY DEFINER` de `authz` e `licenca` pertencem a `hk_authz`; nenhum `hk_*` tem CREATE em schema algum. |
| 3 | ✅ (F0-03) `hk_app` conecta pelo Supavisor em modo transação (6543, usuário `hk_app.<ref>`) com senha definida por verificador SCRAM. `hk_authz` e `hk_backoffice` são barrados no próprio pooler (`EAUTHQUERY user not found`). O contexto não vaza entre transações na mesma conexão do pooler (10 rodadas), e sem contexto nada é visível, com dado presente. `pnpm db:verificar-papeis --ambiente dev`: 6/6, duas execuções. |
| 4 | ✅ `anon` e `authenticated` sem USAGE em `app`. Mais forte que o pedido: a Data API do dev não expõe schema nenhum (`db_schema` vazio na configuração do PostgREST, lida pela Management API). Com a chave pública, `GET /rest/v1/hotel` com `Accept-Profile: app` e a RPC em `authz` devolvem `503 PGRST002`, sem dado. |

Também conferido: nenhum event trigger de RLS automática no projeto, uma única migração registrada (`20260924000001`) e tabelas de `app` vazias depois dos testes (rollback).

`pnpm db:testar-dev`: **43/43** (13 meta + 30 isolamento), duas execuções.
