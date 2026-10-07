# Vitrine das telas do Intelligence 1.0 (local, sem PR)

Código da vitrine descartável que gerou as imagens de `docs/referencia/design/intelligence-1-0/` (proposta em `docs/referencia/proposta-telas-intelligence-1-0.md`). Fica aqui só para refazer as imagens quando a proposta mudar. Não entra na `main`.

## Como rodar

1. Num worktree com `node_modules` (por exemplo, o `wt/int-motor`), copie esta pasta para `apps/tecnico/vitrine/` e ponha `/apps/tecnico/vitrine/` no `.git/info/exclude`.
2. Dentro de `apps/tecnico`: `pnpm exec vite --config vitrine/vite.vitrine.config.ts` (porta 5199).
3. Páginas: `/vitrine/index.html?tela=lista|investigacao|ativo` e `&tema=claro`. Largura de celular: `/vitrine/celular.html?tela=...` (a página põe a tela num iframe de 390 px).
4. Imagens: Chrome em modo headless, com `--window-size`, `--virtual-time-budget=8000` e `--screenshot`. O Chrome não abre janela abaixo de 500 px, e por isso o celular usa o iframe, e a imagem é cortada em 390 px de largura.
5. Apague a pasta quando terminar.

Os dados são fictícios. Os scores e as frases de "Por que estou vendo isso?" saem do `packages/inteligencia` e do catálogo em pt-BR, por alias do Vite. O texto das telas está escrito dentro da vitrine, porque ela é descartável; nas telas reais, tudo sai do catálogo.
