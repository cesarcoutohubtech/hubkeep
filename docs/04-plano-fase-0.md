# 04 — Plano técnico da fase 0 (fundação)

Tarefas em ordem de execução. Cada uma termina com PR revisado e CI verde. Não avançar para a próxima sem o critério de aceite atendido. A parte de descoberta da fase 0 (views do TOTVS, visitas, protótipo) corre em paralelo e não está aqui.

## F0-01 — Monorepo e qualidade

Montar pnpm + Turborepo, TypeScript strict, ESLint com regra de fronteiras entre pacotes (ex.: `eslint-plugin-boundaries`), Prettier, Vitest e GitHub Actions com lint, typecheck e testes.

**Aceite:** `pnpm lint`, `pnpm typecheck` e `pnpm test` rodam na CI; um import proibido (ex.: `dominio` importando `db`) faz o lint falhar.

## F0-02 — Supabase de dev e testes de banco na CI

O projeto Supabase de dev (`HubKeep-dev`) já existe na nuvem (ADR-015). O `supabase init` já foi rodado e a pasta `supabase/` está no repositório; em `config.toml`, os schemas do HubKeep ficam fora de `[api] schemas`. Vincular o repositório ao dev com `supabase link` e aplicar a migração com `supabase db push`.

Tornar obrigatório para merge em `main` o workflow `.github/workflows/banco.yml`, que roda `supabase start`, `supabase db reset` e `supabase test db` no runner a cada PR.

**Aceite:**
- 43 testes pgTAP passando na CI (13 meta e 30 de isolamento; os 2 de isolamento a mais vêm do ADR-013 e o meta-teste 13, da revisão do PR #1).
- Os mesmos testes passando contra o dev, via `psql` pelo Session pooler (ver `06-setup-supabase-dev.md`).
- Os quatro pontos da seção "Pontos a verificar" de `02-seguranca-multitenant-rls.md` conferidos no dev, com o resultado registrado no PR.
- Na Data API do dev, as tabelas do HubKeep não aparecem e uma chamada com a chave pública a `app.hotel` falha.

## F0-03 — Papéis por ambiente

Criar o script de operação `scripts/ops/configurar-papeis.ts` (`pnpm db:papeis --ambiente <amb>`), executado por pessoa autorizada na própria máquina, nunca na Vercel. Ele leva os papéis ao estado desejado, de forma idempotente:

- `hk_app`, `hk_worker` e `hk_ingestao`: LOGIN, com a senha de `HK_<PAPEL>_SENHA_<AMBIENTE>`.
- `hk_backoffice` e `hk_authz`: NOLOGIN, sem senha. O backoffice recebe LOGIN quando for construído; o `hk_authz`, nunca.

A senha não é transmitida: o script calcula o verificador SCRAM-SHA-256 localmente e o `ALTER ROLE ... PASSWORD` recebe só ele, para a senha não aparecer em log do Postgres/Supabase. Nenhuma senha entra por argumento de linha de comando nem sai na tela. O `--dry-run` mostra os comandos com o verificador omitido. Produção exige `--confirmar-producao`.

Limites por papel ficam em migração, não no script (`20260924000002_limites_papeis.sql`): `connection limit`, `statement_timeout` e `idle_in_transaction_session_timeout`, conferidos pelo meta-teste 14. O meta-teste 15 confere que `hk_backoffice` e `hk_authz` não têm LOGIN.

**Aceite no `HubKeep-dev`** (`pnpm db:verificar-papeis --ambiente dev`):
- `hk_app` conecta pelo Supavisor em modo transação (porta 6543, usuário `hk_app.<ref>`);
- `hk_authz` e `hk_backoffice` não conectam;
- numa mesma conexão do pooler, o contexto de uma transação não aparece na seguinte;
- consulta sem contexto retorna vazio, com dado presente (fixture fictícia, apagada no fim) e com o controle de que o mesmo papel, com contexto válido, vê esse dado.

Na CI, os dois scripts rodam contra o Postgres do runner (conexão direta, sem Supavisor): configurar duas vezes, para provar a idempotência, e verificar.

**A repetição deste aceite em staging fica na F0-12**, quando o projeto de staging existir.

## F0-04 — packages/db: contexto, repositórios e unit of work

Implementar Kysely com `kysely-codegen`, `withContext`, `withSistema` e `unitOfWork` (auditoria e outbox). O pool não é exportado. Criar regra de lint que proíbe escrita fora de `packages/db/src/repositorios`.

**Aceite:**
- Teste de integração com duas requisições concorrentes de usuários de tenants diferentes no mesmo pool, sem vazamento de contexto (roda na CI, contra o Supabase do runner).
- Teste de consulta sem contexto retornando vazio.
- Teste de unit of work gravando mudança, auditoria e evento na mesma transação, e desfazendo as três quando há erro.

## F0-05 — Autenticação e tenant ativo

Configurar o Supabase Auth no Next.js (`@supabase/ssr`, cookies), validar o JWT no servidor **pelas chaves públicas do projeto (JWKS)** e extrair o usuário (ADR-017). O PWA manda o token como Bearer. Seleção de tenant por cookie/cabeçalho. Fluxo de convite no pacote `packages/auth-admin`, único que usa a secret key, com o envio atrás da porta `ProvedorDeConvite` (e-mail padrão do Supabase no dev; SMTP próprio depois, sem retrabalho). O `app.membro` é criado **no convite**, na unit of work de quem convida; o aceite só estabelece a sessão do convidado (ADR-014).

**Aceite:** usuário convidado entra e vê só o próprio tenant; trocar o cookie de tenant para outro não mostra nada; a secret key não aparece em nenhum pacote além de `auth-admin` (checado na CI).

## F0-06 — Domínio e aplicação: esqueleto e primeiros casos de uso

Criar em `packages/dominio` os tipos `Contexto`, `Papel`, os erros de domínio e as permissões de ação (ex.: `podeAtivarHotel`, `podeConcederPapel`). Em `packages/aplicacao`, criar as portas e três casos de uso de ponta a ponta: listar hotéis visíveis, conceder papel (com as regras de escalada também na aplicação, para dar mensagem de erro clara) e revogar papel.

**Aceite:** testes de domínio cobrem as regras de concessão; um teste de integração prova que, se a checagem da aplicação for removida, a RLS ainda bloqueia a escalada.

## F0-07 — API v1

Criar os route handlers em `/api/v1` com contratos Zod em `packages/contratos`, OpenAPI gerado a partir deles, formato único de erro, `request_id`, logs estruturados e Sentry.

**Aceite:** OpenAPI publicado em rota interna; erro de validação e erro de permissão com formato padronizado; logs com `tenant_id` e `usuario_id`.

## F0-08 — Ingestão e agente conector

Criar o endpoint `/api/v1/ingestao/lotes` com credencial de agente, papel `hk_ingestao`, idempotência por `lote_hash` e limite de tamanho. Criar `apps/conector` com a interface de adaptador de `packages/contratos`, um adaptador de arquivo (planilha/CSV, que é o fallback da fase 0) e o esqueleto do adaptador SQL Server para o TOTVS. Criar o job que promove UHs de staging para `app.local`, aplicando a regra de licença na aplicação.

**Aceite:** reenvio do mesmo lote não duplica nada; credencial revogada recebe 401; UH nova sem saldo entra como `pendente_licenca`; o agente não tem nenhuma variável de conexão com o banco do HubKeep.

## F0-09 — Outbox e cron

Criar as rotas de cron (`/api/cron/outbox`, `/api/cron/sla`, `/api/cron/preventiva`) com `CRON_SECRET`, `hk_worker`, laço por tenant, `for update skip locked`, backoff e handlers idempotentes. Criar um handler de e-mail de exemplo (convite).

**Aceite:** evento processado uma vez mesmo com duas execuções simultâneas; falha gera nova tentativa com atraso; um tenant com erro não bloqueia os outros.

## F0-10 — Storage

Criar bucket privado, sem policies para `authenticated`, com URLs assinadas de upload e download emitidas pela API depois da checagem de escopo, e caminho `{tenant_id}/{hotel_id}/{entidade}/{registro_id}/{uuid}`.

**Aceite:** upload direto do navegador pela URL assinada funciona; acesso sem URL assinada é negado; usuário de outro hotel não consegue URL para o registro.

## F0-11 — Esqueleto do PWA do técnico

Criar `apps/tecnico` com Vite, `vite-plugin-pwa`, login, shell offline, fila em IndexedDB com chave de idempotência por operação e tela vazia de "fila do dia".

**Aceite:** o app instala no Android e no iOS, abre sem rede e sincroniza uma operação de exemplo quando a rede volta, sem duplicar.

## F0-12 — Deploy e ambientes

Criar os projetos Vercel (`web`, `tecnico`) com funções em `gru1`, variáveis por ambiente e previews ligados só ao Supabase de staging. Workflow de migrações: automático para staging, aprovação manual para produção.

Antes de criar o projeto de staging, o access token pessoal do Supabase (`sbp_…`) passa a ter prazo de validade, sai do ambiente da máquina quando não estiver em uso e nunca é usado contra staging nem produção (regra do incidente 2, `docs/diario-fase-0.md`). O `scripts/ops/ler-config-remota.ts` já recusa qualquer ambiente que não seja o dev.

**Aceite:** PR gera preview funcional contra staging; merge em `main` com aprovação aplica a migração e publica em produção.

## F0-13 — Operação e segurança

MFA obrigatório na organização Supabase e na Vercel, lista mínima de membros com acesso a produção, PITR ativo em produção, auditoria de dependências na CI e documento de resposta a incidente de vazamento.

**Aceite:** checklist revisado pelo responsável técnico e registrado no repositório.

---

## Pendências técnicas desta fase

- Plano Vercel Pro (uso comercial e cron por minuto) e plano Supabase (PITR, SSO SAML).
- SSO corporativo da Slaviero: Entra ID, Google ou nenhum.
- Provedor de e-mail transacional (ex.: Resend ou SES) com domínio da EasyGov.
- Domínios: web e técnico no mesmo domínio raiz, para simplificar cookies e CORS.
- Parque de aparelhos dos técnicos (proporção Android e iOS), por causa do push no iOS.
- Backoffice da EasyGov: o papel `hk_backoffice` existe no banco, mas nenhuma tarefa da fase 0 cria a aplicação nem a variável de conexão dele.
- Banco de dev: um projeto por desenvolvedor ou branching do Supabase (ADR-015).
- TypeScript fixado em `~6.0` (F0-01): o `typescript-eslint` 8.70 aceita só TypeScript `< 6.1`, e a `latest` do npm já é a 7 (compilador nativo). Subir para a 7 quando o `typescript-eslint` suportar.
- Versão do PostgreSQL: o pacote foi validado em 16; o `supabase init` e os projetos novos do Supabase usam 17. Os testes deste repo rodam em 17.
