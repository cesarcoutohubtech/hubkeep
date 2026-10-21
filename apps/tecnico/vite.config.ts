// PWA do técnico (F0-11): Vite + vite-plugin-pwa. O service worker guarda a
// casca do app (HTML, JS, CSS, ícones, as fontes do @hubkeep/ui e os quatro
// catálogos, que vão dentro do JS) para abrir sem rede. As chamadas à API nunca vêm do cache: sem rede, a
// operação vai para a fila do IndexedDB (src/fila).
//
// Nome do app no manifesto e no <title>: do catálogo pt-BR, nunca texto fixo.
// O config roda no Node, que não carrega o TypeScript do pacote: o catálogo
// entra direto do JSON (export ./catalogos/* de @hubkeep/i18n).
import pt from '@hubkeep/i18n/catalogos/pt-BR.json' with { type: 'json' };
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { politicaDeConexao } from './csp';

// O petróleo do cabeçalho do PWA (--hk-menu-fundo do tema claro, ADR-038).
const COR = '#0f3d45';

const CHARSET = '<meta charset="UTF-8" />';

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    {
      name: 'hubkeep-titulo-do-catalogo',
      transformIndexHtml: (html) => html.replace('%NOME_DO_APP%', pt['tecnico.nome']),
    },
    {
      // A CSP de conexão do ambiente do build (SP2, csp.ts), logo depois do
      // charset. Só no build: o dev usa o proxy do Vite e o HMR.
      name: 'hubkeep-csp-de-conexao',
      apply: 'build',
      transformIndexHtml: (html) => {
        if (!html.includes(CHARSET)) throw new Error('index.html sem o meta charset.');
        const env = loadEnv(mode, fileURLToPath(new URL('.', import.meta.url)), 'VITE_');
        const meta = `<meta http-equiv="Content-Security-Policy" content="${politicaDeConexao(env)}" />`;
        return html.replace(CHARSET, `${CHARSET}\n    ${meta}`);
      },
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
        // woff2: as fontes Barlow do @hubkeep/ui, para a tela sem rede sair com
        // a fonte certa. O .woff (navegador antigo) fica fora do precache.
        globPatterns: ['**/*.{js,css,html,png,webmanifest,woff2}'],
        navigateFallback: 'index.html',
        // A API nunca é servida pelo service worker.
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [],
        // O push (1c, C4): o aviso chega e o toque abre o PWA (public/push-sw.js).
        importScripts: ['push-sw.js'],
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
}));
