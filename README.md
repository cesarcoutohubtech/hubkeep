# HubKeep

Manutenção preventiva e corretiva para redes hoteleiras multi-propriedade. Primeiro cliente: grupo Slaviero.

O repositório nasceu do pacote de fundação "Central de Manutenção EasyGov (CSC)" (primeiro commit, sem alterações); o nome e os identificadores mudaram pelo ADR-012.

## Conteúdo

| Caminho | O que é |
|---|---|
| `CLAUDE.md` | Instruções permanentes do Claude Code: regras, stack, estrutura, comandos |
| `docs/00-contexto-produto.md` | Produto, papéis, fonte de verdade, escopo do MVP e fases |
| `docs/01-arquitetura.md` | Componentes, fluxos, papéis de banco, ambientes |
| `docs/02-seguranca-multitenant-rls.md` | Fronteira banco × aplicação, RLS, modelo para tabela nova |
| `docs/03-decisoes-tecnicas.md` | ADRs, inclusive as revisões da proposta de 23/09 |
| `docs/04-plano-fase-0.md` | Tarefas F0-01 a F0-13 com critério de aceite |
| `docs/05-plano-fase-1a.md` | Plano da fase 1a (corretiva) |
| `docs/referencia/05-prompt-inicial-claude-code.md` | Texto usado para abrir a primeira sessão (histórico) |
| `supabase/migrations/20260924000001_fundacao.sql` | Papéis, schemas, identidade, escopo, licença, staging, RLS |
| `supabase/tests/database/` | pgTAP: 15 meta-testes e 30 testes de isolamento |
| `docs/06-setup-supabase-dev.md` | Checklist para criar o projeto Supabase de dev |
| `.github/workflows/banco.yml` | CI com Supabase no runner e testes pgTAP |
| `.env.example` | Variáveis por aplicação |

## Como usar

1. Crie um repositório vazio e copie este pacote para a raiz.
2. Crie o projeto Supabase de dev seguindo `docs/06-setup-supabase-dev.md`. Não é preciso Docker na máquina (ADR-015).
3. Abra o Claude Code na raiz e cole o prompt de `docs/referencia/05-prompt-inicial-claude-code.md`.

A migração e os testes foram validados em PostgreSQL 16 com stubs de `auth.users`, `anon` e `authenticated`. O primeiro `supabase test db` no Supabase real faz parte da tarefa F0-02.
