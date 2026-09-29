// ESLint do monorepo. Além das regras de TypeScript, é aqui que as fronteiras
// entre pacotes do CLAUDE.md ("Onde cada coisa mora") viram erro de lint:
//
//   apps → aplicacao → dominio          db → aplicacao, dominio (implementa as portas)
//   dominio não importa nada de IO      conector só conhece contratos (nunca o banco)
//   apps não importam Kysely nem pg     tecnico (PWA) fala só com a API
//   no web, só src/servidor importa db e auth-admin
//   entre pacotes, só pelo nome (@hubkeep/...), nunca por caminho relativo
//   Kysely e execução direta de consulta, só em packages/db
//   i18n (catálogos) roda também no navegador: sem módulo do Node
//   nenhum texto de interface fixo nos apps: sai do catálogo (ADR-022)
//
// A prova de que a regra morde está em tests/fronteiras.test.ts.
import js from '@eslint/js';
import boundaries from 'eslint-plugin-boundaries';
import formatjs from 'eslint-plugin-formatjs';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const ELEMENTOS = [
  { type: 'dominio', pattern: 'packages/dominio' },
  { type: 'aplicacao', pattern: 'packages/aplicacao' },
  { type: 'db', pattern: 'packages/db' },
  { type: 'contratos', pattern: 'packages/contratos' },
  { type: 'auth-admin', pattern: 'packages/auth-admin' },
  { type: 'i18n', pattern: 'packages/i18n' },
  { type: 'imagem', pattern: 'packages/imagem' },
  // Filho de web: o código de servidor do Next (raiz de composição, contexto,
  // http). É o único trecho do web que enxerga db e auth-admin; rota, página e
  // componente chegam ao banco e ao Auth por ele.
  { type: 'web-servidor', pattern: 'apps/web/src/servidor' },
  { type: 'web', pattern: 'apps/web' },
  { type: 'tecnico', pattern: 'apps/tecnico' },
  { type: 'conector', pattern: 'apps/conector' },
];
const TIPOS = ELEMENTOS.map((e) => e.type);

const para = (...types) => ({ to: { element: { types: { anyOf: types } } } });

// Usados em mais de um bloco: no flat config, um bloco posterior que configura
// a mesma regra SUBSTITUI a anterior nos arquivos em comum, em vez de somar.
const ESCRITA = {
  selector:
    'CallExpression[callee.property.name=/^(insertInto|updateTable|deleteFrom|replaceInto|mergeInto)$/]',
  message: 'Escrita só em packages/db/src/repositorios, pela unidade de trabalho (ADR-006).',
};
// S1 (ADR-032): HTML cru na página abre caminho para XSS. Proibido em todo o
// repositório, código de produção e teste.
const HTML_CRU = [
  {
    selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
    message: 'dangerouslySetInnerHTML é proibido: o React já escapa o texto (S1, ADR-032).',
  },
  {
    selector: "Property[key.name='dangerouslySetInnerHTML']",
    message: 'dangerouslySetInnerHTML é proibido: o React já escapa o texto (S1, ADR-032).',
  },
  {
    selector:
      'AssignmentExpression > MemberExpression.left[property.name=/^(innerHTML|outerHTML)$/]',
    message: 'innerHTML/outerHTML é proibido: monte o elemento pelo React (S1, ADR-032).',
  },
  {
    selector:
      "CallExpression[callee.property.name='insertAdjacentHTML'], CallExpression[callee.object.name='document'][callee.property.name=/^(write|writeln)$/]",
    message: 'HTML cru no DOM é proibido (S1, ADR-032).',
  },
];
// S1 (ADR-032): SQL cru e identificador dinâmico montam SQL a partir de texto.
// Fora de packages/db eles escapariam da revisão dos repositórios, mesmo que o
// `sql` chegasse por outro caminho que não o import do Kysely (já barrado).
const SQL_CRU = [
  {
    selector:
      "MemberExpression[object.name='sql'][property.name=/^(raw|id|ref|table|lit)$/], MemberExpression[object.name='sql'][property.value=/^(raw|id|ref|table|lit)$/]",
    message:
      'sql.raw e identificador dinâmico (sql.id/ref/table/lit) só em packages/db (S1, ADR-032).',
  },
  {
    selector: "MemberExpression[object.property.name='dynamic'][property.name=/^(ref|table)$/]",
    message: 'Identificador dinâmico do Kysely só em packages/db (S1, ADR-032).',
  },
];
const TRANSACAO_DE = {
  group: ['**/unidade-de-trabalho'],
  importNames: ['transacaoDe'],
  message: 'transacaoDe é só para packages/db/src/repositorios (ADR-006).',
};

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
      // Vale a ÚLTIMA política que casar com a dependência: cada proibição vem
      // depois da liberação que ela restringe.
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

            // aplicacao valida idioma, formato regional e fuso pelas listas do i18n.
            { from: { element: { type: 'aplicacao' } }, allow: para('dominio', 'i18n') },
            { from: { element: { type: 'db' } }, allow: para('aplicacao', 'dominio') },
            // auth-admin implementa a porta de convite; único dono da secret key.
            { from: { element: { type: 'auth-admin' } }, allow: para('aplicacao') },
            // Rota, página, componente e proxy não importam db nem auth-admin.
            {
              from: { element: { type: 'web' } },
              allow: para('aplicacao', 'dominio', 'contratos', 'i18n', 'imagem', 'web-servidor'),
            },
            {
              from: { element: { type: 'web-servidor' } },
              allow: para('aplicacao', 'dominio', 'contratos', 'i18n', 'db', 'auth-admin'),
            },
            {
              from: { element: { type: 'tecnico' } },
              allow: para('dominio', 'contratos', 'i18n', 'imagem'),
            },
            { from: { element: { type: 'conector' } }, allow: para('contratos') },

            // dominio é puro: nenhum pacote externo e nenhum módulo do Node.
            {
              from: { element: { type: 'dominio' } },
              disallow: { to: { module: { origin: ['external', 'core'] } } },
            },
            // i18n vai no bundle do navegador (web e PWA): nenhum módulo do Node.
            {
              from: { element: { type: 'i18n' } },
              disallow: { to: { module: { origin: 'core' } } },
              message: 'packages/i18n roda no navegador: sem módulo do Node.',
            },
            // imagem é canvas no navegador (web e PWA): nenhum pacote externo nem módulo do Node.
            {
              from: { element: { type: 'imagem' } },
              disallow: { to: { module: { origin: ['external', 'core'] } } },
              message: 'packages/imagem roda no navegador: sem pacote externo nem módulo do Node.',
            },
            // Apps não tocam o banco diretamente; só pelos repositórios de packages/db.
            {
              from: {
                element: { types: { anyOf: ['web', 'web-servidor', 'tecnico', 'conector'] } },
              },
              disallow: { to: { module: { origin: 'external', source: ['pg', 'postgres'] } } },
            },
            // Kysely, inclusive o `sql` de SQL cru, só em packages/db (ADR-016): fora
            // dele uma consulta escaparia dos repositórios. As fronteiras olham
            // import, export ... from, import() e require.
            {
              from: { element: { types: { anyOf: TIPOS.filter((t) => t !== 'db') } } },
              disallow: { to: { module: { origin: 'external', source: 'kysely' } } },
              message: 'Kysely só em packages/db; fora dele, use os repositórios (ADR-016).',
            },
            // Entre elementos, só pelo nome do pacote. Um caminho relativo até os
            // fontes de outro pacote (../../../../packages/db/src/conexao) alcança o
            // que o index não exporta — pool, Kysely, transacaoDe — e passava sempre
            // que o par de elementos era permitido.
            {
              disallow: { ...para(...TIPOS), dependency: { source: '!@hubkeep/**' } },
              message: 'Importe outro pacote pelo nome (@hubkeep/...), não por caminho relativo.',
            },
            // ...e devolve o caminho relativo a quem é do mesmo app ou pacote: o
            // próprio elemento e a rota/página chamando o servidor do web. O plugin
            // não reconhece web-servidor como filho de web (parents vem vazio), por
            // isso o par é liberado pelo tipo, não pela relação.
            { allow: { dependency: { relationship: { to: 'internal' } } } },
            { from: { element: { type: 'web' } }, allow: para('web-servidor') },
          ],
        },
      ],
    },
  },
  {
    // S1 (ADR-032): HTML cru em qualquer lugar; SQL cru fora de packages/db.
    // Os blocos abaixo que configuram no-restricted-syntax SUBSTITUEM este nos
    // arquivos deles, e por isso repetem as mesmas listas.
    files: ['**/*.{ts,tsx,js,jsx,mjs}'],
    ignores: ['packages/db/**'],
    rules: { 'no-restricted-syntax': ['error', ...HTML_CRU, ...SQL_CRU] },
  },
  {
    files: ['packages/db/**/*.{ts,tsx,js,mjs}'],
    rules: { 'no-restricted-syntax': ['error', ...HTML_CRU] },
  },
  {
    // ADR-006: escrita de negócio só em packages/db/src/repositorios, que recebe a
    // unidade de trabalho — é ela que grava auditoria e outbox na mesma transação.
    // Pega o construtor de query do Kysely; SQL cru de escrita fora dos
    // repositórios fica para a revisão de PR.
    files: ['apps/**/*.{ts,tsx}', 'packages/**/*.{ts,tsx}'],
    ignores: ['packages/db/src/repositorios/**', 'packages/**/test/**'],
    rules: {
      // Aqui só sobra packages/db fora dos repositórios: o bloco seguinte
      // substitui este no resto. SQL cru é permitido em packages/db.
      'no-restricted-syntax': ['error', ESCRITA, ...HTML_CRU],
      'no-restricted-imports': ['error', { patterns: [TRANSACAO_DE] }],
    },
  },
  {
    // ADR-016: fora de packages/db, nada de executar consulta por fora dos
    // repositórios. O import de kysely já é barrado pelas fronteiras; isto pega
    // o executor que chegasse por outro caminho (um objeto repassado, um `any`).
    files: ['apps/**/*.{ts,tsx}', 'packages/**/*.{ts,tsx}'],
    ignores: ['packages/db/**', 'packages/**/test/**'],
    rules: {
      'no-restricted-syntax': [
        'error',
        // Repetido do bloco do ADR-006, que este substitui nestes arquivos.
        ESCRITA,
        {
          selector:
            "MemberExpression[property.name='executeQuery'], MemberExpression[property.value='executeQuery']",
          message: 'Execução direta de consulta só em packages/db (ADR-016).',
        },
        {
          selector: "Identifier[name='CompiledQuery']",
          message: 'CompiledQuery só em packages/db (ADR-016).',
        },
        ...HTML_CRU,
        ...SQL_CRU,
      ],
    },
  },
  {
    // A secret key mora em @hubkeep/auth-admin; dentro do web, só o código de
    // servidor (src/servidor) pode importá-lo — nunca página, componente ou proxy.
    // As fronteiras já barram; aqui a mensagem diz o porquê.
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
          // Repetido do bloco do ADR-006, que este substitui nestes arquivos.
          patterns: [TRANSACAO_DE],
        },
      ],
    },
  },
  {
    // Regra 11 do CLAUDE.md (ADR-022): nenhum texto de interface fixo nos apps.
    // Texto em JSX e em atributos exibidos (aria-*, placeholder, title, alt,
    // label) sai do catálogo de @hubkeep/i18n. A prova está em
    // tests/fronteiras.test.ts.
    files: ['apps/**/*.tsx'],
    ignores: ['apps/*/test/**'],
    plugins: { formatjs },
    rules: {
      'formatjs/no-literal-string-in-jsx': [
        'error',
        { props: { include: [['*', '{label,placeholder,title,alt,aria-label}']] } },
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
