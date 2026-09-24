// ESLint do monorepo. Além das regras de TypeScript, é aqui que as fronteiras
// entre pacotes do CLAUDE.md ("Onde cada coisa mora") viram erro de lint:
//
//   apps → aplicacao → dominio          db → aplicacao, dominio (implementa as portas)
//   dominio não importa nada de IO      conector só conhece contratos (nunca o banco)
//   apps não importam Kysely nem pg     tecnico (PWA) fala só com a API
//
// A prova de que a regra morde está em tests/fronteiras.test.ts.
import js from '@eslint/js';
import boundaries from 'eslint-plugin-boundaries';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const ELEMENTOS = [
  { type: 'dominio', pattern: 'packages/dominio' },
  { type: 'aplicacao', pattern: 'packages/aplicacao' },
  { type: 'db', pattern: 'packages/db' },
  { type: 'contratos', pattern: 'packages/contratos' },
  { type: 'auth-admin', pattern: 'packages/auth-admin' },
  { type: 'web', pattern: 'apps/web' },
  { type: 'tecnico', pattern: 'apps/tecnico' },
  { type: 'conector', pattern: 'apps/conector' },
];

const para = (...types) => ({ to: { element: { types: { anyOf: types } } } });

export default tseslint.config(
  { ignores: ['**/node_modules/**', '**/dist/**', '**/.next/**', '**/.turbo/**', 'supabase/**'] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    files: ['apps/**/*.{ts,tsx}', 'packages/**/*.{ts,tsx}'],
    // Testes semeiam fixtures conectando como dono (pg direto); as fronteiras
    // valem para o código que vai para produção.
    ignores: ['apps/*/test/**', 'packages/*/test/**'],
    plugins: { boundaries },
    settings: {
      'boundaries/elements': ELEMENTOS,
      'import/resolver': {
        typescript: {
          project: ['tsconfig.base.json', '*/*/tsconfig.json'],
          noWarnOnMultipleProjects: true,
        },
      },
    },
    rules: {
      'boundaries/dependencies': [
        'error',
        {
          default: 'disallow',
          // Sem isto a regra só olha dependências locais, e os bloqueios de pg/kysely/node:*
          // abaixo nunca disparariam.
          checkAllOrigins: true,
          policies: [
            // Dentro do próprio elemento, tudo pode.
            { allow: { dependency: { relationship: { to: 'internal' } } } },
            // Pacotes externos: liberados, exceto onde uma regra abaixo proíbe.
            { allow: { to: { module: { origin: 'external' } } } },
            { allow: { to: { module: { origin: 'core' } } } },

            { from: { element: { type: 'aplicacao' } }, allow: para('dominio') },
            { from: { element: { type: 'db' } }, allow: para('aplicacao', 'dominio') },
            // auth-admin implementa a porta de convite; único dono da secret key.
            { from: { element: { type: 'auth-admin' } }, allow: para('aplicacao') },
            {
              from: { element: { type: 'web' } },
              allow: para('aplicacao', 'dominio', 'contratos', 'db', 'auth-admin'),
            },
            { from: { element: { type: 'tecnico' } }, allow: para('dominio', 'contratos') },
            { from: { element: { type: 'conector' } }, allow: para('contratos') },

            // dominio é puro: nenhum pacote externo e nenhum módulo do Node.
            {
              from: { element: { type: 'dominio' } },
              disallow: { to: { module: { origin: ['external', 'core'] } } },
            },
            // Apps não tocam o banco diretamente; só pelos repositórios de packages/db.
            {
              from: { element: { types: { anyOf: ['web', 'tecnico', 'conector'] } } },
              disallow: {
                to: { module: { origin: 'external', source: ['kysely', 'pg', 'postgres'] } },
              },
            },
          ],
        },
      ],
    },
  },
  {
    // ADR-006: escrita de negócio só em packages/db/src/repositorios, que recebe a
    // unidade de trabalho — é ela que grava auditoria e outbox na mesma transação.
    // Pega o construtor de query do Kysely; SQL cru de escrita fora dos
    // repositórios fica para a revisão de PR.
    files: ['apps/**/*.{ts,tsx}', 'packages/**/*.{ts,tsx}'],
    ignores: ['packages/db/src/repositorios/**', 'packages/**/test/**'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            'CallExpression[callee.property.name=/^(insertInto|updateTable|deleteFrom|replaceInto|mergeInto)$/]',
          message:
            'Escrita só em packages/db/src/repositorios, pela unidade de trabalho (ADR-006).',
        },
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/unidade-de-trabalho'],
              importNames: ['transacaoDe'],
              message: 'transacaoDe é só para packages/db/src/repositorios (ADR-006).',
            },
          ],
        },
      ],
    },
  },
  {
    // A secret key mora em @hubkeep/auth-admin; dentro do web, só o código de
    // servidor (src/servidor) pode importá-lo — nunca página, componente ou proxy.
    files: ['apps/**/*.{ts,tsx}'],
    ignores: ['apps/web/src/servidor/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@hubkeep/auth-admin',
              message: 'auth-admin (secret key) só em apps/web/src/servidor.',
            },
          ],
          // Repetido do bloco do ADR-006: no flat config, este bloco SUBSTITUI a
          // regra anterior nestes arquivos em vez de somar.
          patterns: [
            {
              group: ['**/unidade-de-trabalho'],
              importNames: ['transacaoDe'],
              message: 'transacaoDe é só para packages/db/src/repositorios (ADR-006).',
            },
          ],
        },
      ],
    },
  },
  {
    // Scripts de operação e configs da raiz rodam direto no Node.
    files: ['scripts/**/*.{mjs,ts}', '*.mjs'],
    languageOptions: { globals: globals.node },
  },
  prettier,
);
