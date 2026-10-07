// VITRINE DESCARTÁVEL: o Vite do PWA, com alias para os pacotes do monorepo (o
// motor não é dependência do PWA, e a vitrine não vai para o git).
import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const pacote = (nome: string) => path.resolve(__dirname, '../../../packages', nome, 'src/index.ts');

export default defineConfig({
  root: path.resolve(__dirname, '..'),
  plugins: [react()],
  resolve: {
    alias: {
      '@hubkeep/inteligencia': pacote('inteligencia'),
      '@hubkeep/dominio': pacote('dominio'),
      '@hubkeep/i18n': pacote('i18n'),
    },
  },
  server: { port: 5199, strictPort: true, fs: { allow: [path.resolve(__dirname, '../../..')] } },
});
