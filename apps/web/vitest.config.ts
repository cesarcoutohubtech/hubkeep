import { defineConfig } from 'vitest/config';

// O tsconfig do Next usa jsx: "preserve" (quem transforma é o Next). Nos testes
// que renderizam telas (test/telas-i18n.test.tsx), o Vite transforma o JSX.
export default defineConfig({
  oxc: { jsx: { runtime: 'automatic' } },
});
