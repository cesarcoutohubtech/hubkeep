// Aceite da F0-04: "regra de lint que proíbe escrita fora de
// packages/db/src/repositorios" (ADR-006). Mesmo método do teste de fronteiras:
// ESLint real, arquivo virtual posicionado no lugar testado, e um caso
// permitido para cada proibido, para a regra não passar por acidente.
import { ESLint } from 'eslint';
import { beforeAll, describe, expect, it } from 'vitest';

const eslint = new ESLint({ cwd: process.cwd() });
const REGRAS = new Set([
  'no-restricted-syntax',
  'no-restricted-imports',
  'boundaries/dependencies',
]);

beforeAll(async () => {
  await eslint.lintText('export {};\n', { filePath: 'packages/db/src/aquecimento.ts' });
}, 60_000);

async function violacoes(arquivo: string, codigo: string): Promise<string[]> {
  const [r] = await eslint.lintText(codigo, { filePath: arquivo });
  if (!r) throw new Error(`ESLint não devolveu resultado para ${arquivo}`);
  const fatais = r.messages.filter((m) => m.fatal);
  if (fatais.length > 0) throw new Error(fatais.map((m) => m.message).join('\n'));
  return r.messages.filter((m) => m.ruleId && REGRAS.has(m.ruleId)).map((m) => m.message);
}

const escrita = (metodo: string) =>
  `declare const tx: { ${metodo}(t: string): unknown };\nexport const x = tx.${metodo}('app.hotel');\n`;
const importaAuthAdmin = `import { criarProvedorConviteSupabase } from '@hubkeep/auth-admin';\nexport const x = criarProvedorConviteSupabase;\n`;
const importaTx = (origem: string) =>
  `import { transacaoDe } from '${origem}';\nexport const x = transacaoDe;\n`;

describe('escrita só em packages/db/src/repositorios', () => {
  const proibidos: [string, string, string][] = [
    ['insertInto num app', 'apps/web/src/x.ts', escrita('insertInto')],
    [
      'updateTable em packages/db fora de repositorios',
      'packages/db/src/x.ts',
      escrita('updateTable'),
    ],
    ['deleteFrom em packages/aplicacao', 'packages/aplicacao/src/x.ts', escrita('deleteFrom')],
    [
      'transacaoDe importada fora de repositorios',
      'packages/db/src/x.ts',
      importaTx('./unidade-de-trabalho'),
    ],
    [
      'transacaoDe importada num app (bloco da secret key não pode apagar esta regra)',
      'apps/web/src/app/x.ts',
      importaTx('../../../../packages/db/src/unidade-de-trabalho'),
    ],
    [
      'auth-admin (secret key) importado numa página do web',
      'apps/web/src/app/x.ts',
      importaAuthAdmin,
    ],
    ['auth-admin importado pelo PWA do técnico', 'apps/tecnico/src/x.ts', importaAuthAdmin],
  ];

  it.each(proibidos)('proíbe: %s', async (_n, arquivo, codigo) => {
    expect(await violacoes(arquivo, codigo)).not.toEqual([]);
  });

  const permitidos: [string, string, string][] = [
    ['insertInto em repositorios', 'packages/db/src/repositorios/x.ts', escrita('insertInto')],
    ['updateTable em repositorios', 'packages/db/src/repositorios/x.ts', escrita('updateTable')],
    [
      'transacaoDe importada em repositorios',
      'packages/db/src/repositorios/x.ts',
      importaTx('../unidade-de-trabalho'),
    ],
    ['leitura (selectFrom) num app', 'apps/web/src/x.ts', escrita('selectFrom')],
    ['auth-admin importado pelo servidor do web', 'apps/web/src/servidor/x.ts', importaAuthAdmin],
  ];

  it.each(permitidos)('permite: %s', async (_n, arquivo, codigo) => {
    expect(await violacoes(arquivo, codigo)).toEqual([]);
  });
});
