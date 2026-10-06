// Liberação estreita do Intelligence no web (decisão do Cesar de 06/10/2026):
// o lint deixa o servidor do web importar a pasta do módulo
// (apps/web/src/servidor/modulos/inteligencia), mas não diz quem nem o quê.
// Este teste fecha o resto: só a raiz de composição chega à pasta, e só pela
// função de montagem. Assim, desligar o módulo é tirar uma chamada.
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

const SERVIDOR = join('apps', 'web', 'src', 'servidor');
const PASTA_DO_MODULO = join(SERVIDOR, 'modulos', 'inteligencia');
const COMPOSICAO = join(SERVIDOR, 'composicao.ts');

function arquivos(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const caminho = join(dir, e.name);
    if (e.isDirectory()) return arquivos(caminho);
    return /\.(ts|tsx)$/.test(e.name) ? [caminho] : [];
  });
}

// import ... from '...', export ... from '...', import('...') e require('...').
const ORIGENS = /(?:from\s*|import\s*\(\s*|require\s*\(\s*)['"]([^'"]+)['"]/g;
const daPasta = (origem: string) => /(^|\/)modulos\/inteligencia(\/|$)/.test(origem);

describe('composição do Intelligence no web', () => {
  const doWeb = arquivos(join('apps', 'web', 'src')).filter(
    (a) => !a.startsWith(PASTA_DO_MODULO + sep),
  );

  it('fora da pasta do módulo, só a composição importa a pasta', () => {
    const quem = doWeb.filter((a) =>
      [...readFileSync(a, 'utf8').matchAll(ORIGENS)].some((m) => daPasta(m[1] ?? '')),
    );
    expect(quem.map((a) => relative('.', a))).toEqual([COMPOSICAO]);
  });

  it('a composição importa só montarInteligencia, da raiz da pasta', () => {
    const fonte = readFileSync(COMPOSICAO, 'utf8');
    const imports = [...fonte.matchAll(/import\s+([^;]+?)\s+from\s+['"]([^'"]+)['"]/g)].filter(
      (m) => daPasta(m[2] ?? ''),
    );
    expect(imports.map((m) => [m[1]?.replace(/\s+/g, ' '), m[2]])).toEqual([
      ['{ montarInteligencia }', './modulos/inteligencia'],
    ]);
  });
});
