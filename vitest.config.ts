import { defineConfig } from 'vitest/config';

// Testes da raiz: verificações de arquitetura do monorepo. Os testes de cada
// pacote rodam pelo turbo, com a configuração do próprio pacote.
export default defineConfig({
  test: { include: ['tests/**/*.test.ts'] },
});
