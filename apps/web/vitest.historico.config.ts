import { defineConfig } from 'vitest/config';

// Só para `pnpm demo:historico` (scripts/ops/historico-demonstracao.ts): grava
// o histórico de demonstração do Intelligence no dev, fora do `pnpm test`.
export default defineConfig({
  test: { include: ['test/demonstracao/executar-historico.demo.ts'] },
});
