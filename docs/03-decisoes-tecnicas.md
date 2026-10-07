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

## ADR-002 — Data API do Supabase fechada para os dados do HubKeep

**Status:** aprovada.

**Decisão:** o navegador não lê nem grava tabelas do HubKeep via PostgREST. `anon` e `authenticated` não têm privilégio em `app`, `staging`, `licenca` e `authz`. Toda leitura e escrita passa pela API.

**Motivo:** a regra de negócio está na aplicação. Se o cliente pudesse gravar direto nas tabelas com o próprio JWT, só a RLS protegeria as regras, e isso obrigaria a colocar regra de negócio no banco.

**Consequências:** sem Realtime nas tabelas do HubKeep no MVP. A `service_role`/secret key é usada só para administração do Auth (convites).

## ADR-003 — Contexto por transação com papel dedicado

**Status:** aprovada.

**Decisão:** a API conecta com `hk_app` via Supavisor (modo transação) e define `app.usuario_id` e `app.tenant_id` com `set_config(…, true)` no início de cada transação. O banco valida que o usuário é membro ativo do tenant.

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

**Consequências:** a criação do perfil de membro acontece na aplicação, e não por trigger em `auth.users`. *(O momento — "no aceite do convite" — foi revisto pelo ADR-014: o membro nasce no convite.)* `atualizado_em` é definido pela aplicação.

## ADR-006 — Auditoria e outbox pela unit of work

**Status:** aprovada.

**Decisão:** toda escrita de negócio passa por `unitOfWork.executar(ctx, fn)`, que grava auditoria (antes e depois) e evento de domínio na mesma transação.

**Risco aceito:** uma escrita feita fora da unit of work não gera auditoria. Uma trigger seria mais à prova de erro, mas contraria o ADR-005. **Mitigação:** os repositórios só expõem escrita dentro da unit of work, uma regra de lint proíbe `insertInto`/`updateTable` fora de `packages/db/src/repositorios`, e cada caso de uso tem teste que verifica o registro de auditoria.

## ADR-007 — Jobs com Vercel Cron e outbox, sem fila externa

**Status:** aprovada. **Revisa** "pg-boss" da proposta de 23/09/2026.

**Decisão:** o outbox roda a cada minuto, o monitor de SLA a cada 5 minutos e a geração de preventiva uma vez por dia. As rotas são protegidas por `CRON_SECRET`, usam `hk_worker`, processam um tenant por transação e usam `for update skip locked`.

**Consequências:** a latência de notificação é de até cerca de 1 minuto, suficiente para o MVP. Se o volume ou a latência exigirem, migrar para Supabase Queues ou para um serviço de jobs duráveis sem mudar o modelo de outbox.

## ADR-008 — Conector como agente local que envia por HTTPS

**Status:** aprovada. **Revisa** "worker separado com driver SQL Server via VPN".

**Decisão:** o agente roda na rede do cliente, lê as views do TOTVS com usuário somente leitura e envia lotes para `/api/v1/ingestao/lotes` com credencial de agente (`hk_<tenant_id>_<segredo>`, guardada só como hash). O endpoint grava em `staging` com o papel `hk_ingestao`.

**Motivo:** a Vercel não mantém VPN nem processo contínuo. O agente com saída HTTPS não exige abrir portas na rede do cliente e não carrega credencial do banco do HubKeep.

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

**Exceção:** `app.hotel.bandeira_id` recebe UPDATE do `hk_app`, embora defina o escopo dos gestores de bandeira. Trocar um hotel de bandeira é operação de cadastro do grupo, e a RLS só a permite ao Admin do grupo (policy `app_update` de `app.hotel`; "Regras de escalada" no doc 02). Como o escopo é calculado na fonte (ADR-004), a troca vale na hora para quem ganha e para quem perde o acesso. O meta-teste 18 (UPDATE em campo de escopo, `001_meta_seguranca.test.sql`) lista esta coluna como exceção nomeada.

**Adendo de 28/09/2026 — mover ativo dentro do hotel (B3c da fase 1a, migração 0016):** aprovado por Cesar em 28/09/2026, depois do merge do #51.
- **Decisão do Cesar:** o ativo pode mudar de local só dentro do mesmo hotel, por uma ação própria de mover, restrita a quem gere o hotel (Admin do grupo, Gestor CSC, Implantador e Gerente, no escopo; o técnico cadastra e altera, mas não move), auditada e com registro de cada movimentação. Entre hotéis, continua desativar e cadastrar de novo.
- **Segunda exceção nomeada no meta-teste 18:** `app.ativo.local_id` recebe UPDATE do `hk_app`. O `hotel_id` do ativo continua imutável, e a FK composta `(hotel_id, local_id) → app.local (hotel_id, id)` faz o PostgreSQL recusar um local de outro hotel, com ou sem a checagem da aplicação.
- **Efeito no escopo:** o local decide o que o proprietário vê (ADR-031). Como o escopo é calculado na fonte (ADR-004), o dono da UH antiga deixa de ver o ativo na transação seguinte, e o da nova passa a ver.
- **Registro:** `app.ativo_movimentacao` (origem, destino, quem, quando), só com INSERT, gravada na mesma unit of work da troca, com a auditoria (`mover`) e o evento `ativo.movido`. A RLS exige que quem grava seja o usuário do contexto. Lê quem lê o hotel; o proprietário não lê no MVP (confirmado por Cesar em 28/09/2026). Pergunta para a reunião com o cliente: em condo-hotel, os equipamentos da UH podem ser do proprietário, e a saída de um deles da UH pode precisar ficar visível para ele (`docs/05`).
- **Concorrência:** a ação leva a versão vista (ADR-029).

**Nota — `app.hotel.easytools_hotel_id`:** coluna reservada para a integração futura com o EasyTools, por decisão de 24/09/2026, sem uso no MVP (nada além dos tipos gerados a lê ou grava). Veio no pacote de fundação (commit `ba6860a`, migração `20260924000001_fundacao.sql`) e foi mantida no rename do ADR-012, que deixa a integração futura com o EasyTools como está até decisão comercial própria. Não é campo de escopo: o UPDATE nela é o das demais colunas de cadastro do hotel.

## ADR-012 — Nome do produto: HubKeep, prefixo `hk_`

**Status:** aprovada por Cesar em 24/09/2026.

**Decisão:** o produto se chama **HubKeep**. O pacote de fundação chegou com o nome "Central de Manutenção EasyGov (CSC)"; os identificadores técnicos passam a:

| Antes | Depois |
|---|---|
| papéis `csc_app`, `csc_worker`, `csc_ingestao`, `csc_backoffice`, `csc_authz` | `hk_app`, `hk_worker`, `hk_ingestao`, `hk_backoffice`, `hk_authz` |
| cabeçalho `x-csc-tenant` | `x-hubkeep-tenant` |
| credencial do agente `csc_<tenant_id>_<segredo>` | `hk_<tenant_id>_<segredo>` |
| view do TOTVS `vw_csc_hoteis` | `vw_hubkeep_hoteis` |
| pacotes do monorepo | `@hubkeep/*` |

**O que não muda:** **CSC** continua sendo a equipe central de manutenção do grupo cliente ("o CSC", papel `gestor_csc`), que não é o nome do produto. As menções à EasyGov como operadora do backoffice de licença e à integração futura com o EasyTools ficam como estão até decisão comercial própria.

**Por que editar a migração em vez de criar outra:** a regra do projeto é não editar migração *aplicada em staging ou produção*, e a fundação não foi aplicada em ambiente nenhum. Uma migração de rename logo depois da primeira só deixaria ruído permanente no histórico.

## ADR-013 — O worker publica eventos no outbox

**Status:** aprovada por Cesar em 24/09/2026. Corrige uma lacuna da migração de fundação.

**Contexto:** o ADR-006 diz que toda escrita de negócio grava auditoria e evento na mesma transação. O `hk_worker` escreve (promove UH de staging para `app.local` na F0-08; gera OS preventiva na fase 1b; escala SLA na 1c), mas a fundação só lhe dava SELECT e UPDATE em `app.evento_dominio`. A primeira unit of work rodando no worker falharia com `permission denied`.

**Decisão:** `hk_worker` recebe INSERT em `app.evento_dominio`, com a policy `worker_insert` limitada a `tenant_id = authz.tenant_sistema()` — o mesmo recorte que ele já tem para ler, atualizar e gravar auditoria.

**Verificação:** dois casos novos no teste de isolamento — o worker publica no tenant que está processando e não publica em outro.

## ADR-014 — O membro nasce no convite, não no aceite

**Status:** aprovada por Cesar em 24/09/2026. Revisa a consequência do ADR-005 e o texto da F0-05 ("o aceite do convite cria o `app.membro`").

**Contexto:** a policy `app_insert` de `app.membro` exige que o usuário da sessão seja Admin do grupo ou Implantador no tenant. Quem está aceitando um convite ainda não é membro de nada — `authz.tenant_id()` devolve nulo para ele —, então o INSERT no aceite seria recusado pela RLS. Afrouxar a policy para aceitar "o próprio usuário se inserindo" abriria autoinscrição em qualquer tenant.

**Decisão:** o `app.membro` (e as atribuições iniciais) é criado **no ato do convite**, na unit of work do usuário que convida, dentro do seu contexto e sob as policies existentes. O `auth-admin` chama o convite do Supabase Auth, que cria a linha em `auth.users` na hora e devolve o id; a mesma requisição grava o membro com esse id. O aceite só estabelece a sessão do convidado no Supabase Auth — não grava nada nas tabelas do HubKeep.

**Consequências:**
- Se o convite do Auth der certo e a gravação do membro falhar, sobra um usuário do Auth sem vínculo. Ele não vê nada (falha fechada) e o reenvio do convite reaproveita o mesmo usuário; o caso de uso trata o reenvio como idempotente.
- Nenhuma policy nem grant muda.

## ADR-015 — Desenvolvimento sem Supabase local

**Status:** aprovada em 24/09/2026. Altera a tarefa F0-02 e os comandos do `CLAUDE.md`. (No pacote de fundação atualizado esta decisão era o "ADR-012"; foi renumerada porque 012 a 014 já estavam em uso neste repositório.)

**Decisão:** as máquinas da equipe não rodam o Supabase nem outro banco em Docker. O desenvolvimento usa um projeto Supabase de dev na nuvem (`HubKeep-dev`, região São Paulo, sem dados reais). O Supabase local roda só na CI, em runner descartável, onde `supabase db reset` e `supabase test db` bloqueiam o merge.

**Motivo:** espaço em disco limitado nas máquinas de desenvolvimento. O Supabase local soma alguns GB de imagens.

**Consequências:**
- O banco de dev é compartilhado. Uma migração experimental quebra o ambiente de todos, então migração só vai para o dev depois de passar na CI do PR.
- Sem rede, não há banco para desenvolver. O domínio (`packages/dominio`) continua testável offline.
- O teste de concorrência de contexto (F0-04) roda na CI, contra o Supabase local do runner.
- **Em análise:** um projeto de dev por desenvolvedor ou o branching do Supabase (um banco por PR), conforme o custo.

## ADR-016 — Acesso ao banco por fábrica, com tipos qualificados por schema

**Status:** aprovada por Cesar em 24/09/2026 (revisão do PR #5), com a guarda de papel.

**Decisão:**
- `packages/db` exporta `criarAcessoBanco({ app, worker })`, que devolve `withContext`, `withSistema`, `executar` e `executarComoSistema`. O pool e o Kysely ficam no closure da fábrica. O esboço do doc 02 mostrava um `withContext` de módulo com um `dbApp` global; a regra ("o pool não é exportado; só o acesso com contexto é") continua a mesma, só que a configuração (URL, tamanho do pool) entra pela raiz de composição de cada app em vez de uma variável de ambiente lida dentro do pacote.
- Os tipos do Kysely são gerados com os nomes **qualificados por schema** (`app.bandeira`, `staging.carga`). Assim nenhuma consulta depende do `search_path` da conexão, que o Supavisor em modo transação não garante.
- A CI de banco roda `kysely-codegen --verify` contra o banco recém-migrado: migração nova sem `pnpm db:types` quebra a CI.
- **Guarda de papel.** A fábrica é assíncrona e, antes de devolver o acesso, faz a primeira conexão de cada pool e confere `session_user` e `current_user` contra o papel esperado: `hk_app` para `withContext`/`executar`, `hk_worker` para `withSistema`/`executarComoSistema`. Também confere que o papel não é superusuário nem tem BYPASSRLS. Se algo não bate, ela fecha os pools e rejeita, sem devolver nada com que se consulte. O `session_user` pega o dono que fez `SET ROLE hk_app`: um `RESET ROLE` devolveria o acesso dele. Motivo: uma URL trocada pela do dono faria tudo "funcionar" enxergando todos os tenants, sem erro nenhum. Teste negativo na CI e no dev: a URL do `postgres` e os papéis trocados entre si são recusados.
- Escrita de negócio só em `packages/db/src/repositorios`, que recebe a unidade de trabalho (nunca a transação). `transacaoDe()` não sai pelo index, e o lint proíbe o construtor de escrita do Kysely e esse import fora dos repositórios.

**Motivo:** um singleton de módulo lendo variável de ambiente acopla o pacote ao runtime (Vercel, worker, testes) e dificulta o teste com dois pools diferentes no mesmo processo, que é justamente o que o aceite da F0-04 exige.

## ADR-017 — Identidade no servidor: JWT pelo JWKS, secret key isolada, tenants sugeridos no token

**Status:** aprovada por Cesar em 25/09/2026 (revisão do PR #7), decisão a decisão. Proposta na F0-05 e implementada no PR #6. O fluxo do convite saiu daqui para o ADR-018. Conferido antes da aprovação: o HubKeep-dev assina com ES256 (`in_use`), e o JWKS publica só essa chave, para verificação.

**Decisão:**
- **O servidor valida o access token pelas chaves públicas do projeto** (JWKS em `/auth/v1/.well-known/jwks.json`), com emissor, audiência (`authenticated`) e expiração conferidos. Só algoritmos assimétricos são aceitos (ES256/RS256): um token HS256 do segredo compartilhado legado é recusado. A sessão que o `@supabase/ssr` guarda no cookie é só de onde se tira o token; o conteúdo do cookie nunca autentica sozinho. O PWA manda o mesmo token como `Bearer`.
- **A secret key mora em `packages/auth-admin`**, que a lê da própria variável de ambiente: a raiz de composição do app não a manipula. Só `apps/web/src/servidor` pode importar o pacote (lint). Um teste varre o repositório e falha se a chave ou os marcadores dela aparecerem fora do pacote, da CI e da documentação.
- *(O fluxo do convite — portas, ordem das etapas e envio do e-mail — está no ADR-018.)*
- **O template do convite leva à rota `/auth/confirmar` com o `token_hash`**, que troca o token por sessão em cookie no servidor. O template padrão do Supabase devolve o token no fragmento da URL, que o servidor não enxerga.
- **Lista de tenants do usuário para a tela vem de `app_metadata.hk_tenants`**, gravado pelo convite (só com a secret key) e assinado no JWT. É só sugestão: a RLS de `app.membro` não permite listar tenants de que o usuário não está com contexto, e uma função `SECURITY DEFINER` para isso exigiria ADR. Quem decide o acesso continua sendo o banco.

**Consequências:** o projeto Supabase de cada ambiente precisa de chave de assinatura assimétrica (o HubKeep-dev já usa ES256) e do template de convite configurado (docs/06).

## ADR-018 — Convite: acesso gravado antes do e-mail, envio pelo worker

**Status:** aprovada por Cesar em 25/09/2026 (revisão do PR #7). Substitui, no ADR-014 e no ADR-017, a ordem "convidar pelo provedor e depois gravar o membro".

**Contexto:** na ordem anterior, o e-mail de convite saía antes de o acesso estar gravado. Se a gravação falhasse (escopo de outro tenant, conflito, queda), existia convite sem acesso, e usuário no Auth sem membro.

**Decisão:** o convite segue esta ordem (caso de uso `convidarMembro`, `packages/aplicacao`):
1. **Regra do domínio** (`podeConcederPapel`: papel, escopo, validade) antes de qualquer IO externo.
2. **Situação do pedido no contexto de quem convida** (RLS): tenant, escopo visível, membro existente. Escopo não visível ao concedente → **404, sem tocar no Auth**. Já membro → 409.
3. **Usuário no Auth sem e-mail** (`admin.createUser`, sem confirmação; `admin.createUser` nunca envia nada). Usuário que já existe é reaproveitado.
4. **Membro, atribuição, auditoria e o evento `membro.convidado`** numa só unit of work. Se falhar, o usuário **criado nesta requisição** é removido (compensação); usuário pré-existente nunca é removido.
5. **O worker envia o e-mail a partir do evento**, pela porta `EnvioDeConvite` (implementada em `packages/auth-admin`), e acrescenta o tenant ao `app_metadata`. O outbox só pega tipos que têm manipulador; falha no envio adia com backoff.

**Portas:** `ProvedorDeIdentidade` (garantir, remover, vincular tenant — nenhum método envia e-mail) e `EnvioDeConvite` substituem a `ProvedorDeConvite`. SMTP próprio entra como outro adaptador de `EnvioDeConvite`.

**Consequências:**
- O e-mail chega com a latência do worker (até ~1 min com o cron da F0-09). Até a F0-09, `processarOutboxDoTenant` existe e é testado, mas nenhuma rota de cron o chama em produção.
- Quem já tem conta ativa (membro de outro tenant) não recebe e-mail pelo adaptador do Supabase (`email_exists`): entra e vê o novo grupo. O aviso por e-mail a essa pessoa fica para o SMTP próprio.
- A compensação é provada por teste do caso de uso com portas em memória: no banco real não há falha determinística a provocar depois do passo 3.
- **Convites simultâneos para a mesma pessoa** (teste de integração na CI): um recebe 201 e o outro 409, com um só usuário no Auth, um membro, uma atribuição e um evento.
  - A chave primária de `app.membro` decide qual convite fica, e quem perde recebe o 409 do reconvite.
  - Um conflito de membro não dispara a compensação, porque o usuário é o do outro convite.
  - Se a compensação falhar, vale o erro original.
  - No Auth, a corrida volta como 500 `Database error creating new user`, não como `email_exists`. Só nesse erro, casado pelo texto da mensagem, a criação é repetida uma vez; nenhum outro erro é repetido. Se o Supabase mudar esse texto, o perdedor volta a receber 500 (falha segura).

## ADR-019 — Fronteiras de import: servidor do web, pacotes só pelo nome e Kysely só em `packages/db`

**Status:** aprovada por Cesar em 25/09/2026 (decisões sobre a auditoria da `main`). Complementa o ADR-010 e o ADR-016.

**Decisão** (verificada por lint, com os casos em `tests/fronteiras.test.ts`):
- No `apps/web`, só `src/servidor` importa `@hubkeep/db` e `@hubkeep/auth-admin`. Rota, página, componente e proxy chegam ao banco e ao Auth por ele.
- Entre pacotes e apps, o import é sempre pelo nome (`@hubkeep/...`), nunca por caminho relativo. Um caminho relativo até os fontes de outro pacote alcança o que o index não exporta (pool, Kysely, `transacaoDe`); o lint deixava passar.
- Fora de `packages/db`, ninguém importa `kysely` (nem o `sql` de SQL cru) nem executa consulta direto (`executeQuery`, `CompiledQuery`).

**Limite:** as pastas de teste (`apps/*/test`, `packages/*/test`) ficam fora dessas regras.

## ADR-020 — TLS só desligável com banco local; scripts de operação com ambientes declarados

**Status:** aprovada por Cesar em 25/09/2026 (decisões sobre a auditoria da `main`).

**Decisão:**
- `HK_BANCO_SEM_TLS=1` só é aceito quando o host da string de conexão (e o `?host=`, se houver) é `localhost`, `127.0.0.1` ou `::1`. Com qualquer outro host, a inicialização falha sem imprimir a string. A regra é a função pura `tlsDaConexao`, em `packages/db`.
- Cada script de `scripts/ops` declara no topo os ambientes em que roda (`AMBIENTES_PERMITIDOS`). Antes de qualquer conexão, a string é conferida contra o ambiente pedido:
  - `ci`: host local;
  - `dev`: a string contém o ref do `[remotes.dev]` do `supabase/config.toml`.
- Scripts que gravam fixture ou apagam dado (`verificar-papeis`, `fumaca-db` e o `testar-banco-dev`, que grava em transação com rollback) só rodam em `ci` e `dev`.
- `configurar-papeis` continua aceitando staging e produção, mas só num terminal interativo (sem TTY, recusa antes de conectar). A pessoa confirma o alvo digitando o project ref dele e digita cada senha duas vezes, sem eco; nesses ambientes não existe variável de senha. Produção ainda exige `--confirmar-producao`.

**Motivo:** o nome da variável não prova o alvo. Uma string de staging colada em `DEV_SESSION_POOLER`, ou a flag sem TLS esquecida na Vercel, faria tudo "funcionar" no banco errado ou em claro, sem erro nenhum.

**Consequência:** a repetição do aceite da F0-03 em staging (F0-12) exige liberar staging no `verificar-papeis`, com conferência equivalente pelo ref do staging.

## ADR-021 — Outbox, auditoria do grupo e contrato de licença restritos por papel

**Status:** aprovada por Cesar em 25/09/2026 (revisão do PR #18). Migração `20260925165636_rls_outbox_auditoria_contrato.sql`.

**Contexto:** os casos mínimos por tabela (`003_isolamento_por_tabela`) mostraram três policies que liberavam a qualquer membro ativo do tenant, inclusive ao proprietário (somente leitura) e ao implantador vencido: publicar em `app.evento_dominio`, gravar `app.auditoria` com `hotel_id` nulo e ler `licenca.contrato`.

**Decisão:**
- **Evento no outbox:** publicar em `app.evento_dominio` exige Admin do grupo (`authz.eh_admin_grupo()`) ou papel de escrita vigente em algum hotel (`authz.hoteis_escrita()`).
- **Auditoria sem hotel** (nível do grupo): só o Admin do grupo ou o Implantador vigente, que são quem escreve no nível do grupo (membro, papel). Auditoria com hotel continua restrita aos hotéis em que o usuário escreve. A autoauditoria de quem edita o próprio perfil ganha regra própria quando essa edição existir (fase 1a).
- **Contrato de licença:** `licenca.contrato` pelo `hk_app`, só o Admin do grupo lê: é ele quem ativa hotel e consome licença.
- **Tenant e bandeiras:** a linha de `app.tenant` e as bandeiras do tenant continuam visíveis a qualquer membro ativo, mesmo sem papel vigente. É decisão tomada: nome do grupo e das bandeiras não são dado sensível e aparecem na navegação de qualquer membro.
- O `hk_worker` e o `hk_backoffice` seguem com as policies próprias.

**Consequência:** um evento publicado por quem não pode escrever já não chega ao worker (ex.: um `membro.convidado` forjado dispararia e-mail).

## ADR-022 — Multi-idioma no MVP: catálogos ICU compartilhados e nenhum texto fixo

**Status:** aprovada por Cesar em 25/09/2026 (revisão do PR #19). Registra a decisão de o HubKeep sair multi-idioma no MVP e as adaptações obrigatórias. A escolha da biblioteca foi feita na F0-10b (item "Biblioteca ICU"), aprovada por Cesar em 26/09/2026 (revisão do PR #27).

**Contexto:** o levantamento está em `docs/referencia/i18n-levantamento.md`. Ele foi escrito sobre a stack antiga (NestJS, Keycloak/Auth0) e propõe tabela global de idioma, trigger de fuso, função com `unaccent` e tabela global de feriado, que contrariam o ADR-005 e as regras 1, 3 e 4 do `CLAUDE.md`. O conteúdo de produto continua valendo; as adaptações abaixo substituem o que ele diz de banco e de stack.

**Decisão:**
- **Idiomas:** pt-BR (idioma-fonte), en, es e fr. O formato regional (datas, números, moeda) é escolha separada do idioma, de uma lista fixa no código.
- **O que se traduz:** textos fixos das telas e mensagens padrão do sistema, status e prioridades padrão. Não se traduzem conteúdo cadastrado, nomes próprios e texto livre. E-mail, push, PDF e exportações saem em pt-BR no MVP, mas escritos no catálogo.
- **Nenhum texto de interface fixo no código** (regra 11 do `CLAUDE.md`). Tudo sai por chave de um pacote compartilhado, `@hubkeep/i18n`: catálogos JSON por idioma, sintaxe ICU, os mesmos para web, PWA e worker. O lint barra texto fixo; a CI barra chave sem pt-BR ou en e mensagem ICU inválida; há pseudo-idioma para teste.
- **API:** erros e validações saem como código e parâmetros, nunca como frase (critério de aceite da F0-07). Quem exibe traduz. A mensagem dos erros de domínio fica só para log.
- **Biblioteca ICU: FormatJS** (F0-10b, aprovada em 26/09/2026). O mesmo motor (`@formatjs/intl`) e os mesmos catálogos nos três runtimes:
  - web, Server Components: `createIntl` de `react-intl/server`, uma instância por requisição (`cache` do React);
  - web, Client Components, e PWA: `react-intl` (`IntlProvider`, `useIntl`);
  - worker (e-mail, push): `@formatjs/intl`, sem React.

  O `@hubkeep/i18n` guarda os catálogos, a lista de idiomas e de formatos regionais, a resolução do idioma e os formatadores, e expõe um tradutor sobre `@formatjs/intl`. As chaves são tipadas pelo catálogo pt-BR: chave inexistente é erro de typecheck.
- **Lint e CI dos catálogos:**
  - `eslint-plugin-formatjs` (oficial) com `no-literal-string-in-jsx` nos apps: texto fixo em JSX, `alt` ou `aria-label` derruba o lint;
  - um teste lê os catálogos JSON com `@formatjs/icu-messageformat-parser`, o mesmo parser do runtime, e reprova mensagem ICU inválida, chave sem pt-BR ou en e variável que difere entre idiomas. O lint da FormatJS valida ICU só no código, não em JSON.
- **Sem plugin no `next.config`:** as chaves são explícitas no catálogo. O plugin SWC da FormatJS, que pré-compila as mensagens, fica como otimização se o tamanho do bundle do PWA pedir.
- **Por que não next-intl:**
  - ele integra melhor com os Server Components (`getTranslations`) e já tipa as chaves. As duas vantagens se cobrem com pouco código: um auxiliar por requisição no web e a tipagem no `@hubkeep/i18n`;
  - o diferencial dele é a negociação de idioma e a rota por idioma, que o HubKeep não usa: o idioma vem do perfil (membro → hotel → tenant → navegador), sem prefixo na URL;
  - não tem lint oficial de texto fixo, que a regra 11 exige;
  - o `next-intl` 4.14 exige o plugin no `next.config` e traz binários nativos (`@swc/core`, `@parcel/watcher`) e os pacotes do extrator (`@eloqnt/*`). O `react-intl` depende só da FormatJS, em JavaScript puro;
  - no motor, empatam: o `use-intl` do next-intl também roda no PWA e no Node.
- **Versões conferidas no npm em 26/09/2026:** `react-intl` 12.1.3, `@formatjs/intl` 6.1.2, `eslint-plugin-formatjs` 8.1.0 (ESLint 9 ou 10; o repositório usa o 10); `next-intl` 4.14.7 (aceita Next 16).
- **Reversível:** os catálogos em JSON com ICU padrão servem às duas bibliotecas. Trocar custa os pontos de uso nos apps, não os catálogos.
- **Resolução do idioma:** perfil do membro → idioma padrão do hotel → do tenant → navegador (antes do login) → pt-BR.
- **Dados** (migração da F0-10b):
  - `app.tenant`: país, subdivisão, moeda e idioma padrão;
  - `app.hotel`: os mesmos, com nulo herdando do tenant; o fuso IANA já existe;
  - `app.membro`: idioma, formato regional e fuso, com nulo herdando.

**Adaptações obrigatórias à stack atual:**
- **Fuso sem trigger:** o fuso IANA é validado na aplicação (ADR-005, regra 3).
- **Busca sem `unaccent` e sem função:** a aplicação grava uma coluna normalizada (sem acento, minúscula), que é a indexada (regra 4).
- **Sem tabela global de idioma:** a lista mora no código (`@hubkeep/i18n`), e a coluna tem restrição com os valores dela (regra 1: toda tabela tem `tenant_id`). Idioma novo exige migração que amplia a restrição.
- **Feriados:** os nacionais e regionais vêm de biblioteca na aplicação; no banco ficam só os do hotel, como tabela de negócio com `tenant_id` e RLS (fase 1c).
- **Login no nosso catálogo:** o Supabase Auth não tem tela. Login, definição de senha e aceite do convite são páginas do HubKeep, traduzidas pelo catálogo. O e-mail de convite do Supabase tem template único (pt-BR) até o SMTP próprio, pela porta `EnvioDeConvite`.

**Consequências:**
- Tarefa nova na fase 0, a F0-10b, de 1 a 1,5 semana-dev pelo levantamento; ao longo da fase 1, de 2 a 3 semanas-dev de textos no catálogo.
- Toda tarefa com tela ou mensagem passa a ter "sem texto fixo" no pronto.
- O prazo do piloto e a tradução (en, es, fr) ficam nas pendências do `docs/04`.

**Atualização da F0-10b:** aprovada por Cesar em 26/09/2026, com os ajustes (a) a (d) abaixo, aplicados no PR de ajustes do ADR-022, depois do #29. A tabela separada, a autoauditoria só da própria preferência e o pseudo-idioma foram aprovados com eles.
- **Preferências do membro em tabela própria, `app.preferencia_membro`** (decisão do Cesar na F0-10b, no lugar das colunas em `app.membro`):
  - colunas: idioma, formato regional e fuso, nulos herdando;
  - FK composta para `app.membro`;
  - RLS: cada um lê e grava só a própria linha, no tenant do contexto;
  - UPDATE só nessas três colunas;
  - o worker lê as do tenant do job, para o e-mail e o push.

  Em `app.membro`, a edição pelo próprio membro abriria `ativo`, `nome` e `email`, porque a RLS não compara o valor antigo com o novo. Os campos de `app.tenant` e `app.hotel` ficam como acima.
- **Autoauditoria das preferências** (a regra própria que a migração 0003 anunciou): a policy de INSERT de `app.auditoria` passa a aceitar linha sem hotel também quando a entidade é `preferencia_membro` e o registro é o próprio usuário. Quem só lê, como o proprietário, troca o próprio idioma e audita isso, mas continua sem auditar outra coisa sem hotel e sem publicar evento. A preferência não publica evento de domínio.
- **Restrições:**
  - idioma pela lista do código, nas três colunas, com teste que compara as restrições da migração com `IDIOMAS`;
  - país (ISO 3166-1), subdivisão (ISO 3166-2, do mesmo país), moeda (ISO 4217) e formato regional (BCP 47) por formato;
  - fuso pela aplicação (`fusoValido`), com recusa de deslocamento fixo como `-03:00`.
- **Tenants que já existem:** ficam com BR, BRL e pt-BR (padrão da coluna).
- **(a) Queda de tradução por idioma:** es → pt-BR → en; fr → en → pt-BR; en → pt-BR (`QUEDA_DE_TRADUCAO`). Hoje a CI exige pt-BR e en completos.
- **(b) Antes do piloto,** a CI passa a exigir os quatro catálogos completos (pendência no `docs/04`).
- **(c) Onde o idioma é decidido na tela:**
  - com sessão e tenant, o layout resolve pelo perfil (membro → tenant), a mesma resolução de `GET /api/v1/preferencias`, e o cookie `hk_idioma` não passa por cima;
  - sem sessão (login, definir senha), valem o cookie (escolha no seletor), o `Accept-Language` e pt-BR, nessa ordem;
  - o cookie é só escolha de exibição e não autoriza nada.

  Com isso, as páginas do web passam a ser dinâmicas.
- **(d) Pseudo-idioma `en-XA`:** liberado por `HK_PSEUDO_IDIOMA=1`, só em dev e homologação. Com `VERCEL_ENV=production` fica desligado mesmo com a variável ligada, e então não aparece no seletor. Nunca é gravado no banco.

## ADR-023 — PR de zona protegida só é mergeado pelo Cesar

**Status:** aprovada por Cesar em 26/09/2026, de forma explícita, depois do merge do PR #25. Ruleset do `main` configurado por ele no mesmo dia.

**Contexto:** as regras de processo (diário da fase 0) dizem que PR de zona protegida é aberto e para, e que o merge é do Cesar. Hoje isso depende só da disciplina do Claude Code. O `gh` da máquina de trabalho está autenticado com a conta do Cesar (`cesarcoutohubtech`), então, para o GitHub, um merge feito pelo Claude é um merge do Cesar. O ruleset do `main` exige só o pgTAP e não tem bypass configurado.

**Decisão:**
- **Check `zona protegida`** (`.github/workflows/zona-protegida.yml`): falha em todo PR que altere
  - `supabase/migrations/`, `supabase/tests/` ou `supabase/config.toml`;
  - `.github/workflows/`, `eslint.config.mjs` ou `CLAUDE.md`;
  - `docs/03-decisoes-tecnicas.md` ou `.claude/`;
  - `.gitleaks.toml` ou `.github/dependabot.yml` (ADR-032);
  - `packages/auth-admin/`, o dono da secret key, e os testes que guardam a chave, o `.env.example` e as actions fixadas (`tests/secret-key-so-no-auth-admin.test.ts`, `tests/env-example.test.ts`, `tests/actions-fixadas.test.ts`), desde o B13 do `docs/11` (05/10/2026).

  PR fora dessa lista passa.
- **Ruleset do `main`**, que o Cesar configura no GitHub:
  - o check `zona protegida` passa a ser **obrigatório**;
  - o **bypass** fica só com o papel de **admin do repositório**.

  Com isso, PR de zona protegida só entra por quem usa o bypass na tela do GitHub.
- **`.claude/settings.json`**: `deny` para as formas de o Claude Code contornar a regra:
  - `gh pr merge --admin`;
  - merge pela API (`gh api .../merge`);
  - edição de ruleset ou de proteção de branch pela API;
  - `git push` direto no `main`.

**Limite:** como a conta é a mesma, o GitHub não distingue o Cesar do Claude. A barreira contra o bypass é o `deny` do Claude Code, e não o GitHub. A separação completa exige uma identidade própria para o Claude, uma conta de máquina sem papel de admin. Com ela, o bypass fica impossível pelo próprio GitHub.

**Atualização (Cesar, 26/09/2026):**
- a conta de máquina entra quando a F0-12 for retomada, perto do piloto;
- ela usa **token clássico** com `repo`, `workflow` e `read:org`. O fine-grained não serve para colaborador em repositório pessoal nem para a API de checks;
- sem `gh auth login`: o token entra só nas sessões do HubKeep, pelo `GH_TOKEN` no `.claude/settings.local.json`, que o `.gitignore` cobre;
- até lá, o `.claude/settings.json` também nega `gh auth *`.

**Consequência:** PR fora da zona protegida segue a regra do diário, com o Claude mergeando com a CI verde. PR de zona protegida fica com o check vermelho até o Cesar mergear com bypass. O vermelho é esperado e não é defeito.

## ADR-024 — Anexos no Storage: bucket privado, URL assinada pelo auth-admin e miniatura no aparelho

**Status:** aprovada por Cesar em 26/09/2026, depois do merge do PR #26, condicionada a quatro confirmações, todas feitas no código da `main` e cobertas por teste: (a) o módulo expõe só as duas funções de URL, nunca o cliente do Supabase (travado por teste no PR #28); (b) caminho vindo de registro visível pela RLS e validado contra `{tenant}/{hotel}/{entidade}/{registro}/{uuid}.{ext}`; (c) upload sem sobrescrita; (d) validade das URLs de upload e download. O limite de tipo e tamanho do bucket está no meta-teste 23.

**Contexto:** a F0-10 pede bucket privado, sem policy para `authenticated`, com URL assinada emitida pela API depois da checagem de escopo. No Supabase, sem policy para o usuário, só a secret key emite URL assinada. A regra 5 do `CLAUDE.md` e o ADR-002 restringiam a secret key ao Auth (convites).

**Decisão:**
- **Bucket `anexos` privado** (migração 0004), com 20 MB por arquivo e só JPEG, PNG, WebP e PDF. **Nenhuma policy** em `storage.objects` para `anon`, `authenticated` ou `public`, garantido pelos meta-testes 23 e 24. Sem URL assinada, nem a chave pública nem o JWT do usuário leem ou gravam.
- **A secret key também emite URL assinada do Storage**, isolada no `packages/auth-admin`, o único dono dela (regra 5 atualizada). Ela só emite URL depois de a aplicação conferir o escopo pela RLS, no `hk_app`, para um caminho calculado pela API. Não lê nem lista objetos e não toca tabela do HubKeep.
- **Caminho** `{tenant_id}/{hotel_id}/{entidade}/{registro_id}/{uuid}.{ext}`, calculado pela API. O cliente só informa o registro e o tipo.
- **Escopo:**
  - upload exige que o registro seja visível e que o hotel esteja entre os que o usuário escreve (`authz.hoteis_escrita`); o proprietário, que só lê, não anexa;
  - download confere de novo o tenant, que o hotel está entre os que o usuário lê e que o registro pertence ao hotel. Qualquer falha é 404.
- **Sem sobrescrita:** a URL de upload sai com `upsert: false`, para um caminho novo (UUID v7) a cada pedido; o Storage recusa um segundo envio para o mesmo caminho.
- **Validade:** o download vale 5 minutos; o upload, 2 horas (padrão do Supabase).
- **Verificação:** cada condição tem teste:
  - só as duas funções no `auth-admin` e na porta (`tests/secret-key-so-no-auth-admin.test.ts`);
  - bucket privado, com tipo e tamanho limitados (meta-teste 23) e sem policy (meta-teste 24);
  - no Storage real (`apps/web/test/anexos.test.ts`): escopo, sobrescrita recusada, validade gravada no token das duas URLs e recusa de tipo e de tamanho fora do limite mesmo com URL válida.
- **Miniatura gerada no aparelho**, junto da compressão que o PWA já faz, enviada como um segundo objeto no mesmo registro. A transformação de imagem do Storage continua desligada: ela exigiria plano Pro, cobra por imagem transformada e precisaria de URL assinada também para a versão transformada.

**Consequências:**
- Na fase 0, recebem anexo `hotel` e `local`; OS, chamado e ativo entram na fase 1a, com a tabela de anexos e o registro do anexo na unit of work.
- O download pelo proprietário (UH própria) fica para quando existirem anexos de OS: hoje a leitura usa `authz.hoteis_leitura`, que não inclui o proprietário por UH. Resolvido na B4 pelo download do anexo registrado (adendo abaixo).
- A CI sobe o `storage-api` para o teste de upload real.

**Adendo — registro do anexo e download do proprietário (B4, migração 0017).** Status: aprovado por Cesar em 28/09/2026, com a miniatura também no web; confirmado que o proprietário não vê os anexos do hotel, só os dos locais e ativos dele.
- **Registro na unit of work:** depois do envio, o aparelho registra o arquivo em `POST /api/v1/anexos`, com o caminho devolvido pela URL de upload e, se houver, o da miniatura. A API confere o caminho como no download: formato, tenant do contexto, registro visível no hotel do caminho e escrita nesse hotel. Depois grava `app.anexo` com auditoria (`anexo`, `criar`) e evento `anexo.registrado`. O Storage não é consultado, porque o `auth-admin` continua sem ler nem listar objetos: um registro sem arquivo só aparece como download que falha.
- **`app.anexo`:** uma coluna por entidade (`local_id`, `ativo_id`; o hotel pelo `hotel_id`), com FK composta pelo hotel. Um check exige que o caminho do arquivo e o da miniatura comecem por `{tenant}/{hotel}/{entidade}/{registro}` da própria linha, então nenhuma linha aponta para arquivo de outro tenant, de outro hotel ou de outro registro, nem com erro na aplicação. Cada caminho é registrado uma vez só (`unique`). OS e chamado entram com as tabelas deles, cada um com a sua coluna.
- **Ativo** passa a receber anexo (`ENTIDADES_COM_ANEXO`: hotel, local e ativo).
- **Download pelo anexo registrado** (`POST /api/v1/anexos/{id}/url-de-download`, arquivo ou miniatura): a RLS de `app.anexo` decide quem vê. Isso resolve a pendência do proprietário:
  - o proprietário vê os anexos dos locais dele e dos ativos que estão hoje nesses locais (o local decide, ADR-031); um ativo movido (B3c) leva os anexos junto;
  - os anexos do próprio hotel ficam fora para o proprietário, pelo mesmo critério das políticas: sem uso concreto no MVP (confirmado por Cesar).

  O download pelo caminho (F0-10) continua como estava, só para quem lê o hotel.
- **Listas:** `GET /api/v1/{hoteis|locais|ativos}/{id}/anexos`, sem o caminho, com quem enviou, se há miniatura e se o usuário pode remover.
- **Remoção lógica:** `POST /api/v1/anexos/{id}/remocao` grava `removido_em` e `removido_por`, com auditoria e evento `anexo.removido`; o arquivo fica no Storage. Pode remover quem enviou ou quem gere os locais do hotel (regra de ação no domínio); a RLS exige escrita no hotel e o usuário do contexto em `removido_por`.
- **Miniatura:** a imagem é comprimida (JPEG, lado maior de 1600 px) e ganha a miniatura (320 px) no navegador, antes do envio, pelo mesmo código no PWA e no web (`packages/imagem`, canvas, sem pacote externo nem módulo do Node, liberado pelas fronteiras só para as telas do web e o PWA). Assim a foto enviada pelo computador também aparece em miniatura no celular. PDF vai como está. A foto sem rede, na fila offline, entra com a C4.
- **Verificação:** pgTAP 015 (30 casos de isolamento, checks de caminho e remoção); `packages/db/test/anexos.test.ts`, com banco real (anexo de outro hotel dá 404, o proprietário da UH baixa a miniatura, auditoria e evento, e o banco barra sem as regras da aplicação); testes da aplicação, do PWA e do envio pelo web (`apps/web/test/enviar-anexo.test.ts`).

**Adendo — conta do kit de teste (M1 do `docs/11`).** Status: proposto em 05/10/2026, depois da conferência de conformidade da fase 1a; aguarda a aprovação do Cesar.
- **Contexto:** o kit de teste (#77, `docs/10`) cria uma conta por papel, já confirmada e com a senha de teste, para cada papel entrar direto pela tela de login, sem e-mail. Isso usa a secret key (`auth.admin.createUser` e `updateUserById`) em `criarIdentidadeDeDemonstracao`, no `packages/auth-admin`. O uso estava só no diário; a regra 5 e este ADR autorizavam a chave só para o convite e a URL assinada.
- **Decisão:** a secret key também cria e atualiza a conta de demonstração, com quatro travas:
  - **fora da Vercel:** com `VERCEL_ENV` definida (preview ou produção), a função recusa antes de criar o cliente, no `auth-admin` e de novo em `apps/web/src/servidor/demonstracao.ts`;
  - **só e-mail do domínio `.test`** (RFC 2606), que nunca é de uma pessoa: a senha de teste não sobrescreve a de uma conta de verdade;
  - **nenhuma rota usa:** só o script `pnpm demo:dados`, que confere que todas as conexões são do HubKeep-dev, e o teste dele na CI;
  - **o resto do convite segue o caso de uso de sempre:** membro, atribuição, auditoria e evento pela unit of work, no `hk_app`. A chave continua sem ler nem gravar tabela do HubKeep.
- **Regra 5 do `CLAUDE.md`:** passa a citar a conta do kit de teste, fora da Vercel.
- **Verificação:** `packages/auth-admin/test/demonstracao.test.ts` e `apps/web/test/demonstracao-fora-da-vercel.test.ts` (com `VERCEL_ENV` de preview ou produção, as duas entradas recusam antes de tocar o Supabase); `semear.test.ts` na CI; `tests/secret-key-so-no-auth-admin.test.ts`, que continua prendendo a chave ao `auth-admin`.

## ADR-025 — Sincronização offline do PWA: fila no aparelho e chave de idempotência gravada com o efeito

**Status:** aprovada por Cesar em 26/09/2026, depois do merge do #31, com os ajustes (a) a (d), aplicados no PR de ajustes do ADR-025. **Adendo de 28/09/2026 (dados guardados no aparelho, B3b da fase 1a):** aprovado por Cesar em 28/09/2026, depois do merge do #50.

**Contexto:** o `docs/01` diz que cada operação offline leva uma chave de idempotência gerada no aparelho e que a API ignora repetições, mas não diz onde a chave fica nem como a repetição é detectada. O aceite da F0-11 pede sincronizar uma operação quando a rede volta, sem duplicar. A duplicação vem de dois casos:
- a resposta se perde no caminho de volta, e o aparelho reenvia algo que o servidor já aplicou;
- dois envios da mesma operação chegam juntos (evento `online` e botão).

**Decisão:**
- **No aparelho (`apps/tecnico/src/fila`):**
  - cada operação é um registro no IndexedDB, com a chave (`crypto.randomUUID()`) criada junto com ela;
  - **(a) a operação guarda o usuário que a criou** e só é lida, mostrada e enviada na sessão dele. Se outra pessoa entrar no mesmo aparelho, as pendentes da anterior não saem com a sessão nova e ficam guardadas até a dona entrar de novo. O envio recusa, como segunda barreira, mandar operação de outro usuário com o token atual;
  - **dados de referência (adendo de 28/09/2026, B3b):** para cadastrar e alterar ativo sem rede, o aparelho guarda, num IndexedDB próprio (`hubkeep-tecnico-referencia`, `apps/tecnico/src/referencia`), separado da fila:
    - os hotéis, os locais (nome e status), as categorias de ativo (nomes e definições dos campos) e os ativos (nome, local, categoria, fabricante, modelo, número de série, campos estendidos e versão) que o usuário vê, lidos da API no escopo dele e validados pelos contratos;
    - o idioma padrão do tenant e a hora da leitura.

    É um registro por usuário, com o tenant em que foi lido: outra pessoa no aparelho, ou o mesmo usuário em outro tenant, não o enxerga. A referência é relida com sessão e rede e depois de cada envio que tirou algo da fila; sem rede, vale a guardada. Não guarda chamado, OS, anexo, proprietário, contato nem dado pessoal de hóspede;
  - **fila do dia e fotos da OS (adendo de 29/09/2026, C4b; aprovado pelo Cesar em 29/09/2026, com as condições (a), (b) e (c) abaixo):**
    - as OS do técnico e das equipes dele que ainda estão em curso (`GET /api/v1/os/do-dia`) ficam num IndexedDB próprio (`hubkeep-tecnico-os`, `apps/tecnico/src/os`). Cada OS leva o estado, a versão, o responsável e, do chamado, a descrição, o nome do local, a prioridade e o estado. É um registro por usuário e tenant, relido junto com a referência;
    - a tela mostra a guardada com as operações pendentes aplicadas por cima (`os/projecao.ts`). Cada transição sai com a versão que a OS tem no aparelho, e a projeção soma um por transição na fila. A operação que o servidor já aplicou (resposta perdida) não conta duas vezes: a versão não bate com a que a API devolveu;
    - a foto da OS sem rede vai para a **mesma fila**, como operação do aparelho (`anexo.foto`), com os bytes já preparados (foto e miniatura, como `ArrayBuffer`) e um `arquivoId` para cada arquivo. Assim ela sai na ordem, antes da conclusão tirada depois dela. No reenvio, o caminho é o mesmo. O arquivo que já está no Storage (409 `arquivo_ja_enviado` na URL, ou o PUT recusado como duplicado) e o registro repetido (409 `anexo_ja_registrado`) contam como feitos;
    - no servidor, a foto na OS passa pela regra dos registros (responsável, com a OS em execução ou pausada) na URL de upload e no registro. A recusa volta à fila como as outras;
    - **espaço do aparelho** (condições da aprovação; `apps/tecnico/src/armazenamento.ts`). O navegador pode descartar o armazenamento do site; o iOS descarta sob pressão de espaço e depois de dias sem uso. Por isso:
      - **(a) persistência e aviso:** ao entrar, o app pede armazenamento persistente (`navigator.storage.persist()`); a recusa não bloqueia nada. Com operação pendente há mais de 24 horas, a fila do dia mostra um aviso com a data da mais velha, pedindo para conectar e enviar, porque o sistema pode apagar o que está no aparelho. A recusada não conta: já voltou do servidor e aparece como recusada;
      - **(b) compressão e teto:** a foto é comprimida antes de ir para a fila (`@hubkeep/imagem`: lado maior de 1600 px em JPEG 0,8, e miniatura de 320 px em JPEG 0,7); o original não é guardado. Ela só entra se as fotos do usuário na fila (pendentes e recusadas, foto e miniatura) ficarem até 50 MB (`fotos_na_fila_no_limite`) e se sobrarem 20 MB livres depois dela pela estimativa do navegador (`navigator.storage.estimate()`, `espaco_insuficiente`). Sem a estimativa, vale só o teto; o erro de cota do IndexedDB (`QuotaExceededError`) também vira `espaco_insuficiente`. As recusas aparecem na tela da OS com o motivo do catálogo;
      - **(c) saída com aviso:** ao sair, o app tenta enviar a fila; se sobrar operação pendente (fotos inclusive), mostra quantas são e só apaga se o técnico confirmar (`podeApagar`, em `saida.ts`). Sem a confirmação, a sessão continua e nada é apagado;
  - **o que fica no aparelho, no total:** a fila de operações (IndexedDB, com as fotos da OS que ainda não subiram), os dados de referência (IndexedDB), a fila do dia (IndexedDB), o tenant ativo (`localStorage`), a sessão do Supabase Auth (guardada pelo próprio cliente do Auth) e o idioma escolhido (`localStorage`), que é do aparelho, não da pessoa;
  - **(b) ao sair, os dados locais de quem sai são apagados:** a fila (pendentes e recusadas, com as fotos), os dados de referência, a fila do dia, o tenant ativo e a sessão do Auth. O idioma fica. Se houver operação ainda não enviada, o app tenta enviar e, se sobrar alguma, pede confirmação antes de apagar. O service worker guarda só a casca, sem dado de ninguém;
  - a fila sobrevive a fechar o app e só perde a operação quando o servidor confirma, quando o técnico dispensa uma recusada ou quando ele sai.
- **Envio, uma operação por vez e na ordem em que foram feitas:**
  - a passada para na primeira que não sai, e uma operação mais nova nunca passa na frente de uma mais velha;
  - sem rede, com 5xx, 401, 408 ou 429, a operação espera: 5 s, dobrando até 5 min. A volta da rede, a abertura do app e o botão "Enviar agora" ignoram a espera;
  - **(c) recusada não some em silêncio:** 4xx de regra deixa a operação como rejeitada, com o código do motivo. Ela aparece para o técnico com o nome da operação e o motivo traduzido (`erro.<codigo>` do catálogo), até ele dispensar. Não há reenvio. Operação fora do contrato é recusada no próprio aparelho, com `entrada_invalida`;
  - duas passadas ao mesmo tempo viram uma.
- **No servidor (`POST /api/v1/sincronizacao/operacoes`):**
  - a chave é gravada em `app.operacao_offline` (migração 0006) **na mesma unit of work do efeito**;
  - reenvio de chave conhecida devolve 200 com `repetida: true` e a resposta guardada, sem aplicar de novo;
  - com dois envios simultâneos, o `INSERT ... ON CONFLICT DO NOTHING` do segundo espera o primeiro. Se o primeiro gravou, a unit of work do segundo volta inteira, com o efeito junto, e ele devolve a resposta guardada;
  - operação inválida é 422, e a chave não é guardada.
- **A chave é do usuário:** a chave primária é `(tenant_id, usuario_id, chave)`, com RLS da própria linha. A mesma chave de outro usuário não colide nem revela nada. Sem UPDATE e sem DELETE: a linha nasce com a resposta e não muda.
- **Tipos de operação:** discriminados no contrato (`PedidoDeOperacaoOffline`). A fase 0 tem um, `preferencias.gravar`, que serve de exemplo real: a troca de idioma funciona sem rede. Os da OS entram na fase 1a.
- **Service worker (`vite-plugin-pwa`, `generateSW`):**
  - guarda a casca do app: HTML, JS, CSS, ícones e manifesto;
  - a API nunca vem do cache.

  Os quatro catálogos vão no JS do build (ADR-022). Nome e descrição do manifesto e título do HTML saem do catálogo pt-BR.

**Consequências:**
- **(d) Limpeza de `app.operacao_offline`:** a tabela cresce uma linha por operação sincronizada, e nenhum papel da aplicação tem DELETE. A proposta é partição mensal, com as partições antigas descartadas por migração (`drop` ou `detach`), passada a janela em que um reenvio ainda pode chegar. Pendência no `docs/04`.
- **Conflito de edição entre pessoas** (duas pessoas mexendo na mesma OS offline) é regra de domínio da fase 1a, não da fila.
- **Instalação em Android e iOS:** exige HTTPS fora de `localhost`. A prova em aparelho fica para depois do deploy da F0-12. A F0-11 prova o que dá sem aparelho: manifesto, ícones, service worker, abertura sem rede no navegador e a sincronização.
- **API em outra origem em produção:** vai exigir CORS ou o mesmo domínio raiz, pendência já listada no `docs/04`. No dev, o Vite repassa `/api` para o web.

## ADR-026 — Políticas configuráveis, com cópia no registro que as usou

**Status:** aprovada por Cesar em 26/09/2026 (revisão do plano da fase 1a, PR #35), com as condições incorporadas abaixo.

**Contexto:** a regra 7 manda que toda exigência de cliente vire configuração ou política. Na 1a entram a prioridade padrão por categoria e o aceite automático, que fica desligado. Na 1c entram o SLA com herança grupo → bandeira → hotel e a visão individual de produtividade.

**Decisão:**
- **Tabela `app.politica`** (tenant, `escopo_tipo` grupo, bandeira ou hotel, `bandeira_id` ou `hotel_id`, chave, valor `jsonb`, vigência), com RLS e isolamento.
  - A estrutura já comporta o nível bandeira: a 1c o liga sem migração nova.
  - Na 1a, a resolução usa hotel → grupo → padrão do código.
- **Formato validado no domínio:** cada chave tem o formato do valor definido e validado em `packages/dominio`, em TypeScript puro, porque o domínio não importa Zod. O contrato da API repete o formato para o OpenAPI, e um teste compara os dois.
- **Mudança de política auditada**, pela unit of work, com antes e depois.
- **Cópia no registro:** o chamado guarda, na abertura, uma cópia da política aplicada (`politica_aplicada jsonb`: prioridade, prazos e regras usadas). Mudar a política não altera chamado já aberto. O mesmo vale para qualquer registro que use política no futuro (OS, preventiva).

**Consequências:** a resolução é regra de domínio, testada sem banco. O banco guarda só estrutura e escopo (regra 2).

**Implementação (C2, migração 0021, 29/09/2026):** sem mudar a decisão. O chamado guarda em `politica_aplicada` o que a abertura usou, por chave: para `chamado.prioridade_padrao_por_categoria`, a categoria do ativo, a prioridade escolhida e a origem (`categoria`, pela política resolvida hotel → grupo → padrão, ou `menor_peso`, quando não há regra para a categoria ou a prioridade dela está desativada). O teste de integração muda a política do hotel depois da abertura e confere que o chamado não mudou.

**Adendo — extensão por módulo e liberação no lint (06/10/2026).** Status: decidido pelo Cesar em 06/10/2026 (pontos 1 e 3 da avaliação de `docs/referencia/proposta-extensao-politicas.md`, com os ajustes do agente do núcleo); o texto deste adendo aguarda a aprovação do Cesar.
- **Registro de políticas no domínio** (`registroDePoliticas`, #106): as chaves do núcleo e as extensões de módulo.
  - Cada extensão tem um prefixo próprio (`inteligencia.`), fora dos prefixos do núcleo (`os.`, `chamado.`, `ativo.`), e registra só chaves com esse prefixo, cada uma com padrão e formato.
  - Extensão inválida lança na partida do servidor, nunca num request.
  - O domínio não conhece chave de módulo nenhuma.
- **Uma resolução só, a do registro:** hotel → bandeira → grupo → padrão, para as chaves do núcleo e as dos módulos. O módulo não tem resolução própria.
- **O valor com escopo de bandeira** continua sem entrada (o contrato aceita grupo e hotel) até a 1c, com o SLA.
- **Quem grava:** continua só o Admin do grupo, para todas as chaves.
- **Contrato:** aceita a chave de módulo como texto com prefixo; o formato do valor é conferido pelo registro, no caso de uso. A leitura da configuração devolve só as chaves do núcleo: a tela das políticas de um módulo é do módulo.
- **Módulo contratado:** o tenant sem o módulo não vê nem grava as chaves dele. O filtro entra com `licenca.modulo` (1b), e até lá a montagem do módulo não registra extensão.
- **Liberação estreita no lint** (exceção ao ADR-037, que proíbe o núcleo de importar `@hubkeep/inteligencia`): só dois trechos do `apps/web` importam o pacote.
  - A pasta do módulo no servidor, `apps/web/src/servidor/modulos/inteligencia/`, vê o que o servidor vê, menos o `auth-admin`.
  - As rotas e telas em pastas `inteligencia` do `apps/web/src/app` veem o que a rota e a página veem.
  - A composição chega à pasta do módulo só pela função `montarInteligencia` (`tests/composicao-inteligencia.test.ts`). Desligar o módulo é tirar essa chamada.
  - Os pacotes do núcleo e o resto do web continuam proibidos (`tests/fronteiras.test.ts`).

## ADR-027 — Estados canônicos no domínio; situações e prioridades configuráveis por tenant

**Status:** aprovada por Cesar em 26/09/2026 (PR #35), com a condição dos nomes em quatro idiomas.

**Decisão:**
- **Estados canônicos fixos no domínio**, porque o SLA e os indicadores dependem deles. Por exemplo: aberto, em triagem, em execução, aguardando aceite, concluído, cancelado. As transições permitidas, e quem pode fazer cada uma por papel, são regra do `packages/dominio`.
- **Situações configuráveis pelo tenant** (nome, ordem, cor), cada uma ligada a um estado canônico. A tela mostra a situação, e as regras usam o estado.
- **Prioridades do tenant** (nome, ordem, peso). As padrão nascem com o tenant.
- **Nomes em quatro idiomas:** situações e prioridades têm nome em pt-BR, en, es e fr (`nomes jsonb`, parcial) e uma `chave_padrao` do catálogo, quando a linha é uma das padrão. Na exibição vale:
  1. o nome do tenant no idioma de quem vê;
  2. o nome padrão do catálogo (`chave_padrao`) nesse idioma;
  3. o nome do tenant no idioma padrão do tenant.

**Implementação (C1, migração 0020, 29/09/2026):** sem mudar a decisão.
- **Estados** (`packages/dominio/src/corretiva.ts`):
  - chamado: aberto, em triagem, em execução, aguardando aceite, concluído, cancelado;
  - OS: atribuída, em execução, pausada, concluída, aceita, cancelada.
- **Transições:** o chamado anda sozinho só na triagem (aberto → em triagem) e no cancelamento antes da OS. Depois, anda a OS, e cada ação dela diz o reflexo no chamado, gravado na mesma unit of work:
  - gerar (chamado aberto ou em triagem) → OS atribuída, chamado em execução;
  - reatribuir (OS atribuída, em execução ou pausada) → atribuída;
  - iniciar, pausar, retomar;
  - concluir → OS concluída, chamado aguardando aceite;
  - aceitar → OS aceita, chamado concluído;
  - reabrir, com motivo → as duas em execução;
  - cancelar, com motivo → OS cancelada, e o chamado volta para a triagem, para ganhar outra OS (decisão do Cesar, 29/09/2026).
- **Quem faz:** abre chamado quem tem escrita no hotel (todo papel menos o proprietário); triagem, geração, reatribuição e cancelamento, o Gestor CSC e o Gerente do hotel (grupo `triagem`) e o Admin do grupo, num grupo à parte (`administracao`), porque terá alçadas e permissões a mais que os dois (decisão do Cesar, 29/09/2026); iniciar, pausar, retomar e concluir, o Técnico do hotel responsável pela OS (ele, ou uma equipe de que é membro); aceitar e reabrir, quem abriu o chamado (se ainda escreve no hotel) ou o Gerente do hotel.
- **Recusas:** papel sem a ação, 403 `acao_fora_do_papel`; ação que não vale no estado, 409 `transicao_invalida`; técnico do hotel que não responde pela OS (inclusive a reatribuída com a operação offline na fila), 409 `os_de_outro_responsavel`; motivo ausente, 422 `motivo_obrigatorio`.
- **Situações e prioridades** (`situacoes.ts`, `app.situacao` e `app.prioridade`):
  - uma situação padrão por estado (chave `<entidade>_<estado>`) e quatro prioridades padrão (urgente, alta, média, baixa), instaladas por pedido idempotente do Admin, como as categorias;
  - a entidade e o estado da situação não mudam depois de criada (sem GRANT de UPDATE);
  - todo estado mantém uma situação ativa, e o tenant mantém uma prioridade ativa;
  - ao entrar num estado, o registro fica na situação pedida, se for ativa e do estado, ou na ativa de menor ordem.
- **Prioridade padrão do chamado:** a da categoria do ativo pela política `chamado.prioridade_padrao_por_categoria` (hotel → grupo → padrão), se estiver ativa; senão, ou sem categoria, a ativa de menor peso. A origem vai na cópia da política no chamado (ADR-026, C2).

**Implementação (C3, migração 0022, 29/09/2026):**
- **Uma OS não cancelada por chamado** (decisão do Cesar, 29/09/2026, com condições):
  - a OS cancelada libera o chamado para outra;
  - o aceite recusado (reabrir) reabre a mesma OS, sem criar outra;
  - a OS preventiva (1b), sem chamado, fica fora da restrição;
  - a regra está no domínio (`osOcupaOChamado`, recusa 409 `os_em_andamento`) e no banco, como integridade (índice único parcial `os_uma_ativa_por_chamado`, que pega as duas triagens simultâneas). O teste de integração confere a paridade para cada estado da OS e o caso das duas triagens juntas;
  - um problema com duas especialidades vira dois chamados no MVP (pergunta ao cliente em `docs/referencia/perguntas-cliente.md`).
- **Quem recebe a OS:** um Técnico com papel vigente que cobre o hotel, ou uma equipe ativa do hotel (`triagem.ts`); senão, 422 `responsavel_sem_papel_tecnico` ou `equipe_indisponivel`. Para a aplicação conferir o Técnico, a policy de leitura de `app.atribuicao_escopo` passa a mostrar ao Gestor CSC e ao Gerente do hotel as atribuições de papel `tecnico` que cobrem os hotéis em que eles fazem a triagem. Não mostra outras atribuições nem as de outros hotéis. Ampliação aprovada pelo Cesar em 29/09/2026, depois do merge do #65.
- **Ajuste de prioridade:** pelos papéis da triagem, só com prioridade ativa e com o chamado aberto, em triagem ou em execução.
- **Escrita no banco:** a OS e o UPDATE do chamado (estado, situação, prioridade e motivo) só pelos papéis da triagem (Admin do grupo, Gestor CSC e Gerente do hotel). A C4 amplia para o responsável, e a C6, para o aceite.

**Implementação (C4a, migração 0023, 29/09/2026):**
- **Execução pelo Técnico responsável** (ele, ou uma equipe ativa de que é membro ativo): iniciar, pausar, retomar e concluir pelo `decidirNaOs`, agora com as equipes do ator preenchidas. Concluir leva o chamado a aguardando aceite.
- **Registros na OS** (`decidirRegistroNaOs`): apontar horas, registrar material e anexar foto, só com a OS em execução ou pausada. O apontamento tem fim depois do início, até 24 h, e fim até 10 min no futuro (422 `apontamento_invalido`). O material é texto livre de 1 a 500 caracteres (422 `material_invalido`).
- **Tudo por operação offline** (ADR-025): `os.iniciar`, `os.pausar`, `os.retomar` e `os.concluir` levam a versão que o aparelho calculou; `os.apontar_horas` e `os.registrar_material` não mudam a versão da OS. A regra vem antes da versão: a OS reatribuída com a operação na fila volta como 409 `os_de_outro_responsavel`.
- **Banco:** `app.os_apontamento` e `app.os_material`, só inserção, pelo responsável, em nome dele mesmo. O UPDATE de `app.os` e de `app.chamado` (este, pela OS não cancelada) ganha o responsável. Risco aceito: o GRANT por coluna vale para todo o `hk_app`, então o responsável tem UPDATE, no banco, em `tecnico_id`/`equipe_id` e em `prioridade_id`; a policy só deixa o resultado com ele como responsável, a aplicação não grava essas colunas por ele, e fica na auditoria.
- **Fila do dia:** `GET /api/v1/os/do-dia`, com as OS atribuídas, em execução ou pausadas do Técnico e das equipes dele.
- **Anexo da OS:** entidade `os`, e a URL de upload aceita um `arquivoId` gerado no aparelho, para o caminho sair igual no reenvio da foto offline (C4b).

**Implementação (C4b, PWA, 29/09/2026):**
- **Fila do dia no aparelho** (adendo ao ADR-025, aprovado pelo Cesar em 29/09/2026 com as condições de espaço do aparelho, implementadas na sequência): a guardada, com as operações pendentes projetadas por cima, e a versão calculada no aparelho.
- **Tela da OS:** as ações pelo estado (`TRANSICOES_DA_OS`), horas e material validados no aparelho com as regras do domínio, e a foto na mesma fila.
- **Foto na OS pela regra dos registros:** a C4a não aplicava a regra à foto; qualquer técnico com escrita no hotel anexava, em qualquer estado. Agora a URL de upload e o registro passam por `regraParaAnexar`, que na OS chama `exigirFoto` (responsável, com a OS em execução ou pausada).

**Correção da C4a (migração 0024, 29/09/2026; aprovada pelo Cesar em 29/09/2026):**
- **O problema:** a 0023 fez o UPDATE do chamado ler `app.os` (o ramo do responsável), e a leitura da OS lia `app.chamado` (o ramo do proprietário, 0022). O Postgres recusa esse ciclo ao reescrever a consulta (42P17), e todo UPDATE do chamado pelo `hk_app` falhava. O pgTAP da CI pegou, mas o #66 foi mergeado e a 0023 foi aplicada no dev com a CI vermelha.
- **A correção:** a OS guarda o local do chamado (`local_id`, sem UPDATE), preso ao dele por FK composta `(hotel_id, chamado_id, local_id)` → `app.chamado (hotel_id, id, local_id)`. A leitura da OS pelo proprietário usa esse local, igual à leitura do chamado, e não lê mais `app.chamado`. Não entra função, trigger nem regra no banco.
- **Para não voltar:** o meta-teste 27 monta o grafo das policies (tabela da policy → tabelas citadas no `using`/`with check`) e falha com qualquer ciclo. Rodado só por leitura no dev antes da 0024, ele aponta exatamente o ciclo chamado ↔ os.

**Implementação (C5, parada do equipamento, migração 0025, 29/09/2026; decisões de desenho aprovadas pelo Cesar em 30/09/2026, com os itens 4 e 5 alterados, abaixo):**
- **Parada ligada ao chamado do ativo:** `app.parada_ativo` guarda o ativo, o chamado (obrigatório) e, quando registrada na execução, a OS. A FK `(hotel_id, chamado_id, ativo_id)` → `app.chamado (hotel_id, id, ativo_id)` garante que o ativo é o do chamado, e a `(hotel_id, os_id, chamado_id)` → `app.os`, que a OS é do mesmo chamado. Chamado sem ativo não tem parada (422 `parada_sem_ativo`).
- **Uma aberta por ativo:** índice único parcial `(hotel_id, ativo_id) where fim is null`. Integridade, como a OS única por chamado; o 23505 vira 409 `parada_ja_aberta`.
- **Na abertura:** quem abre o chamado marca o equipamento parado (`paradoDesde`, no web e na operação `chamado.abrir`), e a parada aberta nasce na mesma unit of work. Se o ativo já está parado (por outro chamado), fica a parada que existe e o chamado abre do mesmo jeito (`ON CONFLICT DO NOTHING` no índice parcial), para a abertura offline não ser recusada por isso.
- **Na execução:** o responsável pela OS, com ela em execução ou pausada (`decidirRegistroNaOs`, agora com `registrar_parada` e `encerrar_parada`), registra a parada (aberta, ou já com o fim) e encerra a aberta, pelas operações offline `os.registrar_parada` e `os.encerrar_parada`. A OS só encerra a parada do próprio chamado: a aberta por outro chamado do mesmo ativo volta como 409 `parada_de_outro_chamado`.
- **Pelo web:** o Admin do grupo, o Gestor CSC e o Gerente do hotel encerram a parada que ficou aberta (`POST /api/v1/paradas/{id}/encerramento`, `podeEncerrarParada`; 403 `parada_fora_do_papel`). `GET /api/v1/ativos/{id}/paradas` lista as paradas com o tempo parado de cada uma e o total.
- **Início e fim:** nada no futuro, com a folga de 10 min do relógio do aparelho, e o fim depois do início (422 `parada_invalida`). O início pode ser anterior à abertura (o equipamento parou antes de alguém abrir o chamado).
- **Tempo parado no domínio** (`tempoParado`, `tempoParadoTotal`): do início ao fim, ou até agora se aberta; o total não conta duas vezes o trecho em que duas paradas se sobrepõem. O indicador fica para a 1c.
- **Onde aparece:** o ativo (web e PWA) e a fila do dia trazem `paradoDesde`, o início da parada aberta, lido por subconsulta com a RLS da parada. No aparelho, a fila do dia e a referência guardadas passam a levar esse campo, e a OS guarda o `ativoId` do chamado. A tela da OS mostra "equipamento parado desde" e o botão de registrar ou encerrar, com a parada pendente projetada por cima.
- **Banco:** lê quem lê o hotel, o proprietário do hotel inteiro e o da UH do ativo. Insere quem tem escrita no hotel, em nome dele mesmo; a aplicação limita a quem abre o chamado e ao responsável. O UPDATE só de `fim`, `encerrada_por` e `atualizado_em`, pela gestão do hotel e pelo Técnico responsável por OS não cancelada do chamado, em nome dele mesmo. As policies leem `app.ativo` e `app.os`, e nenhuma lê `app.parada_ativo`: sem ciclo (meta-teste 27).

**Decisões do Cesar sobre a C5 (30/09/2026), implementadas no complemento da C5 (sem migração):**
1. **Parada só em chamado com ativo:** aprovado. **Lacuna conhecida:** a UH não é modelada como ativo; a UH interditada (quarto fora de venda) não tem parada nem tempo parado. Se o cliente precisar, entra como ativo "UH" ou como registro próprio, em fase posterior.
2. **Ativo já parado por outro chamado:** aprovado (o chamado novo abre, e a parada que existe continua).
3. **A OS só encerra a parada do próprio chamado:** aprovado. O PWA agora sabe de quem é a parada (`paradaDoChamado` na fila do dia): a de outro chamado aparece, sem o botão de encerrar.
4. **Conclusão com a parada aberta (alterado):**
   - concluir a OS com a parada do próprio chamado aberta pede, no PWA, a resposta obrigatória "O equipamento voltou a funcionar?" (a resposta é a confirmação da conclusão; o técnico pode desistir);
   - sim: a operação `os.concluir` leva `equipamentoVoltou: true` e `concluidaEm` (a hora do aparelho), e a parada encerra com essa hora na mesma unit of work da conclusão; o reenvio devolve a resposta guardada e não encerra de novo (`paradaAEncerrarNaConclusao`, a resposta traz `paradaEncerrada`);
   - não: a parada fica aberta. Sem resposta (operação feita antes da pergunta existir, ou sem o aparelho saber da parada), também fica aberta, em vez de recusar a conclusão;
   - hora da conclusão inválida para a parada (antes do início, ou no futuro além da folga): 422 `parada_invalida`, e a conclusão não é aplicada;
   - web: `GET /api/v1/paradas/abertas-com-os-concluida` e a tela `/admin/paradas`, com as paradas abertas cujo chamado tem OS concluída ou aceita (`ESTADOS_DA_OS_CONCLUIDA`), para o Admin do grupo, o Gestor CSC e o Gerente do hotel, cada um com as dos hotéis dele (`podeListarParadasPendentes`, `encerraParadaNoHotel`), e o encerramento pela rota que já existia.
5. **Leitura pelo proprietário (aprovado com condição):** o proprietário vê da parada só o ativo, o estado e as datas. A API tira `chamadoId`, `osId`, `abertaPor` e `encerradaPor` da resposta para quem não tem no hotel um papel que não seja o de proprietário (`veDetalhesDaParada`); a parada não tem nota. **No banco, a RLS é por linha:** o proprietário que consultasse a tabela pelo `hk_app` veria as colunas de autor como UUID, mas não chega à pessoa (não lê `app.membro`, só a própria linha), nem à auditoria ou aos eventos. O pgTAP `020` prende o que ele não vê: o membro que abriu, a auditoria da parada, os eventos e as paradas de outro hotel. Esconder as colunas no próprio banco exigiria uma view com colunas próprias para o proprietário, o que pede ADR; fica registrado como opção, sem implementar.
6. **Dados no aparelho (ativo e início da parada na fila do dia e na referência):** aprovado, e agora também `paradaDoChamado`.

**Implementação (C6, aceite, migrações 0026 e 0027, 30/09/2026; decisões do Cesar de 30/09/2026 aplicadas, abaixo):**
- **Quem aceita:** o grupo `aceite` do domínio (C1): quem abriu o chamado, se ainda escreve no hotel, ou o Gerente do hotel. O Admin do grupo e o Gestor CSC só aceitam o chamado que eles mesmos abriram. Quem abriu e também executa a OS não decide (item 8, abaixo). `aceitar` leva a OS concluída a aceita e o chamado a concluído; `reabrir`, com motivo (1 a 500), leva a mesma OS, com o mesmo responsável, e o chamado de volta à execução. Os dois pelo `decidirNaOs`, com a versão vista da OS (409 `conflito_de_versao`), e a situação de cada estado pelo `situacaoPara`.
- **API:** `POST /api/v1/os/{id}/aceite` (`{ versao }`) e `POST /api/v1/os/{id}/reabertura` (`{ versao, motivo, paradoDesde? }`, resposta com `paradaId`). As telas entram na C7; o PWA não aceita.
- **Motivo da reabertura:** o último fica na OS (`motivo_reabertura`, item 10); o histórico, na auditoria (`depois.motivo`) e no evento `os.reaberta`. Eventos: `os.aceita` e `os.reaberta`.
- **Banco (migração 0026, não prevista no plano):** o Gerente já gravava a OS e o chamado (0022); quem abriu, não (o Solicitante, por exemplo), e a C6 pede que a RLS também decida. O UPDATE de `app.os` e de `app.chamado` ganha o ramo de quem abriu, com escrita no hotel (`authz.hoteis_escrita`). A policy da OS não pode ler `app.chamado` (o UPDATE do chamado lê `app.os`: ciclo, meta-teste 27), então a OS guarda quem abriu o chamado (`chamado_aberto_por`, sem UPDATE), preso ao do chamado por FK composta `(hotel_id, chamado_id, chamado_aberto_por)` → `app.chamado (hotel_id, id, aberto_por)`, como o `local_id` da 0024. A coluna aceita nulo porque a OS preventiva (1b) não tem chamado; a geração da corretiva sempre grava, e o nulo só tira o ramo (falha fechada). Risco aceito, como na 0023: o GRANT por coluna vale para todo o `hk_app`, então quem abriu tem UPDATE, no banco, nas colunas da OS e do chamado liberadas pela 0022, em qualquer estado; a aplicação só grava por ele o aceite e a reabertura, e fica na auditoria.
- **Aceite automático:** a política `os.aceite_automatico` (A7) segue desligada; o job que a executa entra na 1c, com o SLA.

**Decisões do Cesar sobre a C6 (30/09/2026):**
7. **`chamado_aberto_por` sem gatilho (aprovado pelo Cesar em 30/09/2026): FK composta e sem UPDATE.** O gatilho esbarra na regra 3 (sem trigger; exceção só por ADR aprovado, com o meta-teste atualizado) e pede uma função nova no banco (regra 4, meta-teste 11). As duas garantias pedidas já existem sem ele, e o pgTAP `021` prende as duas: o valor certo, pela FK composta para o `aberto_por` do chamado (outro autor dá 23503); a imutabilidade, pela coluna sem GRANT de UPDATE (`has_column_privilege` falso), com o `aberto_por` do chamado também sem UPDATE. O Cesar aprovou seguir sem gatilho.
8. **Quem aceita (alterado):** se quem abriu o chamado também executa a OS (é o Técnico responsável, ou membro ativo da equipe responsável), só o Gerente do hotel decide, e vale para aceitar e para reabrir (a reabertura é a recusa do aceite). O Gerente que abriu e executa também não decide: fica para outro Gerente do hotel. **Gerente único (Cesar, 30/09/2026):** se não há Gerente ativo no hotel além de quem abriu (atribuição vigente que cobre o hotel, por hotel, bandeira ou grupo, de membro ativo), decidem o Gestor CSC ou o Admin do grupo do hotel. Vale também para o Técnico que abriu e executa num hotel sem Gerente, pela mesma condição (aprovado pelo Cesar em 30/09/2026, com a leitura da 0027 como está); quem abriu e não executa segue decidindo, e o Gestor não entra. Se o cliente quiser que a OS aberta e executada pelo próprio técnico tenha aceite automático com foto de depois, entra como política configurável (ADR-026), desligada por padrão (pergunta ao cliente em `docs/referencia/perguntas-cliente.md`, item 16). A aplicação lê, com o contexto de quem pede, as equipes de quem abriu e as atribuições de Gerente (`PortaTriagem.dadosDoAceite`); o domínio decide (`DadosDoAceite`, `PAPEIS_DO_ACEITE_SEM_GERENTE`), com falha fechada sem os dados. A migração 0027 soma à policy de leitura de `app.atribuicao_escopo` as atribuições de Gerente que cobrem os hotéis em que a pessoa é Gestor CSC (o Admin já lia todas); nenhum outro papel ganha leitura, sem função nem gatilho, com o pgTAP `022`. No domínio (`estaNoGrupo`, grupo `aceite`, agora com a OS), com as equipes do ator lidas no aceite (`PortaTriagem.equipesDoUsuario`); a RLS não muda (escopo, não regra).
9. **Aceite automático:** aprovado como está. **Lacuna registrada:** o aceite automático depois de N dias não existe na 1a; a política `os.aceite_automatico` fica desligada e o job entra na 1c, com o SLA. Até lá, OS concluída sem decisão fica aguardando aceite.
10. **Motivo da reabertura (alterado):** coluna `app.os.motivo_reabertura` na 0026, com o último motivo (1 a 500, mesmo check do motivo de cancelamento; UPDATE só nessa coluna nova). Aparece na OS da API (`OsApi.motivoReabertura`), na fila do dia (`OsDoDiaApi.motivoReabertura`, guardada no aparelho) e na tela da OS do PWA ("Reaberta no aceite: …"). O histórico continua na auditoria e no evento. O aceite não apaga a coluna.
11. **Reabertura com o equipamento parado (aprovado, com acréscimo):** o pedido de reabertura aceita `paradoDesde`; com ele, abre uma parada nova do ativo no mesmo chamado, ligada à OS reaberta, na mesma unit of work (a encerrada não reabre). Sem ativo no chamado, 422 `parada_sem_ativo`; início no futuro, 422 `parada_invalida`; ativo já parado (por este ou outro chamado), fica a parada que existe e a reabertura segue (`paradaId` nulo), como na abertura do chamado (item 2 da C5). A tela da reabertura, com a opção "equipamento parado", entra na C7.

## ADR-028 — Campos tipados por definição (ativo na 1a, checklist na 1b)

**Status:** aprovada por Cesar em 26/09/2026 (PR #35), com a condição de tipos comuns com o checklist e rótulos em quatro idiomas.

**Decisão:**
- **A categoria do ativo define os campos estendidos:** chave, tipo, obrigatório e rótulo. Os valores ficam em `jsonb` na linha do ativo, validados pela aplicação contra a definição. Sem EAV, sem função e sem regra no banco.
- **Tipos de campo:** texto curto, número com unidade, data, lista (opções definidas) e sim/não. São os mesmos que o checklist tipado da 1b vai usar, definidos e validados num módulo comum de `packages/dominio`.
- **Rótulos (e opções de lista) em pt-BR, en, es e fr,** com a mesma volta do ADR-027: idioma de quem vê → padrão do catálogo → idioma padrão do tenant.
- **Mudança de definição não invalida o que já foi gravado:** campo novo obrigatório vale para gravações novas.

## ADR-029 — Concorrência por versão, com a recusa pelo fluxo da fila offline

**Status:** aprovada por Cesar em 26/09/2026 (PR #35).

**Decisão:**
- **Coluna `versao`** nas tabelas que mais de uma pessoa edita: ativo, chamado e OS.
- O `UPDATE` leva `WHERE versao = $esperada` e incrementa a versão. Sem linha afetada, o caso de uso devolve 409 `conflito_de_versao`, com a versão atual nos parâmetros.
- **No PWA, a recusa segue o fluxo do ADR-025:** a operação offline recusada por conflito fica como rejeitada, com o código, e aparece para o técnico até ele dispensar. Não há reenvio nem mescla automática.

## ADR-030 — Busca por trecho, sem acento, com `pg_trgm`

**Status:** aprovada por Cesar em 28/09/2026, com o texto como está (decisão de 26/09/2026, busca por trecho com `pg_trgm`; revisão do PR #35).

**Contexto:** a busca de locais, ativos e chamados precisa achar "açúcar" digitando "acucar", e achar por trecho no meio da palavra (ex.: "frig" em "Refrigerador"). O ADR-022 já fixou a coluna normalizada pela aplicação, sem `unaccent` e sem função no banco (regra 4).

**Decisão:**
- **Coluna `busca`** nas tabelas pesquisáveis: o texto sem acento e em minúsculas, gravado pela aplicação com a função de normalização de `packages/i18n` (ADR-022).
- **Extensão `pg_trgm`** no schema `extensions`, criada por migração. Índice GIN `gin_trgm_ops` na coluna `busca`.
- A consulta usa `busca ILIKE '%' || $termo || '%'`, com o termo normalizado pela mesma função. É o operador padrão do Postgres, sem função nova no projeto.
- **Termo mínimo de 3 caracteres,** porque o índice de trigramas precisa de ao menos um trigrama. Abaixo disso, a API responde com código próprio.
- **Meta-testes:** a lista fechada de funções (meta-teste 11) segue só para os schemas do HubKeep. As funções da extensão ficam na exceção de extensões do meta-teste 22. Um meta-teste novo fecha a lista de extensões permitidas (`pg_trgm` e as do Supabase).

**Consequências:** o custo de escrita do índice é pequeno para os volumes previstos, dezenas de milhares de ativos por tenant. Ordenar por semelhança (`similarity`) exigiria usar função da extensão numa consulta e fica fora; se vier, é outro ADR.

**Implementação (B6, migração 0019, 29/09/2026):** sem mudar a decisão.
- A normalização é `textoDeBusca` em `packages/i18n` (minúsculas, sem acento, espaços reduzidos). O que entra na coluna é calculado num único lugar, `packages/db/src/repositorios/busca.ts` (local: nome; ativo: nome, fabricante, modelo e número de série), que devolve os campos pesquisáveis junto com a busca; toda criação e alteração, incluindo a promoção de UHs do CM, grava essas colunas, e um teste varre os fontes de `packages/db` para que nenhum outro trecho escreva a busca ou um campo pesquisável direto. O termo digitado passa por `termoDeBusca`, que dá `busca_curta` (422, com o mínimo) abaixo de 3 caracteres; termo vazio devolve a lista inteira.
- A coluna é `text not null`, sem default (decisão do Cesar, 29/09/2026): um INSERT que esqueça a busca falha, e as fixtures dos testes gravam a coluna. Os registros existentes foram preenchidos na migração com `translate()` e `lower()`, com o mesmo resultado da função para as letras acentuadas do português, do espanhol e do francês.
- API: `?busca=` em `GET /hoteis/{id}/locais` e `GET /hoteis/{id}/ativos`. O `%`, o `_` e a barra digitados valem como texto.
- PWA: filtra os ativos guardados no aparelho, sem rede, com a mesma função e os mesmos campos; abaixo de 3 caracteres, mostra a lista inteira, sem aviso.
- Meta-testes 25 (lista fechada de extensões: as do Supabase, `pgtap` e `pg_trgm`) e 26 (índices de trigramas só em `busca` de local e ativo, com `pg_trgm` em `extensions`).
- O chamado ganha a coluna na C2, junto com a tabela.

## ADR-031 — Proprietário de hotel inteiro, com vigência, calculado na fonte

**Status:** aprovada por Cesar em 28/09/2026, com o texto como está (decisão de 26/09/2026; implementada na migração 0011, PR #41). Confirmado também que só o Admin do grupo lê `app.hotel_proprietario`.

**Contexto:** o proprietário ou locador se liga a UHs (condo-hotel) ou a um hotel inteiro (`docs/00`). Hoje só existe o vínculo com UHs (`app.local_proprietario`).

**Decisão:**
- **Tabela `app.hotel_proprietario`** (tenant, id, proprietário, hotel, vigência início e fim), com FK composta, RLS, escrita só pelo Admin do grupo e os seis casos de isolamento.
- **Calculado na fonte (ADR-004):** a função `authz.locais_proprietario()` passa a devolver também todos os locais (UHs e áreas comuns) dos hotéis vinculados ao proprietário, dentro da vigência. As policies que já usam a função (hotel, local, e as tabelas da 1a, como chamado e OS) cobrem o caso sem mudança, e UH nova do CM entra no escopo sozinha.
- A função muda por migração nova, com o meta-teste 11 atualizado no mesmo PR (regra 4). Continua `security definer`, dona `hk_authz`, com `search_path` fixo.
- O proprietário continua somente leitura: nada disso entra em `authz.hoteis_escrita()`.

**Consequências:** o custo da função cresce com um `union`, desprezível para os volumes previstos (reavaliação da carga na 1c, ADR-004).

**Adendo (28/09/2026, B1; aprovado por Cesar em 28/09/2026, valendo só para a leitura de `app.hotel`):** hotel vinculado por inteiro e ainda sem nenhum local não aparecia para o proprietário, porque a visibilidade do hotel vinha só do `hotel_id` dos locais.
- **Função nova `authz.hoteis_proprietario()`** (migração 0012): devolve os hotéis dos vínculos `app.hotel_proprietario` vigentes do proprietário ligado ao usuário. É `security definer`, dona `hk_authz`, com `search_path` vazio, como as outras. É uma função e não uma leitura direta na policy porque só o Admin lê `app.hotel_proprietario`.
- **Onde entra:** só na policy de leitura de `app.hotel` (o hotel vinculado, com ou sem locais). Não entra em `authz.hoteis_leitura()`: o proprietário não passa a ler o que é escopo só por hotel, como equipes, e continua sem escrita.
- **Políticas:** o proprietário não lê políticas no MVP, por falta de uso concreto (decisão do Cesar, 28/09/2026). A migração 0013 tira da leitura de `app.politica` todos os caminhos do proprietário: `hoteis_proprietario()`, que a 0012 tinha posto, e `locais_proprietario()`, pela qual o dono de UH e o dono de hotel com locais liam as do hotel e as do grupo desde a 0010.
- **`authz.locais_proprietario()` continua devolvendo só locais de verdade.** O pgTAP 010 garante que ela nunca devolve `local_id` nulo. Uma primeira versão da B1 usava `left join` e devolvia `(nulo, hotel)` para o hotel sem locais; o Cesar recusou (28/09/2026), porque um nulo no escopo é armadilha para policy futura.
- A lista do meta-teste 11 e a impressão do 11b ganham a função nova no mesmo PR (regra 4).

## ADR-032 — Segurança da borda do web: sessão HttpOnly, CSP com nonce, origem conferida e varredura na CI

**Status:** aprovada por Cesar em 29/09/2026, depois do merge do #59, com as condições abaixo. As condições 1 a 3 entraram no PR seguinte (S2), antes da C3; a 4 e a 5 estão no plano (`docs/05`).
1. **Certificado do banco conferido agora, no dev, sem esperar a F0-12.** A conexão confere o certificado do pooler contra a CA raiz do Supabase e pelo nome do host.
   - Âncora: `packages/db/src/ca-supabase.ts`, com a impressão digital fixada, e cópia em `packages/db/certificados/` para o psql e o kysely-codegen.
   - A string de conexão não pode trazer parâmetro de TLS (`sslmode`, `ssl` e afins), que valeria por cima da opção do HubKeep.
   - Os dois `nosemgrep` saíram.
2. **Limite de tamanho do pedido em todas as rotas**, não só na ingestão.
   - A `rota()` aplica `LIMITE_BYTES_PADRAO` (256 KiB) a toda rota que não declara outro, e a leitura para ao passar do limite.
   - O `proxy.ts` recusa com 413 o `content-length` acima de `LIMITE_BYTES_MAXIMO`, que é o do lote.
3. **Actions da CI fixadas pelo SHA do commit, com a versão em comentário**, atualizadas pelo Dependabot. Um teste (`tests/actions-fixadas.test.ts`) reprova `uses:` sem SHA e imagem sem digest.
4. **Tarefas antes do piloto:**
   - MFA obrigatório para Admin do grupo, Gestor CSC e Implantador;
   - CSP de script no PWA;
   - decisão de rate limiting junto com a contratação do Vercel Pro.
5. **Pentest antes do rollout**, como já decidido (P3 do `docs/09`).

**Contexto:** o modelo de ameaças da S1 (`docs/09`) apontou quatro lacunas baratas de fechar.
- A sessão do web ficava em cookie legível pelo JavaScript: o `createBrowserClient` do `@supabase/ssr` grava sem HttpOnly.
- O web não mandava cabeçalho de segurança.
- A API aceitava mudança de estado por cookie vinda de qualquer site, protegida só pelo SameSite=Lax.
- A CI não procurava segredo nem fazia análise estática.

**Decisão:**
- **Sessão em cookie HttpOnly, gravado só pelo servidor.**
  - O login continua no navegador, direto no Auth, com a sessão só em memória.
  - Os tokens seguem na hora para `POST /auth/sessao`, que confere o access token pelo JWKS (ADR-017) e grava o cookie. O cookie é HttpOnly e SameSite=Lax, e Secure fora do dev.
  - Saída (`DELETE /auth/sessao`, escopo local: o PWA do mesmo usuário continua), senha nova (`POST /auth/senha`), aceite do convite e renovação no `proxy.ts` também gravam pelo servidor, com as mesmas opções (`servidor/sessao-supabase.ts`).
  - O login não passa pelo servidor porque o limite de tentativas do Supabase Auth conta por IP. Vindo da Vercel, todos os usuários dividiriam o limite de poucos IPs.
  - Custo aceito: os tokens passam uma vez pela memória da página no login, onde a senha já estava.
- **CSP com nonce por requisição**, posta pelo `proxy.ts` na requisição (o Next aplica o nonce aos scripts dele) e na resposta.
  - `script-src 'self' 'nonce-…' 'strict-dynamic'`, sem `unsafe-inline`; `unsafe-eval` só no dev.
  - Estilo inline liberado, porque as telas usam o atributo `style`.
  - `connect-src` e `img-src` com a origem do Supabase (login e URL assinada).
  - `frame-ancestors 'none'`, `object-src 'none'`, `base-uri` e `form-action` da própria origem.
  - Na API, `default-src 'none'` e `Cache-Control: no-store`.
  - As páginas já são todas dinâmicas (o layout lê cookie e cabeçalho), condição para o nonce.
- **Cabeçalhos fixos** pelo `next.config.ts`:
  - HSTS de 2 anos com subdomínios, fora do dev e sem preload. Entrar na lista de preload é difícil de desfazer e fica para decisão à parte;
  - `nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY`, COOP `same-origin` e `Permissions-Policy`.
  - O PWA recebe os que não dependem de nonce, pelo `vercel.json`.
- **Origem conferida (CSRF)** no `proxy.ts`. POST, PUT, PATCH e DELETE sem `Authorization` só passam com `Origin` igual à do próprio site, ou, sem `Origin`, com `Sec-Fetch-Site: same-origin`. Sem nenhum dos dois, passam só sem cookie e fora de `/auth/*`. A recusa é 403 `origem_recusada`, com linha de log.
  - `Authorization` fica de fora da checagem porque o navegador não o manda sozinho para outro site sem CORS, que o web não libera.
- **Lint** (zona protegida):
  - `sql.raw`, `sql.id`, `sql.ref`, `sql.table`, `sql.lit` e `dynamic.ref`/`dynamic.table` proibidos fora de `packages/db`;
  - `dangerouslySetInnerHTML`, atribuição a `innerHTML`/`outerHTML`, `insertAdjacentHTML` e `document.write` proibidos em todo o repositório, inclusive em teste.
- **CI** (`.github/workflows/seguranca.yml`), a cada PR, no main e toda segunda:
  - gitleaks no histórico inteiro, com o binário conferido por SHA-256 e as exceções em `.gitleaks.toml`;
  - Semgrep com as regras da comunidade para JS/TS, React, Next.js e GitHub Actions, em imagem fixada por digest. Qualquer achado reprova, e a exceção é `nosemgrep` com o motivo no comentário.
  - As actions de todos os workflows passam a ser fixadas por SHA, a CLI do Supabase por versão, e o Dependabot abre PR das actions.
  - `.gitleaks.toml` e `.github/dependabot.yml` entram na zona protegida (ADR-023).
- **Senha:** mínimo de 8 caracteres no `config.toml`, o mesmo da tela e do contrato de `/auth/senha`. No dev, vale no próximo `config push`.

**Consequências:**
- Nenhuma tela lê a sessão. O que precisar do usuário pergunta à API (`GET /api/v1/sessao`).
- Script de terceiro (analytics, chat) exige mudar a CSP, o que passa por este ADR.
- A regra excluída do Semgrep (`unsafe-add-mask-workflow-command`) fica justificada no workflow.
- Os dois `nosemgrep` de TLS sem conferir o certificado, que apontavam para a pendência P6 do `docs/09`, saíram com a condição 1.
- Fora deste ADR, listadas no `docs/09`: rate limiting (P1), endurecimento do banco de produção (P2), pentest (P3), MFA e limites de sessão (P4), sessão do PWA (P5) e as demais.

## ADR-033 — Intelligence: sinal e insight, com o ciclo de vida do insight no domínio

**Status:** aprovada por Kaio em 05/10/2026, como ADR-INT-1 (`docs/referencia/propostas-adr-inteligencia.md`); aguarda aprovação do Cesar.

**Quem aprova ADR do Intelligence:** Cesar e Kaio, os dois, por escrito (decisão de 30/09/2026, reafirmada pelo Cesar em 06/10/2026). O registro de 05/10/2026, feito na sessão do agente do Kaio, que aceitava a aprovação de um só, fica revogado. O merge do PR que trouxe estes ADRs ao `docs/03` (#97) não conta como aprovação. Vale para o ADR-033 ao ADR-037 e para as três regras do cálculo do dia (#101), que também aguardam o Cesar.

**Contexto:** o PRD do Intelligence (`docs/referencia/prd-hubkeep-intelligence-v1.md`, seções 21 e 22) propõe `intelligence_signal` e `intelligence_insight`, com status em inglês e uma tabela de sinais que copia o núcleo.

**Decisão:**
- **Insight** (`app.insight`, depois das migrações da instrumentação). Guarda:
  - tenant e hotel (opcional só para os insights de rede, que só quem tem escopo de grupo ou bandeira lê);
  - escopo, tipo e severidade (a faixa do score);
  - score, versão e detalhamento;
  - evidência, primeira e última detecção, responsável, encerramento e nota.
- **A evidência guarda ids, não cópia:** a RLS da tabela de origem decide o que quem pede vê, como no histórico da D1.
- **Estados canônicos no domínio** (ADR-027): `novo`, `em_revisao`, `aceito`, `em_acao`, `monitorando`, `resolvido` e `descartado`.
  - As transições, e quem faz cada uma, ficam em `packages/inteligencia` e `packages/aplicacao`.
  - O banco guarda só o formato do estado, com teste de paridade com o domínio.
- **O score sugere e a pessoa decide:**
  - o job abre ou atualiza o insight do mesmo escopo e da mesma regra, sem abrir um segundo;
  - só uma pessoa aceita, descarta ou resolve.
- **Sem tabela de sinais no 1.0:** o motor lê o núcleo pelas portas. A tabela de sinais nasce na 1.5, só para o feedback externo, com os três estados de associação.
- **Texto pelo catálogo:** o insight guarda tipo, chaves e números, e não título nem resumo (regra 11).
- Tudo auditado pela unit of work.

## ADR-034 — Intelligence: scores determinísticos, versionados e explicáveis, calculados na aplicação

**Status:** aprovada por Kaio em 05/10/2026, como ADR-INT-2; aguarda aprovação do Cesar.

**Contexto:** o PRD (seções 28 e 29) sugere `metric_definition` com fórmula e views materializadas. Fórmula de score é regra de negócio (regra 2).

**Decisão:**
- **A fórmula fica em `packages/inteligencia`,** em TypeScript puro, com versão por score. Mudou a fórmula, sobe a versão. A versão 1 fica congelada na primeira gravação de resultado.
- **Forma comum** (`score.ts`):
  - valor de 0 a 100, faixa e versão;
  - os componentes, cada um com peso, peso efetivo, valor, pontos e evidência;
  - os componentes ausentes;
  - a cópia da configuração usada.
- **Dado ausente não vira zero:** o peso do componente sem fonte vai para os presentes, na proporção, e a tela mostra o que falta.
- **No 1.0, o impacto no hóspede** é a porcentagem dos chamados do ativo que afetaram hóspede (`impactoHospedeDosChamados`, pelo `impacto_hospede` da instrumentação). O Guest Impact Score da 1.5 o substitui, com versão nova.
- **"Por que estou vendo isso?"** sai de `motivosDoScore`, com a frase no catálogo, nos quatro idiomas.
- Sem view materializada e sem função SQL nova.

## ADR-035 — Intelligence: pesos, limites e faixas como políticas

**Status:** aprovada por Kaio em 05/10/2026, como ADR-INT-3; aguarda aprovação do Cesar. Revisão de 06/10/2026, que aplica as decisões do Cesar do mesmo dia e a janela de leitura do ADR-036: aprovada por Kaio, aguarda aprovação do Cesar.

**Decisão:**
- **Uma chave de política por score,** no modelo do ADR-026, com o formato validado em `packages/inteligencia`:
  - `inteligencia.reincidencia`;
  - `inteligencia.atencao_ativo`;
  - `inteligencia.efetividade`;
  - `inteligencia.sistemico`;
  - `inteligencia.substituicao`.
- **Uma sexta chave,** `inteligencia.metrica_janela_leitura` (revisão de 06/10/2026), para a janela de leitura da métrica diária do ADR-036. O padrão é 180 dias, que também é o mínimo.
- **Resolução pelo registro do núcleo** (adendo ao ADR-026):
  - as chaves entram no `registroDePoliticas` pela extensão do módulo (prefixo `inteligencia.`), na montagem do Intelligence, junto com o filtro por módulo contratado (`licenca.modulo`);
  - o módulo não tem resolução própria: vale hotel → bandeira → grupo → padrão, e o valor com escopo de bandeira só entra na 1c;
  - a mudança é auditada.
- **Só o Admin do grupo** altera as políticas do Intelligence.
- **Padrões:**
  - os pesos e faixas do PRD e os limites de `packages/inteligencia` (`PADRAO_*`), até o ajuste com os dados do piloto;
  - o custo da atenção por ativo compara o custo informado em 12 meses com R$ 10.000, enquanto não houver custo de reposição (fase 2);
  - **o limite que faz a atenção sugerir insight** é o campo `limiteInsight` da `inteligencia.atencao_ativo`, com padrão 70 e de 0 a 100 (Cesar, 06/10/2026).
- **Criticidade fixa de 1 a 5** (Cesar, 06/10/2026). O motor divide o nível por 5. A política `ativo.criticidade` do núcleo só troca o nome de cada nível.
- **O resultado guarda a configuração usada:** mudar o peso não muda o score já gravado.

## ADR-036 — Intelligence: resultados diários e mensais gravados por job do worker

**Status:** aprovada por Kaio em 05/10/2026, como ADR-INT-4, com a retenção e a agregação mensal decididas no mesmo dia; aguarda aprovação do Cesar. Revisão de 06/10/2026, que troca a guarda de 12 meses pela janela de leitura e registra a pendência de particionamento: aprovada por Kaio, aguarda aprovação do Cesar.

**Decisão:**
- **Job diário** por Vercel Cron: `hk_worker`, um tenant por transação, unit of work com auditoria e evento.
- **Resultados diários** em `app.metrica_ativo_diaria` (e `app.metrica_hotel_diaria`, se a performance pedir).
- **Nada é apagado** (revisão de 06/10/2026). O resultado gravado de cada dia, com a configuração usada, é a fonte de verdade do histórico.
  - Recalcular um dia passado usa as transições da OS até aquele dia.
  - Os campos editáveis e a política entram com o valor atual. Por isso o recálculo não reproduz exatamente o que foi gravado.
- **Janela de leitura de 180 dias** (revisão de 06/10/2026):
  - telas e consultas leem só os últimos 180 dias da métrica diária. O valor é a política `inteligencia.metrica_janela_leitura` (ADR-035), com mínimo de 180;
  - 180 dias comportam a efetividade do PRD, que compara 90 dias antes com 90 dias depois da intervenção;
  - nenhuma regra lê a métrica diária além da janela: a agregação mensal lê o mês que fecha, e o custo informado de 12 meses vem da OS;
  - nenhum papel da aplicação recebe DELETE.
- **Agregação mensal** para a visão de rede, gravada pelo mesmo job no fechamento do mês. O prazo de guarda dela é decidido no PR das tabelas.
- **Pendência: particionamento da métrica diária** (revisão de 06/10/2026).
  - Como nada é apagado, a tabela cresce sem limite: na ordem de 7 milhões de linhas por ano para 40 hotéis com 500 ativos.
  - Quando o volume pedir, a tabela passa a ser particionada por mês. A partição que sair da janela poderá ser removida por operação do responsável (o Cesar), nunca por papel da aplicação.
  - Isso pede ajuste nos meta-testes 1, 2 e 28, porque cada partição é vista como tabela. Também pede RLS forçada em cada partição e PK com o dia.
  - A análise está em `docs/referencia/retencao-metrica-diaria.md` (opção A). A decisão é do Cesar, antes do piloto ou quando o volume pedir.
- Toda tabela com `tenant_id NOT NULL`, RLS forçada, policies por papel e os seis casos de isolamento.
- **Recálculo pontual** por handler do outbox, nunca por trigger. Nenhuma IA em request de painel.

## ADR-037 — Intelligence: o módulo depende do núcleo, nunca o contrário

**Status:** aprovada por Kaio em 05/10/2026, como ADR-INT-5; aguarda aprovação do Cesar. A fronteira (o núcleo não importa o módulo) é pedido do Cesar de 01/10/2026 e está no lint desde o #87.

**Decisão:**
- **`packages/inteligencia` é puro** como o `packages/dominio`: só importa `@hubkeep/dominio` e `@hubkeep/i18n`. O núcleo nunca o importa.
- **O Intelligence lê o núcleo pelas portas** e só escreve nas tabelas dele.
- **Opcional por tenant:** a tela e o job só rodam para quem tem o Intelligence contratado. A métrica de cobrança continua pendente.
- **Divisão do trabalho:**
  - as migrações das tabelas do núcleo (chamado, OS, ativo) são do agente do núcleo;
  - as do Intelligence são do agente do Kaio, em branches `int-*`;
  - vale um PR de zona protegida aberto por vez no repositório inteiro.

## ADR-038 — Identidade visual: pacote de interface compartilhado, a partir do mock oficial

**Status:** proposto em 06/10/2026 (tarefa U1, divisão em PRs aprovada pelo Cesar no mesmo dia); aguarda a aprovação do Cesar.

**Contexto:** as telas da fase 1a são funcionais e sem acabamento visual (`docs/05`, regras da fase), com estilo solto em cada tela (cerca de 130 `style={{…}}` nos apps). O mock da Central de Manutenção, em `docs/referencia/design/csc-mock/`, é a referência visual oficial do HubKeep (Cesar, 06/10/2026). O web, o PWA e as telas do Intelligence precisam da mesma identidade, sem copiar estilo de um app para o outro.

**Decisão:**
- **Pacote `packages/ui`**, usado pelo web, pelo PWA e pelas rotas e telas do Intelligence no web (`web-telas-inteligencia`).
  - Contém os tokens, as fontes e os componentes base: estrutura com menu lateral e barra superior, painel, indicador, tabela, selos de estado e de prioridade, botões, campos de formulário, mensagens vazias e de erro.
  - Só importa React. Não importa outro pacote do HubKeep nem módulo do Node (lint de fronteiras, `tests/fronteiras.test.ts`).
  - O `packages/inteligencia` continua puro, sem React (ADR-037).
- **Nenhum texto no pacote** (regra 11): cada componente recebe o texto pronto, por prop, do catálogo do app que o usa. A regra `formatjs/no-literal-string-in-jsx` vale também em `packages/ui`.
- **Tokens do mock, nos dois temas,** com nomes em português e o prefixo `--hk-` (`packages/ui/src/tokens.css`).
  - O escuro é o padrão; o claro vale com `data-tema="claro"` no `<html>`.
  - **Contraste AA nos dois temas:** 4,5:1 para texto e 3:1 para o contorno de foco. Os tokens do mock que não chegavam foram ajustados no mesmo matiz, o mínimo necessário: o texto apagado nos dois temas, a prioridade baixa no escuro e, no claro, o texto suave, as prioridades crítica, alta e baixa, o botão principal, o botão de perigo, o âmbar usado como texto e o foco. O teste `tests/ui-contraste.test.ts` confere cada par de texto e fundo e reprova o token que derrube um par.
- **Tema de cada app:**
  - **Web:** escuro como padrão, como no mock, com botão de troca. A escolha fica num cookie que o servidor lê, para a página já abrir no tema certo, sem piscar e sem script novo na CSP.
  - **PWA:** claro como padrão, pela leitura em ambiente claro ou externo, com a mesma troca.
- **Fontes Barlow e Barlow Condensed servidas pelo próprio sistema,** pelos pacotes `@fontsource/barlow` e `@fontsource/barlow-condensed` (licença SIL Open Font License 1.1), com a versão presa no lockfile e conferida pelo `pnpm audit`.
  - Só os pesos que o mock usa, nos subconjuntos latino e latino estendido (pt-BR, en, es e fr).
  - Nada é pedido ao Google Fonts: a CSP do web segue com `font-src 'self'`.
  - O PWA põe os `.woff2` no precache do service worker, para mostrar a fonte sem rede.
- **Só estilo e estrutura das telas que já existem.** Telas e funções que só existem no mock (indicadores da 1c, políticas de SLA, implantação por planilha e etiquetas) não entram por este ADR; cada uma entra com a tarefa da fase dela. O painel de implantação da 1a (A5) recebe só o estilo.
- **O mock fica no repositório como referência,** fora do produto: o ESLint e o Semgrep não varrem `docs/referencia/design/`, que tem HTML e JS de demonstração.

**Consequências:**
- Os PRs U2 a U5 trocam o estilo solto das telas pelos componentes e pelos tokens. Quando os `style={{…}}` saírem dos apps, o `'unsafe-inline'` do `style-src` da CSP do web pode sair (pendência, fora deste ADR).
- Uma cor nova entra como token nos dois temas, com o par dela no teste de contraste.
