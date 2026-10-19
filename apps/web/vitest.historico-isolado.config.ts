import { defineConfig } from 'vitest/config';

// Executa exclusivamente o segundo histórico isolado. Fora de pnpm test
// e de pnpm demo:historico. O modo padrão é só de verificação sem writes.
export default defineConfig({
  test: { include: ['test/demonstracao/executar-historico-isolado.demo.ts'] },
});
