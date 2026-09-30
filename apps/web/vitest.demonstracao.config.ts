import { defineConfig } from 'vitest/config';

// Só para `pnpm demo:dados` (scripts/ops/dados-demonstracao.ts): roda a
// execução dos dados de demonstração no dev, fora do `pnpm test`.
export default defineConfig({
  test: { include: ['test/demonstracao/executar.demo.ts'] },
});
