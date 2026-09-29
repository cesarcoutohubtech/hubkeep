import type { NextConfig } from 'next';

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
  ],
  // Driver nativo do Postgres fica fora do bundle do servidor.
  serverExternalPackages: ['pg'],
  poweredByHeader: false,
};

export default config;
