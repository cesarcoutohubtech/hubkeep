import { defineConfig } from 'vitest/config';

// Só para `pnpm ops:provisionar` (scripts/ops/provisionar-cliente.ts): roda o
// provisionamento de cliente no dev ou no staging, fora do `pnpm test`.
export default defineConfig({
  test: { include: ['test/provisionamento/executar.provisionar.ts'] },
});
