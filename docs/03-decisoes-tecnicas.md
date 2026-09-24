# 03 — Decisões técnicas (ADRs)

Decisões de engenharia que o código deve respeitar. Mudança em qualquer uma delas exige novo ADR, que revoga o anterior de forma explícita. As decisões de produto ficam no Registro de decisões do arquivo de contexto.

---

## ADR-001 — Supabase e Vercel como plataforma

**Status:** aprovada em 24/09/2026. Revisa a proposta de stack de 23/09/2026 (NestJS em ECS/Azure Container Apps, Keycloak/Auth0, pg-boss, Terraform).

**Decisão:** PostgreSQL, Auth e Storage no Supabase, região São Paulo. Aplicação web e API em Next.js na Vercel, funções em `gru1`. PWA do técnico como site estático na Vercel.

**Consequências:**
- Menos infraestrutura para administrar; sem Terraform no MVP. A configuração vive em `supabase/config.toml` e `vercel.json`.
- Funções serverless não rodam processos longos. Jobs viram rotas de cron curtas, idempotentes e em lotes (ADR-007).
- O conector não roda na Vercel; ele vira agente local (ADR-008).
- A dependência do Supabase Auth fica atrás de uma porta em `packages/aplicacao`, para permitir troca futura.
- **A confirmar na fase 0:** plano Vercel Pro (uso comercial e cron por minuto) e plano Supabase com SSO SAML, caso a Slaviero use Entra ID.

## ADR-002 — Data API do Supabase fechada para os dados da CSC

**Status:** aprovada.

**Decisão:** o navegador não lê nem grava tabelas da CSC via PostgREST. `anon` e `authenticated` não têm privilégio em `app`, `staging`, `licenca` e `authz`. Toda leitura e escrita passa pela API.

**Motivo:** a regra de negócio está na aplicação. Se o cliente pudesse gravar direto nas tabelas com o próprio JWT, só a RLS protegeria as regras, e isso obrigaria a colocar regra de negócio no banco.

**Consequências:** sem Realtime nas tabelas da CSC no MVP. A `service_role`/secret key é usada só para administração do Auth (convites).

## ADR-003 — Contexto por transação com papel dedicado

**Status:** aprovada.

**Decisão:** a API conecta com `csc_app` via Supavisor (modo transação) e define `app.usuario_id` e `app.tenant_id` com `set_config(…, true)` no início de cada transação. O banco valida que o usuário é membro ativo do tenant.

**Motivo:** o contexto morre com a transação, o que evita vazamento entre requisições que compartilham conexão. A validação da associação no banco impede que um tenant forjado pela aplicação dê acesso.

## ADR-004 — Escopo calculado na fonte, sem tabelas de acesso expandido

**Status:** aprovada. **Revisa** a decisão de 23/09/2026 (tabelas `acesso_hotel` e `acesso_local` preenchidas por job) e a de 24/09/2026 (`valido_ate` em `acesso_hotel` e `acesso_local`).

**Decisão:** as policies usam funções `authz.*` que leem `atribuicao_escopo`, `hotel` e `local_proprietario` diretamente. `valido_ate` fica só em `atribuicao_escopo`.

**Motivo:** uma tabela derivada precisaria ser recalculada a cada mudança de papel, de vínculo hotel → bandeira e de vigência de proprietário. Esquecer um desses casos gera acesso indevido silencioso. Calcular na fonte elimina essa classe de bug e dispensa job e trigger.

**Custo:** as funções rodam uma vez por consulta. Para dezenas de hotéis e milhares de atribuições o custo é desprezível. Reavaliar com teste de carga na fase 1c.

## ADR-005 — Banco sem regra de negócio e sem triggers

**Status:** aprovada.

**Decisão:** o banco contém estrutura, integridade referencial, invariantes de autorização e RLS. Nada de triggers. Funções só as de autorização, em lista fechada verificada por meta-teste.

**Exceções aceitas:** `licenca.uso()`, que existe para o backoffice ver agregados sem acessar tabelas de negócio (motivo de segurança, não de negócio); e defaults de `now()` em colunas de data de criação.

**Consequências:** a criação do perfil de membro acontece no fluxo de aceite do convite, na aplicação, e não por trigger em `auth.users`. `atualizado_em` é definido pela aplicação.

## ADR-006 — Auditoria e outbox pela unit of work

**Status:** aprovada.

**Decisão:** toda escrita de negócio passa por `unitOfWork.executar(ctx, fn)`, que grava auditoria (antes e depois) e evento de domínio na mesma transação.

**Risco aceito:** uma escrita feita fora da unit of work não gera auditoria. Uma trigger seria mais à prova de erro, mas contraria o ADR-005. **Mitigação:** os repositórios só expõem escrita dentro da unit of work, uma regra de lint proíbe `insertInto`/`updateTable` fora de `packages/db/src/repositorios`, e cada caso de uso tem teste que verifica o registro de auditoria.

## ADR-007 — Jobs com Vercel Cron e outbox, sem fila externa

**Status:** aprovada. **Revisa** "pg-boss" da proposta de 23/09/2026.

**Decisão:** o outbox roda a cada minuto, o monitor de SLA a cada 5 minutos e a geração de preventiva uma vez por dia. As rotas são protegidas por `CRON_SECRET`, usam `csc_worker`, processam um tenant por transação e usam `for update skip locked`.

**Consequências:** a latência de notificação é de até cerca de 1 minuto, suficiente para o MVP. Se o volume ou a latência exigirem, migrar para Supabase Queues ou para um serviço de jobs duráveis sem mudar o modelo de outbox.

## ADR-008 — Conector como agente local que envia por HTTPS

**Status:** aprovada. **Revisa** "worker separado com driver SQL Server via VPN".

**Decisão:** o agente roda na rede do cliente, lê as views do TOTVS com usuário somente leitura e envia lotes para `/api/v1/ingestao/lotes` com credencial de agente (`csc_<tenant_id>_<segredo>`, guardada só como hash). O endpoint grava em `staging` com o papel `csc_ingestao`.

**Motivo:** a Vercel não mantém VPN nem processo contínuo. O agente com saída HTTPS não exige abrir portas na rede do cliente e não carrega credencial do banco da CSC.

## ADR-009 — Kysely com tipos gerados; migrações SQL como única fonte

**Status:** aprovada. **Revisa** "Drizzle ORM".

**Decisão:** migrações em SQL no `supabase/migrations`. Tipos gerados do banco com `kysely-codegen`. Consultas com Kysely.

**Motivo:** RLS, grants por coluna e FKs compostas são escritos à mão em SQL. Com Drizzle, haveria duas fontes de schema (TypeScript e SQL) sujeitas a divergir. Com os tipos gerados do banco, a fonte é uma só.

## ADR-010 — Monorepo com lógica fora dos frameworks

**Status:** aprovada. **Revisa** "React + Vite para web e NestJS para API".

**Decisão:** `apps/web` em Next.js (telas e API), `apps/tecnico` em Vite PWA, `apps/conector` em Node. Regras em `packages/dominio`, casos de uso em `packages/aplicacao`, dados em `packages/db`, contratos em `packages/contratos`. As fronteiras são verificadas por lint.

**Motivo:** Next.js é o caminho natural na Vercel. Manter a lógica em pacotes puros preserva a possibilidade de extrair a API para outro runtime sem reescrever regras.

## ADR-011 — Campos de escopo imutáveis e sem exclusão física

**Status:** aprovada.

**Decisão:** nenhum papel da aplicação recebe UPDATE em `id`, `tenant_id` ou `hotel_id`, nem DELETE em tabela alguma. Mover um registro de escopo exige operação explícita da aplicação (novo registro e desativação do antigo). Papel e escopo de uma atribuição também são imutáveis.

**Motivo:** mudar o escopo de uma linha é o caminho mais curto para vazar dados entre hotéis. Com o GRANT por coluna, o próprio PostgreSQL recusa a operação.
