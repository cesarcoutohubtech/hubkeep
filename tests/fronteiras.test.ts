// Aceite da F0-01: "um import proibido faz o lint falhar".
//
// Cada caso roda o ESLint de verdade, com a configuração do repositório, sobre
// um arquivo virtual posicionado dentro do pacote que está sendo testado. Os
// casos permitidos existem para provar que a regra não passa por acidente: se a
// configuração quebrasse e proibisse tudo, os casos proibidos continuariam
// verdes e só estes acusariam.
import { ESLint } from 'eslint';
import { beforeAll, describe, expect, it } from 'vitest';

const eslint = new ESLint({ cwd: process.cwd() });
// As fronteiras são do eslint-plugin-boundaries; execução direta de consulta é
// no-restricted-syntax, e a mensagem de auth-admin pelo nome, no-restricted-imports.
const REGRAS = new Set([
  'boundaries/dependencies',
  'no-restricted-syntax',
  'no-restricted-imports',
  'formatjs/no-literal-string-in-jsx',
]);

// O primeiro lint carrega a config, o typescript-eslint e o resolver — vários
// segundos a frio. Sem este aquecimento, o custo caía no primeiro caso e ele
// estourava o timeout padrão de 5 s de forma intermitente.
beforeAll(async () => {
  await eslint.lintText('export {};\n', { filePath: 'packages/dominio/src/aquecimento.ts' });
}, 60_000);

async function violacoes(arquivo: string, codigo: string): Promise<string[]> {
  const [resultado] = await eslint.lintText(codigo, { filePath: arquivo });
  if (!resultado) throw new Error(`ESLint não devolveu resultado para ${arquivo}`);
  const fatais = resultado.messages.filter((m) => m.fatal);
  if (fatais.length > 0) throw new Error(fatais.map((m) => m.message).join('\n'));
  return resultado.messages.filter((m) => m.ruleId && REGRAS.has(m.ruleId)).map((m) => m.message);
}

const imp = (origem: string) => `import * as m from '${origem}';\nexport const x = m;\n`;

// Arquivos reais do web: o resolver precisa achar o alvo dos imports relativos.
const ROTA = 'apps/web/src/app/api/v1/x/route.ts';
const PAGINA = 'apps/web/src/app/page.tsx';
const COMPOSICAO = 'apps/web/src/servidor/composicao.ts';

describe('fronteiras entre pacotes', () => {
  const proibidos: [string, string, string][] = [
    ['dominio importando db pelo nome do pacote', 'packages/dominio/src/x.ts', '@hubkeep/db'],
    [
      'dominio importando db por caminho relativo',
      'packages/dominio/src/x.ts',
      '../../db/src/index.ts',
    ],
    ['dominio importando aplicacao', 'packages/dominio/src/x.ts', '@hubkeep/aplicacao'],
    ['dominio importando pacote externo de IO', 'packages/dominio/src/x.ts', 'pg'],
    ['dominio importando módulo do Node', 'packages/dominio/src/x.ts', 'node:fs'],
    ['aplicacao importando db (inverte a porta)', 'packages/aplicacao/src/x.ts', '@hubkeep/db'],
    [
      'conector importando db (o agente nunca fala com o banco)',
      'apps/conector/src/x.ts',
      '@hubkeep/db',
    ],
    ['tecnico importando db', 'apps/tecnico/src/x.ts', '@hubkeep/db'],
    ['web importando kysely direto', 'apps/web/src/x.ts', 'kysely'],
    ['web importando pg direto', 'apps/web/src/x.ts', 'pg'],
    ['servidor do web importando pg direto', COMPOSICAO, 'pg'],

    // Só src/servidor do web vê db e auth-admin.
    ['rota da API importando db', ROTA, '@hubkeep/db'],
    ['página importando db', PAGINA, '@hubkeep/db'],
    ['rota da API importando auth-admin', ROTA, '@hubkeep/auth-admin'],

    // Entre pacotes, só pelo nome: o caminho relativo alcança o que o index não exporta.
    [
      'servidor do web importando db por caminho relativo',
      COMPOSICAO,
      '../../../../packages/db/src/conexao',
    ],
    [
      'servidor do web importando db por caminho relativo, com .ts',
      COMPOSICAO,
      '../../../../packages/db/src/conexao.ts',
    ],
    [
      'rota da API importando db por caminho relativo',
      ROTA,
      '../../../../../../../packages/db/src/conexao',
    ],
    ['página importando db por caminho relativo', PAGINA, '../../../../packages/db/src/conexao.ts'],
    [
      'web importando aplicacao por caminho relativo',
      'apps/web/src/x.ts',
      '../../../packages/aplicacao/src/index.ts',
    ],
    [
      'aplicacao importando dominio por caminho relativo',
      'packages/aplicacao/src/x.ts',
      '../../dominio/src/index.ts',
    ],
    [
      'db importando aplicacao por caminho relativo',
      'packages/db/src/x.ts',
      '../../aplicacao/src/index.ts',
    ],
    [
      'conector importando contratos por caminho relativo',
      'apps/conector/src/x.ts',
      '../../../packages/contratos/src/index.ts',
    ],
    // i18n vai no bundle do navegador; dominio continua puro; o conector não exibe nada.
    ['i18n importando módulo do Node', 'packages/i18n/src/x.ts', 'node:fs'],
    ['i18n importando dominio', 'packages/i18n/src/x.ts', '@hubkeep/dominio'],
    ['dominio importando i18n', 'packages/dominio/src/x.ts', '@hubkeep/i18n'],
    ['conector importando i18n', 'apps/conector/src/x.ts', '@hubkeep/i18n'],
    // imagem é código de navegador, só para as telas do web e o PWA.
    ['imagem importando módulo do Node', 'packages/imagem/src/x.ts', 'node:fs'],
    ['imagem importando pacote externo', 'packages/imagem/src/x.ts', 'zod'],
    ['imagem importando dominio', 'packages/imagem/src/x.ts', '@hubkeep/dominio'],
    ['servidor do web importando imagem', COMPOSICAO, '@hubkeep/imagem'],
    ['aplicacao importando imagem', 'packages/aplicacao/src/x.ts', '@hubkeep/imagem'],
    // O Intelligence depende do núcleo, nunca o contrário (decisão de 30/09/2026).
    ['dominio importando inteligencia', 'packages/dominio/src/x.ts', '@hubkeep/inteligencia'],
    ['aplicacao importando inteligencia', 'packages/aplicacao/src/x.ts', '@hubkeep/inteligencia'],
    ['db importando inteligencia', 'packages/db/src/x.ts', '@hubkeep/inteligencia'],
    ['servidor do web importando inteligencia', COMPOSICAO, '@hubkeep/inteligencia'],
    ['rota da API importando inteligencia', ROTA, '@hubkeep/inteligencia'],
    ['PWA importando inteligencia', 'apps/tecnico/src/x.ts', '@hubkeep/inteligencia'],
    [
      'dominio importando inteligencia por caminho relativo',
      'packages/dominio/src/x.ts',
      '../../inteligencia/src/index.ts',
    ],
    // ...e é puro como o dominio.
    ['inteligencia importando db', 'packages/inteligencia/src/x.ts', '@hubkeep/db'],
    ['inteligencia importando aplicacao', 'packages/inteligencia/src/x.ts', '@hubkeep/aplicacao'],
    ['inteligencia importando pacote externo', 'packages/inteligencia/src/x.ts', 'zod'],
    ['inteligencia importando módulo do Node', 'packages/inteligencia/src/x.ts', 'node:fs'],
    // B11 (docs/11): pg só em packages/db, e aplicacao sem módulo do Node.
    ['aplicacao importando pg', 'packages/aplicacao/src/x.ts', 'pg'],
    ['auth-admin importando pg', 'packages/auth-admin/src/x.ts', 'pg'],
    ['contratos importando postgres', 'packages/contratos/src/x.ts', 'postgres'],
    ['aplicacao importando módulo do Node', 'packages/aplicacao/src/x.ts', 'node:fs'],
    ['aplicacao importando módulo do Node sem prefixo', 'packages/aplicacao/src/x.ts', 'crypto'],
  ];

  it.each(proibidos)('proíbe: %s', async (_nome, arquivo, origem) => {
    expect(await violacoes(arquivo, imp(origem))).not.toEqual([]);
  });

  const permitidos: [string, string, string][] = [
    ['aplicacao importando dominio', 'packages/aplicacao/src/x.ts', '@hubkeep/dominio'],
    [
      'db importando aplicacao (implementa as portas)',
      'packages/db/src/x.ts',
      '@hubkeep/aplicacao',
    ],
    ['db importando kysely', 'packages/db/src/x.ts', 'kysely'],
    ['servidor do web importando db (raiz de composição)', COMPOSICAO, '@hubkeep/db'],
    ['servidor do web importando auth-admin', COMPOSICAO, '@hubkeep/auth-admin'],
    ['web importando contratos', 'apps/web/src/x.ts', '@hubkeep/contratos'],
    ['rota da API importando aplicacao', ROTA, '@hubkeep/aplicacao'],
    ['conector importando contratos', 'apps/conector/src/x.ts', '@hubkeep/contratos'],
    ['dominio importando arquivo do próprio pacote', 'packages/dominio/src/x.ts', './index.ts'],
    ['rota da API importando o servidor do web', ROTA, '../../../../servidor/composicao'],
    ['servidor do web importando arquivo do próprio servidor', COMPOSICAO, './http'],
    [
      'aplicacao importando i18n (valida idioma e fuso)',
      'packages/aplicacao/src/x.ts',
      '@hubkeep/i18n',
    ],
    ['página importando i18n', PAGINA, '@hubkeep/i18n'],
    ['servidor do web importando i18n', COMPOSICAO, '@hubkeep/i18n'],
    ['PWA importando i18n', 'apps/tecnico/src/x.ts', '@hubkeep/i18n'],
    ['i18n importando formatjs', 'packages/i18n/src/x.ts', '@formatjs/intl'],
    ['página importando imagem', PAGINA, '@hubkeep/imagem'],
    ['PWA importando imagem', 'apps/tecnico/src/x.ts', '@hubkeep/imagem'],
    ['inteligencia importando dominio', 'packages/inteligencia/src/x.ts', '@hubkeep/dominio'],
    ['inteligencia importando i18n', 'packages/inteligencia/src/x.ts', '@hubkeep/i18n'],
    [
      'inteligencia importando arquivo do próprio pacote',
      'packages/inteligencia/src/x.ts',
      './score.ts',
    ],
    ['db importando pg', 'packages/db/src/x.ts', 'pg'],
  ];

  it.each(permitidos)('permite: %s', async (_nome, arquivo, origem) => {
    expect(await violacoes(arquivo, imp(origem))).toEqual([]);
  });
});

describe('Kysely e execução direta de consulta só em packages/db (ADR-016)', () => {
  const sqlDoKysely = `import { sql } from 'kysely';\nexport const x = sql\`select 1\`;\n`;
  const namespaceDoKysely = `import * as k from 'kysely';\nexport const x = k.sql;\n`;
  const reexportaSql = `export { sql } from 'kysely';\n`;
  const importDinamico = `export const x = import('kysely');\n`;
  const executeQuery = `declare const db: { executeQuery(q: unknown): unknown };\nexport const x = db.executeQuery({});\n`;
  const executeQueryComputado = `declare const db: { executeQuery(q: unknown): unknown };\nexport const x = db['executeQuery']({});\n`;
  const compiledQuery = `declare const CompiledQuery: { raw(s: string): unknown };\nexport const x = CompiledQuery.raw('select 1');\n`;

  const proibidos: [string, string, string][] = [
    ['sql do Kysely no servidor do web', COMPOSICAO, sqlDoKysely],
    ['sql do Kysely em aplicacao', 'packages/aplicacao/src/x.ts', sqlDoKysely],
    ['namespace do Kysely em aplicacao', 'packages/aplicacao/src/x.ts', namespaceDoKysely],
    ['sql do Kysely reexportado em aplicacao', 'packages/aplicacao/src/x.ts', reexportaSql],
    ['import() do Kysely em aplicacao', 'packages/aplicacao/src/x.ts', importDinamico],
    ['executeQuery no servidor do web', COMPOSICAO, executeQuery],
    ['executeQuery por propriedade computada', COMPOSICAO, executeQueryComputado],
    ['executeQuery em aplicacao', 'packages/aplicacao/src/x.ts', executeQuery],
    ['CompiledQuery no servidor do web', COMPOSICAO, compiledQuery],
    ['CompiledQuery em aplicacao', 'packages/aplicacao/src/x.ts', compiledQuery],
  ];

  it.each(proibidos)('proíbe: %s', async (_n, arquivo, codigo) => {
    expect(await violacoes(arquivo, codigo)).not.toEqual([]);
  });

  const permitidos: [string, string, string][] = [
    ['sql do Kysely em packages/db', 'packages/db/src/consultas.ts', sqlDoKysely],
    ['executeQuery em packages/db', 'packages/db/src/consultas.ts', executeQuery],
    ['CompiledQuery em packages/db', 'packages/db/src/consultas.ts', compiledQuery],
  ];

  it.each(permitidos)('permite: %s', async (_n, arquivo, codigo) => {
    expect(await violacoes(arquivo, codigo)).toEqual([]);
  });
});

// S1 (ADR-032): SQL cru e identificador dinâmico só em packages/db; HTML cru
// em lugar nenhum, nem em teste.
describe('SQL cru fora de packages/db e HTML cru em qualquer lugar (S1, ADR-032)', () => {
  const sqlDe = (chamada: string) =>
    `declare const sql: Record<string, (s: string) => unknown>;
export const x = ${chamada};
`;
  const dinamico = `declare const db: { dynamic: { ref(s: string): unknown } };
export const x = db.dynamic.ref('nome');
`;
  const perigoso = `export const x = <div dangerouslySetInnerHTML={{ __html: '<b>1</b>' }} />;
`;
  const perigosoSemJsx = `declare const h: (t: string, p: object) => unknown;
export const x = h('div', { dangerouslySetInnerHTML: { __html: '' } });
`;
  const innerHtml = `export function f(el: HTMLElement) {
  el.innerHTML = '<b>1</b>';
}
`;
  const adjacente = `export function f(el: HTMLElement) {
  el.insertAdjacentHTML('beforeend', '<b>1</b>');
}
`;

  const proibidos: [string, string, string][] = [
    ['sql.raw no servidor do web', COMPOSICAO, sqlDe("sql.raw('select 1')")],
    ['sql.raw por propriedade computada', COMPOSICAO, sqlDe("sql['raw']('select 1')")],
    ['sql.id em aplicacao', 'packages/aplicacao/src/x.ts', sqlDe("sql.id('tabela')")],
    ['sql.ref em aplicacao', 'packages/aplicacao/src/x.ts', sqlDe("sql.ref('coluna')")],
    ['sql.table no PWA', 'apps/tecnico/src/x.ts', sqlDe("sql.table('t')")],
    ['sql.lit em teste da raiz', 'tests/x.test.ts', sqlDe("sql.lit('v')")],
    ['dynamic.ref do Kysely no servidor do web', COMPOSICAO, dinamico],
    ['dangerouslySetInnerHTML numa página', 'apps/web/src/app/x.tsx', perigoso],
    ['dangerouslySetInnerHTML no PWA', 'apps/tecnico/src/x.tsx', perigoso],
    ['dangerouslySetInnerHTML num teste', 'apps/web/test/x.test.tsx', perigoso],
    ['dangerouslySetInnerHTML sem JSX', 'packages/imagem/src/x.ts', perigosoSemJsx],
    ['dangerouslySetInnerHTML em packages/db', 'packages/db/src/repositorios/x.tsx', perigoso],
    ['innerHTML no PWA', 'apps/tecnico/src/x.ts', innerHtml],
    ['insertAdjacentHTML no web', 'apps/web/src/cliente/x.ts', adjacente],
  ];

  it.each(proibidos)('proíbe: %s', async (_n, arquivo, codigo) => {
    expect(await violacoes(arquivo, codigo)).not.toEqual([]);
  });

  const permitidos: [string, string, string][] = [
    ['sql.raw em packages/db', 'packages/db/src/consultas.ts', sqlDe("sql.raw('select 1')")],
    ['sql.join fora de packages/db', 'packages/aplicacao/src/x.ts', sqlDe('sql.join([])')],
    [
      'textContent no PWA',
      'apps/tecnico/src/x.ts',
      `export function f(el: HTMLElement) {
  el.textContent = 'x';
}
`,
    ],
  ];

  it.each(permitidos)('permite: %s', async (_n, arquivo, codigo) => {
    expect(await violacoes(arquivo, codigo)).toEqual([]);
  });
});

// Aceite da F0-10b: "um texto fixo proposital num componente derruba o lint"
// (regra 11 do CLAUDE.md, ADR-022). O texto de tela sai do catálogo.
describe('nenhum texto de interface fixo nos apps (ADR-022)', () => {
  const COMPONENTE = 'apps/web/src/app/componente-de-teste.tsx';
  const PWA = 'apps/tecnico/src/componente-de-teste.tsx';
  const tela = (jsx: string) =>
    `declare const t: (c: string) => string;
export const C = () => ${jsx};
`;

  const proibidos: [string, string, string][] = [
    ['texto solto no JSX', COMPONENTE, '<p>Salvar alterações</p>'],
    ['texto em expressão no JSX', COMPONENTE, "<p>{'Salvar'}</p>"],
    ['texto em ternário no JSX', COMPONENTE, "<p>{Math.random() > 0.5 ? 'Sim' : 'Não'}</p>"],
    ['placeholder fixo', COMPONENTE, '<input placeholder="E-mail" />'],
    ['aria-label fixo', COMPONENTE, '<button aria-label="Fechar" />'],
    ['alt fixo', COMPONENTE, '<img alt="Logo" src="/x.png" />'],
    ['label fixo em componente', COMPONENTE, '<Campo label="Nome" />'],
    // B3 (docs/11): as props de texto dos nossos componentes.
    ['rotulo fixo em componente', COMPONENTE, '<Campo rotulo="Nome" />'],
    ['titulo fixo em componente', COMPONENTE, '<Campo titulo="Detalhe" />'],
    ['mensagem fixa em componente', PWA, '<Campo mensagem="Sem rede" />'],
    ['texto solto no PWA', PWA, '<p>Fila do dia</p>'],
  ];

  const campo = `declare const Campo: (p: Record<string, string>) => null;
`;
  it.each(proibidos)('proíbe: %s', async (_n, arquivo, jsx) => {
    const codigo = jsx.startsWith('<Campo') ? campo + tela(jsx) : tela(jsx);
    expect(await violacoes(arquivo, codigo)).not.toEqual([]);
  });

  // B3 (docs/11): o texto que o JSX não mostra, mas o usuário lê.
  const foraDoJsx: [string, string, string][] = [
    ['alert com texto fixo', PWA, "alert('Salvo');"],
    ['confirm com texto fixo', COMPONENTE, 'confirm(`Concluir a OS?`);'],
    ['window.prompt com texto fixo', COMPONENTE, "window.prompt('Motivo');"],
    ['document.title fixo', COMPONENTE, "document.title = 'HubKeep — Chamados';"],
  ];

  it.each(foraDoJsx)('proíbe: %s', async (_n, arquivo, linha) => {
    expect(
      await violacoes(
        arquivo,
        `export function f() {
  ${linha}
}
`,
      ),
    ).not.toEqual([]);
  });

  it('permite o diálogo e o título com texto do catálogo', async () => {
    const codigo = `declare const t: (c: string) => string;
export function f() {
  if (confirm(t('tecnico.os.concluir.confirmar'))) alert(t('app.nome'));
  document.title = t('app.nome');
}
`;
    expect(await violacoes(PWA, codigo)).toEqual([]);
  });

  const permitidos: [string, string, string][] = [
    ['texto do catálogo', COMPONENTE, "<p>{t('app.nome')}</p>"],
    ['placeholder do catálogo', COMPONENTE, "<input placeholder={t('login.campo.email')} />"],
    [
      'atributo técnico (type, name, autoComplete)',
      COMPONENTE,
      '<input type="email" name="email" autoComplete="email" />',
    ],
  ];

  it.each(permitidos)('permite: %s', async (_n, arquivo, jsx) => {
    expect(await violacoes(arquivo, tela(jsx))).toEqual([]);
  });
});
