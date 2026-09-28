# CLAUDE.md — HubKeep

Plataforma de manutenção preventiva e corretiva para redes hoteleiras multi-propriedade. Primeiro cliente: grupo Slaviero (40+ hotéis). Produto multi-tenant, não projeto sob medida.

Leia antes de qualquer tarefa: `docs/02-seguranca-multitenant-rls.md` e `docs/03-decisoes-tecnicas.md`. Contexto de produto em `docs/00-contexto-produto.md`; arquitetura em `docs/01-arquitetura.md`; plano atual em `docs/04-plano-fase-0.md`.

## Regras inegociáveis

1. **Isolamento de dados na camada de banco.** Toda tabela nova em `app`, `staging` ou `licenca` tem `tenant_id NOT NULL` (exceto `app.tenant`, que é a raiz), RLS habilitada e forçada, policies por papel e teste pgTAP de isolamento. Os meta-testes em `supabase/tests/database/001_meta_seguranca.test.sql` quebram a pipeline se isso faltar.
2. **Sem regra de negócio no banco.** O banco guarda estrutura, integridade referencial e autorização por escopo (quem vê, em que escopo escreve, sem escalada). Cálculo de SLA, transição de status, geração de OS, limite de licença, permissão de ação (quem ativa hotel, quem muda status): tudo em `packages/dominio` e `packages/aplicacao`.
3. **Sem triggers.** Existe meta-teste que falha com qualquer trigger. Exceção só por ADR aprovado e com o teste atualizado no mesmo PR.
4. **Função nova no banco só por ADR.** A lista de funções permitidas está fechada no meta-teste 11. As funções existentes são de autorização (`authz.*`) e o agregado de licença (`licenca.uso`).
5. **Toda leitura e escrita de dados de negócio passa pelo servidor**, com o papel `hk_app` e o contexto do usuário na transação (`withContext`). O navegador nunca acessa tabelas via Data API do Supabase. A `service_role`/secret key só é usada no módulo `auth-admin` (convites e URL assinada do Storage, depois da checagem de escopo; ADR-024) e nunca para ler ou gravar tabela de negócio.
6. **Escrita sempre por unit of work**, que grava auditoria e evento de domínio (outbox) na mesma transação.
7. **Toda exigência de cliente vira configuração ou política** (SLA, horário, escalonamento, papéis), nunca `if (tenant === 'slaviero')`.
8. **TOTVS CM é somente leitura.** Nada é escrito no CM. O conector só envia dados para o endpoint de ingestão.
9. **Sem ML preditivo, IoT ou IA no MVP.**
10. **Escopo do MVP é fechado.** Se uma tarefa exigir algo de fase 2, pare e registre como pendência em vez de implementar.
11. **Nenhum texto de interface fixo no código.** Tela, mensagem exibida, e-mail e push saem de catálogo ICU (`packages/i18n`, FormatJS), com pt-BR como idioma-fonte e en, es e fr traduzidos. A API devolve erro e validação como código e parâmetros, nunca frase; todo código de erro tem mensagem no catálogo. O lint barra texto fixo nos apps (`formatjs/no-literal-string-in-jsx`, ADR-022).

## Stack

- Monorepo pnpm + Turborepo, TypeScript strict em tudo.
- `apps/web`: Next.js (App Router) na Vercel — telas do CSC e gestores, API REST `/api/v1`, rotas de cron.
- `apps/tecnico`: React + Vite PWA (offline, IndexedDB, fila de sincronização), na Vercel como site estático.
- `apps/conector`: agente Node em Docker, roda na rede do cliente, lê views do TOTVS e envia lotes por HTTPS.
- `packages/dominio`: regras de negócio puras, sem IO, 100% testáveis com Vitest.
- `packages/aplicacao`: casos de uso e portas (repositórios, relógio, notificador, armazenamento).
- `packages/db`: Kysely com tipos gerados do banco, `withContext`, repositórios, unit of work.
- `packages/contratos`: schemas Zod da API e do adaptador de sistema hoteleiro; OpenAPI gerado a partir deles.
- `packages/i18n`: catálogos ICU por idioma (pt-BR, en, es, fr), resolução do idioma e formatação de data, número e moeda; usado por web e PWA (`react-intl`) e worker (`@formatjs/intl`), sem módulo do Node (ADR-022).
- Supabase: PostgreSQL, Auth, Storage (bucket privado com URLs assinadas). Região São Paulo.
- Vercel: funções em `gru1`; Vercel Cron para outbox, SLA e preventiva.
- Sentry para erros; logs estruturados com `tenant_id`, `hotel_id`, `usuario_id` e `request_id`.

## Onde cada coisa mora

| Tipo de código | Lugar |
|---|---|
| Regra de negócio (SLA, status, preventiva, licença) | `packages/dominio` |
| Orquestração de caso de uso, permissão de ação | `packages/aplicacao` |
| SQL, transação, contexto de sessão | `packages/db` |
| Validação de entrada e saída HTTP | `packages/contratos` |
| Texto de interface, mensagem exibida, e-mail, push | `packages/i18n` (catálogos) |
| Handler HTTP, página, componente | `apps/*` (fino, sem regra) |
| Estrutura, FK, check de integridade, RLS | `supabase/migrations` |

Dependências permitidas: `apps → aplicacao → dominio`; `aplicacao → portas` implementadas por `db`. `dominio` não importa nada de IO. `apps` não importa Kysely nem o pool diretamente. Isso é verificado por lint de fronteiras.

## Banco de dados

- Migrações em SQL no `supabase/migrations`, criadas com `supabase migration new`. São a única fonte do schema; tipos TypeScript são gerados a partir do banco (`pnpm db:types`).
- Nunca editar uma migração já aplicada em staging ou produção; criar uma nova.
- Campos de escopo (`id`, `tenant_id`, `hotel_id`) não recebem GRANT de UPDATE. Nenhum papel da aplicação recebe DELETE; exclusão é lógica.
- Toda FK entre tabelas de negócio é composta com `tenant_id` (ou `hotel_id`), para que referência entre tenants seja impossível.
- IDs são UUID v7 gerados pela aplicação.
- Ao criar tabela de negócio, siga o modelo em `docs/02-seguranca-multitenant-rls.md` (seção "Modelo para tabela nova") e adicione os casos no teste de isolamento.

## Ambiente de desenvolvimento (sem Docker local)

As máquinas da equipe não rodam `supabase start` nem outro banco em Docker (ADR-015). O desenvolvimento usa o projeto Supabase de dev na nuvem (`HubKeep-dev`), e o Supabase local em Docker roda só na CI, em runner descartável.

- O projeto de dev não tem dados reais de cliente. Os dados de teste são fictícios.
- Não rode `supabase db reset` contra staging ou produção. Contra o dev, só com aviso à equipe, porque o banco é compartilhado.
- Migração nova vai para o dev por `supabase db push` só depois de passar na CI do PR.
- Os testes pgTAP abrem transação e fazem rollback; rodar contra o dev não deixa dados.

## Comandos

```bash
pnpm install
supabase link --project-ref <ref-do-dev>   # uma vez por máquina
supabase db push                           # aplica migrações pendentes no dev
pnpm db:testar-dev                         # pgTAP contra o dev via psql (lê DEV_SESSION_POOLER), sem Docker
pnpm db:papeis --ambiente dev --dry-run    # LOGIN e senha dos papéis (verificador SCRAM); sem --dry-run, aplica
pnpm db:verificar-papeis --ambiente dev    # aceite da F0-03: Supavisor, contexto, falha fechada
pnpm db:types                              # gera tipos Kysely a partir do dev
pnpm test                                  # Vitest (unitários e integração)
pnpm lint && pnpm typecheck
HK_ATUALIZAR_TEMPLATES=1 pnpm exec vitest run tests/i18n-templates.test.ts  # regenera o template do convite a partir do catálogo
pnpm dev                                   # web e técnico em modo dev, apontando para o dev
pnpm --filter @hubkeep/tecnico dev         # só o PWA (Vite, porta 5173; /api vai para o web em localhost:3000)
```

Na CI (`.github/workflows/banco.yml`): `supabase start`, `supabase db reset` e `supabase test db` a cada PR. Esse é o controle que bloqueia o merge.

## Pronto quer dizer

- Testes de domínio para toda regra nova; teste de integração para todo caso de uso que escreve.
- `supabase test db` passando, com casos de isolamento para tabela nova ou policy alterada.
- Lint, typecheck e testes verdes na CI.
- Nenhum segredo no código ou no git; variáveis novas adicionadas ao `.env.example`.
- Decisão técnica nova registrada em `docs/03-decisoes-tecnicas.md`.

## Comandos na máquina (incidente 3)

- Antes de qualquer `pnpm`, `npm` ou `npx`, confirme que o diretório atual é a raiz de um checkout do HubKeep (existe `pnpm-workspace.yaml` ali) e aborte se não for. Ex.: `test -f pnpm-workspace.yaml && pnpm ...`.
- Nenhuma cadeia com `;` em comandos que alteram arquivos, fazem merge ou instalam pacotes: só `&&`, para um passo que falhou não deixar o seguinte rodar no lugar errado.
- Worktrees em `C:\Cesar\HubKeep\Dev\wt\`, nunca na pasta temporária do Windows, que é limpa automaticamente e já apagou links de `node_modules` no meio de uma tarefa (etapa A da fase 1a).
- PR de zona protegida um de cada vez: a tarefa seguinte pode andar no local, mas o próximo PR de zona protegida só abre depois do merge do anterior, para não criar ciclos de conflito.

## Nunca faça

- Usar `service_role`/secret key para acessar dados de negócio.
- Conceder qualquer privilégio a `anon`, `authenticated` ou `public` nos schemas do HubKeep.
- Expor os schemas `app`, `staging`, `licenca` ou `authz` na Data API.
- Criar trigger, regra de negócio em função SQL, ou policy com `using (true)` para `hk_app`.
- Consultar o banco fora de `withContext`, ou abrir transação sem definir o contexto.
- Deixar credencial de banco do HubKeep no agente conector.
- Apontar deploy de preview para o banco de produção.
- Escrever texto de interface direto em componente, handler, e-mail ou push, ou devolver frase pronta na resposta de erro da API.

## Idioma

Converse com o Cesar sempre em português do Brasil, em toda resposta, inclusive relatórios curtos e avisos de CI.

Código, nomes de tabelas e colunas em português sem acento (como no schema existente). Mensagens de commit e documentação em português do Brasil. Textos de interface nos catálogos de `packages/i18n`, com pt-BR como idioma-fonte (regra 11, ADR-022).
