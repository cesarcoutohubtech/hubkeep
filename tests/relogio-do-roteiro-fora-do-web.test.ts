// Guarda da montagem com o relógio do roteiro (condição do Cesar ao aprovar o
// pedido do Intelligence, 13/10/2026; docs/diario-fase-1b.md): a montagem
// serve só ao gerador do histórico e aos testes, e o web em funcionamento
// continua com o relógio do sistema, sem parâmetro para trocá-lo.
//   1. nada do código em funcionamento (apps/web/src, apps/tecnico, apps/conector
//      e packages/*/src) importa a montagem;
//   2. no web, só a composição importa as fábricas, e ela as chama uma vez,
//      com o relogioDoSistema;
//   3. a opção relogioDoRoteiro do criarAcessoBanco só aparece no packages/db
//      (a definição e os testes) e na montagem;
//   4. controle: a montagem usa a opção e as fábricas, então o teste enxerga o
//      que procura.
// A recusa contra produção tem teste próprio (montagem-com-relogio.test.ts).
// Este arquivo está na zona protegida (zona-protegida.yml).
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

const MONTAGEM = join('apps', 'web', 'test', 'demonstracao', 'montagem-com-relogio.ts');
const COMPOSICAO = join('apps', 'web', 'src', 'servidor', 'composicao.ts');
const ESTE = join('tests', 'relogio-do-roteiro-fora-do-web.test.ts');

function arquivos(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (e.name === 'node_modules' || e.name === 'dist' || e.name === '.next') return [];
    const caminho = join(dir, e.name);
    if (e.isDirectory()) return arquivos(caminho);
    return /\.(ts|tsx|mts|js|mjs)$/.test(e.name) ? [caminho] : [];
  });
}

const pacotes = readdirSync('packages', { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => join('packages', e.name, 'src'));
const EM_FUNCIONAMENTO = [
  join('apps', 'web', 'src'),
  join('apps', 'tecnico', 'src'),
  join('apps', 'conector', 'src'),
  ...pacotes,
].flatMap(arquivos);
const TODO_O_CODIGO = ['apps', 'packages', 'scripts', 'tests'].flatMap(arquivos);

// import ... from '...', export ... from '...', import('...') e require('...').
const ORIGENS = /(?:from\s*|import\s*\(\s*|require\s*\(\s*)['"]([^'"]+)['"]/g;
const origens = (arquivo: string) =>
  [...readFileSync(arquivo, 'utf8').matchAll(ORIGENS)].map((m) => m[1] ?? '');
const quemImporta = (lista: string[], alvo: RegExp) =>
  lista.filter((a) => origens(a).some((o) => alvo.test(o))).map((a) => relative('.', a));

const DA_MONTAGEM = /(^|\/)montagem-com-relogio(\.ts)?$/;
const DAS_FABRICAS = /(^|\/)servidor\/fabricas(\.ts)?$|^\.\/fabricas(\.ts)?$/;

describe('o relógio do roteiro fica fora do web em funcionamento', () => {
  it('nada do código em funcionamento importa a montagem com o relógio do roteiro', () => {
    expect(EM_FUNCIONAMENTO.length).toBeGreaterThan(100);
    expect(quemImporta(EM_FUNCIONAMENTO, DA_MONTAGEM)).toEqual([]);
  });

  it('no web, só a composição importa as fábricas, e com o relógio do sistema', () => {
    const doWeb = EM_FUNCIONAMENTO.filter((a) => a.startsWith(join('apps', 'web', 'src') + sep));
    expect(quemImporta(doWeb, DAS_FABRICAS)).toEqual([COMPOSICAO]);
    const fonte = readFileSync(COMPOSICAO, 'utf8');
    const chamadas = [...fonte.matchAll(/criarFabricas\(\{([^}]*)\}\)/g)].map((m) => m[1] ?? '');
    expect(chamadas).toHaveLength(1);
    expect(chamadas[0]).toMatch(/\brelogio:\s*relogioDoSistema\s*,/);
    expect(fonte).not.toMatch(/relogioDoRoteiro/);
  });

  it('a opção relogioDoRoteiro só aparece no packages/db e na montagem', () => {
    const permitidos = (a: string) =>
      a.startsWith(join('packages', 'db', 'src') + sep) ||
      a.startsWith(join('packages', 'db', 'test') + sep) ||
      a === MONTAGEM ||
      a === ESTE;
    const quem = TODO_O_CODIGO.filter((a) => /relogioDoRoteiro/.test(readFileSync(a, 'utf8')));
    expect(quem.filter((a) => !permitidos(a)).map((a) => relative('.', a))).toEqual([]);
  });

  it('controle: a montagem usa a opção e as fábricas', () => {
    const fonte = readFileSync(MONTAGEM, 'utf8');
    expect(fonte).toMatch(/relogioDoRoteiro:/);
    expect(origens(MONTAGEM).some((o) => DAS_FABRICAS.test(o))).toBe(true);
    expect(quemImporta(TODO_O_CODIGO, DA_MONTAGEM).length).toBeGreaterThan(0);
  });
});
