import type { NextConfig } from 'next';
import { cabecalhosFixos } from './src/seguranca';

const config: NextConfig = {
  // Os pacotes do monorepo exportam TypeScript fonte (exports: ./src/index.ts).
  transpilePackages: [
    '@hubkeep/aplicacao',
    '@hubkeep/auth-admin',
    '@hubkeep/contratos',
    '@hubkeep/db',
    '@hubkeep/dominio',
    '@hubkeep/i18n',
    '@hubkeep/imagem',
    '@hubkeep/ui',
  ],
  // Driver nativo do Postgres fica fora do bundle do servidor.
  serverExternalPackages: ['pg'],
  poweredByHeader: false,
  // Cabeçalhos de segurança em toda resposta, inclusive estáticos (S1, ADR-032).
  // A CSP, que leva nonce, é do proxy.ts.
  async headers() {
    return [
      { source: '/:path*', headers: cabecalhosFixos(process.env['NODE_ENV'] === 'development') },
    ];
  },
};

export default config;
