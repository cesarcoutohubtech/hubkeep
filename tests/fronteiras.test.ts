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
