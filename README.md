# Central de Manutenção EasyGov (CSC) — pacote de fundação

Premissas e ponto de partida para o desenvolvimento com o Claude Code.

## Conteúdo

| Caminho | O que é |
|---|---|
| `CLAUDE.md` | Instruções permanentes do Claude Code: regras, stack, estrutura, comandos |
| `docs/00-contexto-produto.md` | Produto, papéis, fonte de verdade, escopo do MVP e fases |
| `docs/01-arquitetura.md` | Componentes, fluxos, papéis de banco, ambientes |
| `docs/02-seguranca-multitenant-rls.md` | Fronteira banco × aplicação, RLS, modelo para tabela nova |
| `docs/03-decisoes-tecnicas.md` | ADRs, inclusive as revisões da proposta de 23/09 |
| `docs/04-plano-fase-0.md` | Tarefas F0-01 a F0-13 com critério de aceite |
| `docs/05-prompt-inicial-claude-code.md` | Texto para abrir a primeira sessão |
| `supabase/migrations/20260924000001_fundacao.sql` | Papéis, schemas, identidade, escopo, licença, staging, RLS |
| `supabase/tests/database/` | pgTAP: 12 meta-testes e 28 testes de isolamento |
| `.env.example` | Variáveis por aplicação |

## Como usar

1. Crie um repositório vazio e copie este pacote para a raiz.
2. Instale a Supabase CLI e rode `supabase init` (mantenha a pasta `supabase/` existente).
3. Abra o Claude Code na raiz e cole o prompt de `docs/05-prompt-inicial-claude-code.md`.

A migração e os testes foram validados em PostgreSQL 16 com stubs de `auth.users`, `anon` e `authenticated`. O primeiro `supabase test db` no ambiente real faz parte da tarefa F0-02.
