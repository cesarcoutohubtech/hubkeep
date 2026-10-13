# Proposta: workflow "conferir dev"

**Situação:** proposta de 13/10/2026, do agente da 1b e da administração, para a aprovação do Cesar (tarefa 6 do `docs/diario-fase-1b.md`). Nada disto está implementado. O workflow mexe em `.github/workflows/`, que é zona protegida. Por isso, depois da aprovação, ele entra num PR de zona protegida, na vez da 1b.

## Para que serve

Depois de cada `db push` de migração, da 1b e da 1c, confirmar duas coisas no HubKeep-dev, sem que nenhum agente precise de acesso ao dev:
1. **As migrações do dev são as da `main`:** nenhuma faltando e nenhuma a mais.
2. **O pgTAP passa no dev:** os mesmos testes da CI, com desfazimento (cada arquivo abre transação e faz rollback; não deixa dado).

Hoje o Cesar confere a saída do `supabase migration list` depois de cada `db push` (decisão de 12/10/2026). O workflow substitui essa conferência manual e deixa o resultado num run do GitHub, que os agentes leem.

## Como dispara

- **Só manual** (`workflow_dispatch`), na `main`. Não roda em PR nem em push: o dev é compartilhado, e só faz sentido conferir depois do `db push`, que é do Cesar.
- **Ambiente "dev" do GitHub com aprovação obrigatória do Cesar.** O segredo fica no ambiente, e não no repositório. Mesmo que alguém dispare o workflow, o job só recebe o segredo depois que o Cesar aprova o run.
- **Um run por vez** (`concurrency`), sem cancelar o que está rodando.

Fluxo: o Cesar faz o `db push` → dispara "conferir dev" → aprova o run → o resultado sai no run. O agente que pediu o `db push` lê o run e registra no diário.

## O que o job faz

1. **Comparar as migrações**, com um script novo, `scripts/ops/conferir-migracoes-dev.mjs`:
   - lê as versões gravadas em `supabase_migrations.schema_migrations` no dev, pelo `psql`;
   - lê os nomes dos arquivos de `supabase/migrations` da `main`;
   - sai com erro e lista a diferença, se faltar alguma no dev ou se o dev tiver alguma que a `main` não tem.

   Ele usa a mesma conexão do `pnpm db:testar-dev`: desmonta o `DEV_SESSION_POOLER` em variáveis `PG*`, com `sslmode=verify-full` e a CA do Supabase, e confere o ref do projeto pelo `[remotes.dev]` do `config.toml` (`conferirAlvo`). O segredo nunca vai para o argv nem para a saída.

   Por que não o `supabase migration list`: ele pede o `supabase link`, com um token de acesso da conta do Supabase (`SUPABASE_ACCESS_TOKEN`), que dá acesso a todos os projetos da conta, ou recebe a string de conexão com a senha no argv (`--db-url`). A leitura direta da tabela de migrações precisa só do segredo que já existe.
2. **Rodar o pgTAP**, só se o passo 1 passar: `pnpm db:testar-dev`, o mesmo script que já roda na máquina, sem mudança. Com migrações diferentes, os testes da `main` falhariam por outro motivo e esconderiam a causa.
3. **Resumo no run** (`$GITHUB_STEP_SUMMARY`): as migrações conferidas (a última e o total) e o pgTAP em resumo (total, falhas e o nome dos arquivos que falharam), sem dado do banco.

## Segredos e configuração que o Cesar cadastra

No GitHub, em Settings → Environments:
1. **Criar o ambiente `dev`**:
   - "Required reviewers": Cesar;
   - "Deployment branches and tags": só a `main`;
   - "Prevent self-review" desligado, porque quem dispara e quem aprova é o Cesar.
2. **Um segredo no ambiente `dev`:** `DEV_SESSION_POOLER`, a mesma string do botão Connect → Session pooler do HubKeep-dev (host `*.pooler.supabase.com`, porta 5432), com o usuário `postgres.<ref>`. É a mesma que o `db:testar-dev` já usa.

Nenhum outro segredo: sem token da conta do Supabase e sem as senhas dos papéis.

Se o Cesar preferir não dar ao GitHub a senha do dono do banco, a alternativa é um papel de leitura só para o workflow. Ele leria `supabase_migrations.schema_migrations` e rodaria o pgTAP como os papéis da aplicação, com o `SET LOCAL ROLE` que os testes usam. Isso pede GRANTs novos numa migração e um ADR. A proposta é usar o segredo existente, porque o ambiente com aprovação já limita quem o usa.

## Rascunho do workflow

```yaml
# Confere o HubKeep-dev depois do db push (Cesar): migrações iguais às da main
# e pgTAP com rollback. Só manual, no ambiente "dev", que exige a aprovação do
# Cesar antes de entregar o segredo ao job.
name: conferir dev

on:
  workflow_dispatch:

concurrency:
  group: conferir-dev
  cancel-in-progress: false

permissions:
  contents: read

jobs:
  conferir:
    name: Migrações e pgTAP no HubKeep-dev
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    environment: dev
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@<sha fixado> # v7.0.1
      - uses: pnpm/action-setup@<sha fixado> # v6.1.0
      - uses: actions/setup-node@<sha fixado> # v7.0.0
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile

      - name: Migrações do dev iguais às da main
        env:
          DEV_SESSION_POOLER: ${{ secrets.DEV_SESSION_POOLER }}
        run: node scripts/ops/conferir-migracoes-dev.mjs

      - name: pgTAP no dev (rollback)
        env:
          DEV_SESSION_POOLER: ${{ secrets.DEV_SESSION_POOLER }}
        run: pnpm -s db:testar-dev
```

As actions usam os mesmos SHAs fixados do `banco.yml`, conferidos pelo `tests/actions-fixadas.test.ts`. O `psql` do runner (`ubuntu-latest`) é o do PostgreSQL 16, que conversa com o servidor 17 do Supabase. Se algum teste depender do cliente 17, o passo de instalação do `postgresql-client-17` entra antes.

## O que entra no PR, depois da aprovação

- **Zona protegida:** o `.github/workflows/conferir-dev.yml` e uma linha no `CLAUDE.md` (o Cesar dispara o "conferir dev" depois de cada `db push`, e o agente lê o run).
- **Fora da zona:** o `scripts/ops/conferir-migracoes-dev.mjs`, com teste da comparação sem banco (lista igual, faltando, a mais), e o passo a passo no `docs/06-setup-supabase-dev.md`.

## Decisões do Cesar

1. Aprovar o workflow como está: manual, no ambiente `dev` com a aprovação dele, e com o segredo `DEV_SESSION_POOLER`.
2. Usar a senha do dono que já existe (proposta) ou criar um papel de leitura com ADR.
3. A vez na fila de zona protegida: depois da PV2 e da mudança dos tipos, ou antes delas.
