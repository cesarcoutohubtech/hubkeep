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

**Exceção:** `app.hotel.bandeira_id` recebe UPDATE do `hk_app`, embora defina o escopo dos gestores de bandeira. Trocar um hotel de bandeira é operação de cadastro do grupo, e a RLS só a permite ao Admin do grupo (policy `app_update` de `app.hotel`; "Regras de escalada" no doc 02). Como o escopo é calculado na fonte (ADR-004), a troca vale na hora para quem ganha e para quem perde o acesso. O meta-teste 18 (UPDATE em campo de escopo, `001_meta_seguranca.test.sql`) lista esta coluna como a única exceção nomeada.

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
  - `docs/03-decisoes-tecnicas.md` ou `.claude/`.

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
- O download pelo proprietário (UH própria) fica para quando existirem anexos de OS: hoje a leitura usa `authz.hoteis_leitura`, que não inclui o proprietário por UH.
- A CI sobe o `storage-api` para o teste de upload real.

## ADR-025 — Sincronização offline do PWA: fila no aparelho e chave de idempotência gravada com o efeito

**Status:** aprovada por Cesar em 26/09/2026, depois do merge do #31, com os ajustes (a) a (d), aplicados no PR de ajustes do ADR-025. **Adendo de 28/09/2026 (dados guardados no aparelho, B3b da fase 1a):** proposta, aguarda aprovação do Cesar.

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
  - **o que fica no aparelho, no total:** a fila de operações (IndexedDB), os dados de referência (IndexedDB), o tenant ativo (`localStorage`), a sessão do Supabase Auth (guardada pelo próprio cliente do Auth) e o idioma escolhido (`localStorage`), que é do aparelho, não da pessoa. A fila do dia das OS entra nesta lista na etapa C da fase 1a;
  - **(b) ao sair, os dados locais de quem sai são apagados:** a fila (pendentes e recusadas), os dados de referência, o tenant ativo e a sessão do Auth. O idioma fica. A fila do dia ainda não guarda nada no aparelho e entra nessa limpeza quando guardar (fase 1a, C4). Se houver operação ainda não enviada, o app tenta enviar e, se sobrar alguma, pede confirmação antes de apagar. O service worker guarda só a casca, sem dado de ninguém;
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
