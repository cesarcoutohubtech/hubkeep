// Regra do Dependabot (decisão do Cesar de 13/10/2026, #234): as dependências
// do packages/auth-admin, que é zona protegida, vêm no grupo semanal
// zona-protegida-da-semana, antes do grupo geral. O Dependabot põe cada
// dependência no primeiro grupo que casa; sem este teste, uma dependência nova
// no auth-admin cairia no grupo geral e o PR semanal voltaria a tocar a zona e
// travar a fila (#231). Os dois grupos levam só versões menores e correções.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const linhas = readFileSync('.github/dependabot.yml', 'utf8')
  .split(/\r?\n/)
  .filter((l) => !/^\s*#/.test(l));

const indentacao = (l: string) => l.length - l.trimStart().length;

/** As linhas do bloco de uma chave, até a próxima chave na mesma indentação ou menor. */
function bloco(chave: string): string[] {
  const inicio = linhas.findIndex((l) => l.trim() === `${chave}:`);
  if (inicio < 0) return [];
  const nivel = indentacao(linhas[inicio] ?? '');
  const fim = linhas.findIndex((l, i) => i > inicio && l.trim() !== '' && indentacao(l) <= nivel);
  return linhas.slice(inicio + 1, fim < 0 ? undefined : fim);
}

/** Os itens da lista de uma subchave do bloco (patterns, update-types). */
function lista(linhasDoBloco: string[], subchave: string): string[] {
  const inicio = linhasDoBloco.findIndex((l) => l.trim() === `${subchave}:`);
  if (inicio < 0) return [];
  const itens: string[] = [];
  for (const l of linhasDoBloco.slice(inicio + 1)) {
    const item = /^\s*-\s*['"]?([^'"]+?)['"]?\s*$/.exec(l);
    if (item?.[1] === undefined) break;
    itens.push(item[1]);
  }
  return itens;
}

const pacote = JSON.parse(readFileSync('packages/auth-admin/package.json', 'utf8')) as {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};
const dependenciasDoAuthAdmin = Object.entries({
  ...pacote.dependencies,
  ...pacote.devDependencies,
})
  .filter(([, versao]) => !versao.startsWith('workspace:'))
  .map(([nome]) => nome)
  .sort();

describe('Dependabot: o auth-admin no grupo da zona protegida', () => {
  const zona = bloco('zona-protegida-da-semana');
  const geral = bloco('versoes-da-semana');

  it('o auth-admin tem dependências externas para conferir', () => {
    expect(dependenciasDoAuthAdmin.length).toBeGreaterThan(0);
  });

  it('toda dependência externa do auth-admin está no grupo zona-protegida-da-semana', () => {
    expect(lista(zona, 'patterns')).toEqual(expect.arrayContaining(dependenciasDoAuthAdmin));
  });

  it('o grupo da zona vem antes do grupo geral', () => {
    const posicao = (chave: string) => linhas.findIndex((l) => l.trim() === `${chave}:`);
    expect(posicao('zona-protegida-da-semana')).toBeGreaterThanOrEqual(0);
    expect(posicao('versoes-da-semana')).toBeGreaterThan(posicao('zona-protegida-da-semana'));
  });

  it('os dois grupos levam só versões menores e correções', () => {
    expect(lista(zona, 'update-types').sort()).toEqual(['minor', 'patch']);
    expect(lista(geral, 'update-types').sort()).toEqual(['minor', 'patch']);
  });
});
