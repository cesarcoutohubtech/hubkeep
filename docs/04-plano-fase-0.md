# 04 — Plano técnico da fase 0 (fundação)

Tarefas em ordem de execução. Cada uma termina com PR revisado e CI verde. Não avançar para a próxima sem o critério de aceite atendido. A parte de descoberta da fase 0 (views do TOTVS, visitas, protótipo) corre em paralelo e não está aqui.

## F0-01 — Monorepo e qualidade

Montar pnpm + Turborepo, TypeScript strict, ESLint com regra de fronteiras entre pacotes (ex.: `eslint-plugin-boundaries`), Prettier, Vitest e GitHub Actions com lint, typecheck e testes.

**Aceite:** `pnpm lint`, `pnpm typecheck` e `pnpm test` rodam na CI; um import proibido (ex.: `dominio` importando `db`) faz o lint falhar.

## F0-02 — Supabase local e testes de banco

Rodar `supabase init`, manter a migração `20260924000001_fundacao.sql` e os testes em `supabase/tests/database`. Em `config.toml`, deixar os schemas do HubKeep fora de `[api] schemas`. Colocar `supabase start`, `supabase db reset` e `supabase test db` na CI.

**Aceite:** 42 testes pgTAP passando na CI (12 meta e 30 de isolamento; os 2 a mais vêm do ADR-013). Verificar os quatro pontos da seção "Pontos a verificar" em `02-seguranca-multitenant-rls.md` e registrar o resultado no PR.

## F0-03 — Papéis por ambiente

Criar o script de operação `scripts/ops/configurar-papeis.ts`, executado por pessoa autorizada com `DATABASE_URL_OWNER`, nunca na Vercel. Ele define LOGIN e senha de `hk_app`, `hk_worker`, `hk_ingestao` e `hk_backoffice` em staging e produção. `hk_authz` nunca recebe LOGIN.

**Aceite:** a API em staging conecta como `hk_app` pelo Supavisor em modo transação; a conexão como `hk_authz` falha.

## F0-04 — packages/db: contexto, repositórios e unit of work

Implementar Kysely com `kysely-codegen`, `withContext`, `withSistema` e `unitOfWork` (auditoria e outbox). O pool não é exportado. Criar regra de lint que proíbe escrita fora de `packages/db/src/repositorios`.

**Aceite:**
- Teste de integração com duas requisições concorrentes de usuários de tenants diferentes no mesmo pool, sem vazamento de contexto.
- Teste de consulta sem contexto retornando vazio.
- Teste de unit of work gravando mudança, auditoria e evento na mesma transação, e desfazendo as três quando há erro.

## F0-05 — Autenticação e tenant ativo

Configurar o Supabase Auth no Next.js (`@supabase/ssr`, cookies), validar o JWT no servidor e extrair o usuário. O PWA manda o token como Bearer. Seleção de tenant por cookie/cabeçalho. Fluxo de convite no módulo `auth-admin`, único que usa a secret key. O `app.membro` é criado **no convite**, na unit of work de quem convida; o aceite só estabelece a sessão do convidado (ADR-014).

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
- Onde mora o módulo `auth-admin` (pacote próprio ou dentro de `apps/web`): decidir na F0-05.
- Backoffice da EasyGov: o papel `hk_backoffice` existe no banco, mas nenhuma tarefa da fase 0 cria a aplicação nem a variável de conexão dele.
- Versão do PostgreSQL: o pacote foi validado em 16; o `supabase init` e os projetos novos do Supabase usam 17. Os testes deste repo rodam em 17.
