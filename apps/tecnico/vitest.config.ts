import { defineConfig } from 'vitest/config';

// Testes do PWA no Node: a fila roda sobre o fake-indexeddb, as telas são
// renderizadas com react-dom/server e o build é o vite build de verdade.
export default defineConfig({
  oxc: { jsx: { runtime: 'automatic' } },
  test: { environment: 'node', testTimeout: 60_000 },
});
