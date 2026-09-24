# 05 — Prompt inicial para o Claude Code

Cole o texto abaixo na primeira sessão do Claude Code, com este pacote já na raiz do repositório vazio.

---

Você vai iniciar o desenvolvimento da Central de Manutenção EasyGov (CSC) do zero.

Antes de escrever qualquer código:

1. Leia `CLAUDE.md` e todos os arquivos de `docs/`, nesta ordem: 00, 01, 02, 03, 04.
2. Leia a migração `supabase/migrations/20260924000001_fundacao.sql` e os testes em `supabase/tests/database/`.
3. Me devolva, em até 15 linhas: o que entendeu das regras inegociáveis, qualquer contradição ou ponto obscuro que encontrou nos documentos, e o que planeja para a tarefa F0-01.

Depois da minha confirmação, execute as tarefas de `docs/04-plano-fase-0.md` uma por vez, na ordem. Para cada tarefa:

- Crie uma branch `f0-XX-descricao`.
- Implemente só o que a tarefa pede. Se precisar de algo fora do escopo, pare e me pergunte.
- Rode `pnpm lint`, `pnpm typecheck`, `pnpm test` e `supabase test db` antes de dizer que terminou.
- Me mostre o resumo do que mudou, como verificou o critério de aceite e o que ficou pendente.
- Não comece a próxima tarefa sem a minha aprovação.

Regras que valem o tempo todo:

- Não altere a semântica da migração de fundação nem os meta-testes sem um ADR novo em `docs/03-decisoes-tecnicas.md`, aprovado por mim.
- Não crie triggers, funções SQL novas nem regra de negócio no banco.
- Não use a secret key/service_role para dados de negócio.
- Se um teste de segurança falhar, a correção é no código ou na migração, nunca no teste, a menos que o teste esteja provadamente errado; nesse caso, me mostre por quê antes de mudar.
- Se uma limitação real do Supabase ou da Vercel impedir algo do plano, pare, explique e proponha alternativa em forma de ADR.
