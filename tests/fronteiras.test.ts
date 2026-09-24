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
  return resultado.messages
    .filter((m) => m.ruleId === 'boundaries/dependencies')
    .map((m) => m.message);
}

const imp = (origem: string) => `import * as m from '${origem}';\nexport const x = m;\n`;

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
    ['web importando db (raiz de composição)', 'apps/web/src/x.ts', '@hubkeep/db'],
    ['web importando contratos', 'apps/web/src/x.ts', '@hubkeep/contratos'],
    ['conector importando contratos', 'apps/conector/src/x.ts', '@hubkeep/contratos'],
    ['dominio importando arquivo do próprio pacote', 'packages/dominio/src/x.ts', './index.ts'],
  ];

  it.each(permitidos)('permite: %s', async (_nome, arquivo, origem) => {
    expect(await violacoes(arquivo, imp(origem))).toEqual([]);
  });
});
