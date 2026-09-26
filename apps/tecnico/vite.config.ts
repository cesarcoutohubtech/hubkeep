// PWA do técnico (F0-11): Vite + vite-plugin-pwa. O service worker guarda a
// casca do app (HTML, JS, CSS, ícones e os quatro catálogos, que vão dentro do
// JS) para abrir sem rede. As chamadas à API nunca vêm do cache: sem rede, a
// operação vai para a fila do IndexedDB (src/fila).
//
// Nome do app no manifesto e no <title>: do catálogo pt-BR, nunca texto fixo.
// O config roda no Node, que não carrega o TypeScript do pacote: o catálogo
// entra direto do JSON (export ./catalogos/* de @hubkeep/i18n).
import pt from '@hubkeep/i18n/catalogos/pt-BR.json' with { type: 'json' };
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const COR = '#0f766e';

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'hubkeep-titulo-do-catalogo',
      transformIndexHtml: (html) => html.replace('%NOME_DO_APP%', pt['tecnico.nome']),
    },
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      includeAssets: ['icones/apple-touch-icon.png'],
      manifest: {
        name: pt['tecnico.nome'],
        short_name: pt['app.nome'],
        description: pt['tecnico.descricao'],
        lang: 'pt-BR',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#ffffff',
        theme_color: COR,
        icons: [
          { src: 'icones/icone-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icones/icone-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icones/icone-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,webmanifest}'],
        navigateFallback: 'index.html',
        // A API nunca é servida pelo service worker.
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [],
      },
    }),
  ],
  server: {
    port: 5173,
    // No dev, /api vai para o web (Next em localhost:3000): mesma origem, sem CORS.
    proxy: { '/api': process.env['HK_API_DEV'] ?? 'http://localhost:3000' },
  },
  preview: {
    port: 4173,
    proxy: { '/api': process.env['HK_API_DEV'] ?? 'http://localhost:3000' },
  },
});
