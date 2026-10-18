# HubKeep Europa — validação do ambiente Mews V1 sem escrita

**18/10/2026 · PR #324 mergeado · código da V1 administrativa na main · Supabase-dev ainda NÃO verificado.**

Este procedimento é apenas um diagnóstico. Não liga a integração com a Mews, não cria hotel/vínculo/usuário de teste, não chama APIs externas do PMS e **não aplica migrações**. Não executar contra staging ou produção.

## O que já foi comprovado

- PRs #313 (0054), #320 (0055), #323 (0056), #317 (persistência do worker) e #324 (painel administrativo) incorporados à `main`.
- CI na `main` **verde**, incluindo pgTAP no PostgreSQL efêmero; isso não comprova a aplicação de nenhuma migração no HubKeep-dev.
- A tela `/admin/mews` e a rota GET `/api/v1/mews/status` leem somente o checkpoint e contagens do `hk_app`, sob RLS de Admin do grupo.

## Passo A — verificar status remoto sem alterar o banco

No checkout atualizado do HubKeep, na **raiz** (deve existir `pnpm-workspace.yaml`), conferir que o projeto CLI vinculado é **HubKeep-dev** antes da consulta.

```powershell
git pull --ff-only origin main
Test-Path .\pnpm-workspace.yaml
supabase migration list
```

O comando `supabase migration list` é de leitura. As três versões devem aparecer na coluna **Remote** (ou equivalente):

| Versão | Migração | Função |
|---|---|---|
| `20261017183000` | 0054 | Tabelas técnicas Mews, grants e RLS |
| `20261017230500` | 0055 | Lock mínimo do worker |
| `20261018010500` | 0056 | Leitura administrativa restrita |

Se alguma versão estiver ausente do lado remoto: **parar aqui**. Não executar `supabase db push` automaticamente. Confirmar com o Cesar a lista completa de migrações pendentes, o backup/rollback e a janela de intervenção antes de autorização específica.

## Passo B — pré-voo somente leitura (após conectar ao dev)

O script do repositório usa `DEV_SESSION_POOLER` já previsto em `docs/06-setup-supabase-dev.md`. A variável deve existir somente no ambiente do operador, sem colar senha, URL ou token no chat/GitHub.

```powershell
node --experimental-strip-types --no-warnings=ExperimentalWarning scripts/ops/mews-preflight-dev.mjs --ambiente dev
```

O script:
1. Usa a mesma validação de project ref do `scripts/ops/ambiente.ts`, recusando projeto diferente de `[remotes.dev]`.
2. Abre `BEGIN TRANSACTION READ ONLY`, só consulta o catálogo do PostgreSQL e o histórico de migrações, e finaliza com `ROLLBACK`.
3. Confirma as versões 0054/0055/0056, `FORCE RLS` nas quatro tabelas, policies `app_admin_select`, colunas allowlisted do `hk_app`, negações de dados externos, escrita não autorizada e ausência de `USAGE` nos schemas de negócio para `anon` e `authenticated`.
4. Imprime apenas **OK/FALHOU** por controle. Não retorna dados de tenants, hotéis, hóspedes ou segredos. Falha com exit code 1 se algum controle não passar.

Se a conexão falhar por variável ou certificado, usar os procedimentos existentes em `docs/06-setup-supabase-dev.md` e **não** trocar para `sslmode=require` ou apontar para outro projeto.

## Passo C — validação visual, apenas depois do pré-voo verde

1. Abrir o preview autorizado do web apontando para o **HubKeep-dev**, entrar com usuário de teste Admin do grupo.
2. Confirmar que o menu `Integração Mews` aparece e a URL `/admin/mews` carrega (GET `/api/v1/mews/status`).
3. Confirmar que **sem vínculo Mews ativo** o Admin vê "Nenhum vínculo Mews ativo para este grupo" — resultado esperado, sem fabricar um vínculo nem acionar sync.
4. Com usuário de teste Gerente/Técnico, o item não deve aparecer e o GET deve retornar 403 (com autenticação válida).
5. Sem sessão, o GET deve retornar 401; ao selecionar tenant sem autorização, o dado deve permanecer inacessível.
6. Verificar os quatro idiomas e a ausência de botões de sincronização, OS e mudança de UH.

**Importante:** sem fixtures previamente autorizadas, não há motivo para números de recursos/bloqueios ou timestamps aparecerem na tela. Os testes com dados sintéticos já são cobertos pelo PostgreSQL descartável da CI. Não usar dados pessoais ou credenciais reais para forçar o preenchimento.

## Passo D — pendências para uma futura integração real

Antes de vincular uma conta Mews de verdade: aprovar fluxo de revinculação/revogação, referência opaca ao cofre e ciclo de vida de credenciais, retenção/GDPR, identificação hotel↔EnterpriseId com autorização externa, backoff e observabilidade, e aprovação específica da ativação em DEV. O V1 atual **não** dispara sincronização nem gera OS.

**Limite de autorização:** continuar o trabalho de preparação ou consultar o dev não autoriza `db push`, migração em produção ou ativação de dados reais.
