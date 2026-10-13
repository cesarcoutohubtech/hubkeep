import { defineConfig } from 'vitest/config';

// Só para `pnpm ops:recalcular-inteligencia` (scripts/ops/recalcular-
// inteligencia.ts): recalcula um período do Intelligence no dev ou no
// staging, fora do `pnpm test`.
export default defineConfig({
  test: { include: ['test/recalculo/executar.recalcular.ts'], reporters: ['verbose'] },
});
