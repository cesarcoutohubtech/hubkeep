# 08 — Checklist de MFA e acessos

Aceite da F0-13 (`docs/04`): checklist revisado pelo responsável técnico e registrado no repositório. Cada item tem estado e data. O Cesar preenche e revisa; o Claude Code não altera configuração de conta nem de acesso.

Revisão: a cada entrada ou saída de pessoa, e no mínimo antes do piloto e a cada trimestre. Hoje só existem o GitHub e o Supabase de dev. A Vercel, o staging e a produção entram quando a F0-12 for retomada.

Estados: **ok**, **pendente**, **n/a** (não existe ainda).

## GitHub (`cesarcoutohubtech/hubkeep`)

| # | Item | Estado | Data | Observação |
|---|---|---|---|---|
| G1 | 2FA ligado na conta dona do repositório | | | |
| G2 | Colaboradores: só quem precisa, com o papel mínimo (lista abaixo) | | | |
| G3 | Ruleset do `main`: `zona protegida`, lint e pgTAP obrigatórios, branch atualizada, bypass só para Repository admin e só por PR (ADR-023) | ok | 26/09/2026 | Configurado pelo Cesar |
| G4 | Tokens pessoais: com prazo de validade, só os escopos necessários, revogados os que não se usam | | | |
| G5 | Segredos do Actions: só os necessários; nenhum de staging ou produção enquanto a F0-12 estiver suspensa | | | |
| G6 | Deploy keys e apps instalados no repositório: só os necessários | | | |
| G7 | Conta de máquina do Claude Code, sem admin, com token clássico (`repo`, `workflow`, `read:org`) pelo `GH_TOKEN` local | n/a | | Entra na F0-12 (`docs/04`) |
| G8 | `.claude/settings.json` com os `deny` de merge por bypass, API de merge, ruleset, push no `main` e `gh auth *` | ok | 26/09/2026 | ADR-023, PR #30 |

Pessoas com acesso ao repositório:

| Pessoa | Papel | Desde | Motivo |
|---|---|---|---|
| | | | |

## Supabase

| # | Item | Estado | Data | Observação |
|---|---|---|---|---|
| S1 | MFA ligado em cada conta com acesso à organização | | | |
| S2 | MFA exigido na organização, se o plano oferecer | | | |
| S3 | Membros da organização: só quem precisa, com o papel mínimo (lista abaixo) | | | |
| S4 | Access tokens pessoais (`sbp_…`) com prazo, fora do ambiente da máquina quando não estão em uso, nunca usados contra staging ou produção (incidente 2) | | | |
| S5 | HubKeep-dev: Data API desligada, cadastro público desligado, JWT assimétrico (ES256), HS256 legado revogado (`docs/06`) | ok | 25/09/2026 | Conferido na pós-auditoria |
| S6 | HubKeep-dev: senha do `postgres` e dos papéis guardadas só no gerenciador de senhas | | | |
| S7 | Staging e produção: membros com acesso ao painel e ao SQL Editor, com MFA e registro de consulta manual (`docs/01`, LGPD) | n/a | | F0-12 |
| S8 | Produção: PITR ligado | n/a | | F0-12 e F0-13 |

Membros da organização:

| Pessoa | Papel | Projetos | Desde | Motivo |
|---|---|---|---|---|
| | | | | |

## Vercel

| # | Item | Estado | Data | Observação |
|---|---|---|---|---|
| V1 | Plano Pro com um membro (Cesar), MFA ligado | n/a | | Nenhum projeto por enquanto (decisão de 26/09/2026) |
| V2 | Variáveis de produção visíveis só para quem precisa; preview nunca aponta para produção | n/a | | |
| V3 | Integração com o GitHub restrita ao repositório `hubkeep` | n/a | | |

## Máquinas de quem opera

| # | Item | Estado | Data | Observação |
|---|---|---|---|---|
| M1 | Disco criptografado e bloqueio de tela | | | |
| M2 | Nenhum `.env` com segredo versionado (o `.gitignore` cobre `.env*` e `.claude/settings.local.json`) | ok | 26/09/2026 | Teste da secret key e do `.env.example` na CI |
| M3 | Gerenciador de senhas com MFA | | | |

## Revisões

| Data | Quem revisou | O que mudou |
|---|---|---|
| | | |
