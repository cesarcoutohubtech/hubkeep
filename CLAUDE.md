# CLAUDE.md — HubKeep

Plataforma de manutenção preventiva e corretiva para redes hoteleiras multi-propriedade. Primeiro cliente: grupo Slaviero (40+ hotéis). Produto multi-tenant, não projeto sob medida.

Leia antes de qualquer tarefa: `docs/02-seguranca-multitenant-rls.md` e `docs/03-decisoes-tecnicas.md`. Contexto de produto em `docs/00-contexto-produto.md`; arquitetura em `docs/01-arquitetura.md`; planos atuais em `docs/12-plano-fase-1b.md` e `docs/13-plano-fase-1c.md`; visão consolidada em `docs/referencia/documento-projeto.md`. Ao retomar, leia também o ponto de retomada no diário do seu agente (seção "Três agentes, todos na nuvem").

## Regras inegociáveis

1. **Isolamento de dados na camada de banco.** Toda tabela nova em `app`, `staging` ou `licenca` tem `tenant_id NOT NULL` (exceto `app.tenant`, que é a raiz), RLS habilitada e forçada, policies por papel e teste pgTAP de isolamento. Os meta-testes em `supabase/tests/database/001_meta_seguranca.test.sql` quebram a pipeline se isso faltar.
2. **Sem regra de negócio no banco.** O banco guarda estrutura, integridade referencial e autorização por escopo (quem vê, em que escopo escreve, sem escalada). Cálculo de SLA, transição de status, geração de OS, limite de licença, permissão de ação (quem ativa hotel, quem muda status): tudo em `packages/dominio` e `packages/aplicacao`.
3. **Sem triggers.** Existe meta-teste que falha com qualquer trigger. Exceção só por ADR aprovado e com o teste atualizado no mesmo PR.
4. **Função nova no banco só por ADR.** A lista de funções permitidas está fechada no meta-teste 11. As funções existentes são de autorização (`authz.*`) e o agregado de licença (`licenca.uso`).
5. **Toda leitura e escrita de dados de negócio passa pelo servidor**, com o papel `hk_app` e o contexto do usuário na transação (`withContext`). O navegador nunca acessa tabelas via Data API do Supabase. A `service_role`/secret key só é usada no módulo `auth-admin` (convites; URL assinada do Storage, depois da checagem de escopo; a remoção do segundo fator pelo Admin do grupo, ADR-049; e, fora da Vercel, a conta do kit de teste; ADR-024) e nunca para ler ou gravar tabela de negócio.
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
- `packages/imagem`: compressão da foto e miniatura no navegador (canvas), usada pelas telas do web e pelo PWA; sem pacote externo nem módulo do Node (ADR-024).
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
- Os agentes rodam na nuvem e não acessam o dev: o pgTAP e a integração do `packages/db` rodam só na CI.
- DDL nunca no dev compartilhado. DML com desfazimento no fim, como fazem os testes pgTAP, é permitido.
- Depois de cada `db push`, a migração nova precisa aparecer no `supabase migration list` do dev. Até existir o workflow "conferir dev", quem confere é o Cesar; nenhum agente roda `db push`.

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

## Comandos (incidente 3)

- Antes de qualquer `pnpm`, `npm` ou `npx`, confirme que o diretório atual é a raiz de um checkout do HubKeep (existe `pnpm-workspace.yaml` ali) e aborte se não for. Ex.: `test -f pnpm-workspace.yaml && pnpm ...`. No incidente 3, um `cd` falhou numa cadeia com `;` e o pnpm moveu pacotes fora do repositório.
- Passos dependentes só com `&&`, nunca com `;`, para um passo que falhou não deixar o seguinte rodar no lugar errado. Vale para qualquer comando, inclusive leituras que dependem uma da outra.
- Texto com crase nunca vai dentro de `node -e "..."` nem de string entre aspas duplas no bash: a crase vira substituição de comando. Corpo de PR e de commit vai por arquivo. Script com barra invertida (regex) também vai por arquivo, e a regex se confere com `grep` antes de usar.

## Três agentes, todos na nuvem

Três agentes do Claude Code trabalham neste repositório, todos na nuvem, sem agente nem worktree no notebook (decisão do Cesar de 12/10/2026):

| Agente | Escopo | Título do PR | Diário |
|---|---|---|---|
| Fase 1b e administração (Cesar) | A fase 1b inteira; `CLAUDE.md`, planos, Registro de decisões, perguntas ao cliente, documento consolidado, preparação do piloto, F0-12 e segurança pré-piloto | `1b:` ou `adm:` | `docs/diario-fase-1b.md` |
| Fase 1c | A fase 1c inteira | `1c:` | `docs/diario-fase-1c.md` |
| Intelligence (Kaio) | `packages/inteligencia`, as rotas e telas do Intelligence no `apps/web` e as tabelas do próprio módulo | `int:` | `docs/diario-intelligence.md` |

- **Branches:** no padrão que o ambiente da nuvem impõe (`claude/*`); o prefixo do título do PR diz de que agente ele é. As branches antigas (`int-*`, `1b-*`) seguem até o merge.
- **Um diário por agente.** Pedido de um agente a outro fica registrado no diário de quem pede; o outro responde no próprio diário.
- **Fronteira:** o Intelligence depende do núcleo, nunca o contrário (lint de fronteiras).
- **Áreas compartilhadas entre a 1b e a 1c:** políticas, chamado, OS, catálogos de texto e `packages/dominio`. Quem for mexer registra no próprio diário antes de começar e atualiza a branch a partir da `main` com frequência.
- **Numeração de migração:** antes de cada `supabase migration new`, conferir a última migração da `main`. O nome do arquivo é por data e hora; o comentário "Migração 00NN" segue a ordem da `main`.

## PRs, zona protegida e CI

- **Zona protegida é a regex do `.github/workflows/zona-protegida.yml`, não a memória.** Além de migrações, testes do banco, `CLAUDE.md`, `docs/03`, workflows e `.claude/`, ela pega o `eslint.config.mjs`, o `supabase/config.toml`, o `.gitleaks.toml`, o `dependabot.yml`, o `packages/auth-admin/` e seis testes da raiz (secret-key, env-example, actions-fixadas, relogio-do-roteiro-fora-do-web, dependabot-zona-protegida e pagina-do-servidor-so-leitura). Na dúvida, conferir o arquivo.
- **Um único PR de zona protegida aberto por vez no repositório inteiro.** Antes de abrir um, conferir no GitHub se já existe outro aberto, de qualquer dos três agentes. Quando dois agentes quiserem a vez, o Cesar decide a ordem. A tarefa seguinte pode andar na branch; o PR só abre depois do merge do anterior.
- **PR sempre com base na `main`**, nunca empilhado sobre a branch de outro PR aberto: o PR empilhado que é mergeado depois do merge da base fica fora da `main` (#199, 12/10/2026).
- **Antes do push, confirmar que o PR da branch está aberto.** PR mergeado não recebe commit: os commits vão para uma branch nova, com PR novo. Depois do push, confirmar que o head do PR é o commit novo antes de dizer que ele está no PR ou que os checks passaram.
- **Conferir os checks** ao retomar e antes de dar um PR como pronto, uma vez, dizendo o que falhou e se a falha é esperada. O check "zona protegida" falha sempre no PR que toca a zona, por desenho (ADR-023). Uma consulta pontual não é polling; nenhum agente faz polling da CI nem liga auto-merge.
- **A `main` vermelha se corrige antes de qualquer outro merge.** A correção abre primeiro, e o Cesar é avisado para não mergear outra coisa antes; enquanto os checks não ficam verdes, o aviso diz "não mergear ainda".
- **Merges, `db push`, `config push` e o merge de zona protegida são só do Cesar.**

## Aprovações e quem fala

- **Toda mensagem diz quem fala:** "Cesar aqui" ou "Kaio aqui". Sem isso, o agente pergunta antes de agir. Texto colado e print de outro chat não contam como confirmação.
- **Nunca escrever aprovação em nome de outra pessoa** (Cesar e Kaio, 10/10/2026, #170). O GitHub e o git usam a conta do Cesar, então tudo o que o agente posta aparece como dele: o agente não comenta aprovação nem fecha issue ou PR de aprovação. Só registra e cita quem aprovou, com o link do que essa pessoa escreveu.
- **ADR:** os do núcleo (1b e 1c), com a aprovação do Cesar; os do Intelligence, com a aprovação escrita de Cesar **e** de Kaio.
  - Merge não aprova ADR: até a aprovação, o status fica "aguarda aprovação". Quando o PR de um ADR em proposta entra na `main`, o agente pergunta antes de mudar o status no `docs/03`.
  - Só um "aprovo" escrito muda o status; o agente registra a data e onde a aprovação foi escrita. Aprovação condicionada ("desde que X") exige confirmar X antes de marcar.
- **Detalhe dentro de ADR aprovado do Intelligence é só do Kaio** (ADR-033): limiares, mínimos, desempates, padrões de política dentro de regra aprovada, textos, rótulos e ajustes no seed e no mock que não mudam regra. Continua com Cesar e Kaio: componente, estado ou fonte de dado novos; quem vê ou quem decide; e os princípios do módulo. Na dúvida entre detalhe e mudança, tratar como mudança.

## Forma de trabalhar com o Cesar

- **Testes só em resumo:** total, falhas e o nome do que falhou.
- **Ponto de retomada no diário do agente** ao fim de cada etapa e quando o contexto passa de 60%. O agente para num ponto seguro (commit feito, nada pela metade, nenhum comando rodando) e registra um ponto curto e autossuficiente: o estado da `main` e do dev, os PRs abertos e o que espera o Cesar, o trabalho não enviado, as decisões pendentes e a próxima tarefa com o primeiro passo.
- **Sem notificação push nas paradas:** o Cesar não usa o Remote Control. Volta só se ele disser que ligou.

## Nunca faça

- Usar `service_role`/secret key para acessar dados de negócio.
- Conceder qualquer privilégio a `anon`, `authenticated` ou `public` nos schemas do HubKeep.
- Expor os schemas `app`, `staging`, `licenca` ou `authz` na Data API.
- Criar trigger, regra de negócio em função SQL, ou policy com `using (true)` para `hk_app`.
- Consultar o banco fora de `withContext`, ou abrir transação sem definir o contexto.
- Deixar credencial de banco do HubKeep no agente conector.
- Apontar deploy de preview para o banco de produção.
- Pôr o segredo `DEV_SESSION_POOLER` em argumento de linha de comando ou em saída; ler o `HK_DEMO_SENHA`; entrar com senha em serviço externo.
- Escrever texto de interface direto em componente, handler, e-mail ou push, ou devolver frase pronta na resposta de erro da API.

## Idioma

Converse com o Cesar sempre em português do Brasil, em toda resposta, inclusive relatórios curtos e avisos de CI.

Código, nomes de tabelas e colunas em português sem acento (como no schema existente). Mensagens de commit e documentação em português do Brasil. Textos de interface nos catálogos de `packages/i18n`, com pt-BR como idioma-fonte (regra 11, ADR-022).
