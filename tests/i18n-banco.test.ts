// A lista de idiomas mora no código (@hubkeep/i18n) e a coluna `idioma` no
// banco tem restrição com os mesmos valores (ADR-022: sem tabela global de
// idioma). Este teste lê as migrações e falha se a restrição e a lista
// divergirem: idioma novo exige migração que amplia as três restrições.
import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { IDIOMAS } from '../packages/i18n/src/index';

const RESTRICOES = [
  'tenant_idioma_padrao_lista',
  'hotel_idioma_padrao_lista',
  'preferencia_idioma_lista',
];

/** Última definição de cada restrição de idioma, pela ordem das migrações. */
function restricoesDeIdioma(): Map<string, string[]> {
  const dir = 'supabase/migrations';
  const achadas = new Map<string, string[]>();
  for (const arquivo of readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()) {
    const sql = readFileSync(`${dir}/${arquivo}`, 'utf8');
    for (const m of sql.matchAll(
      /constraint\s+(\w*idioma\w*)\s+check\s*\(\s*\w+\s+in\s*\(([^)]*)\)\s*\)/gi,
    )) {
      const valores = [...(m[2] ?? '').matchAll(/'([^']+)'/g)].map((v) => v[1] ?? '');
      achadas.set(m[1] ?? '', valores);
    }
  }
  return achadas;
}

describe('idiomas: banco × código', () => {
  const achadas = restricoesDeIdioma();

  it('as três colunas de idioma têm restrição', () => {
    expect([...achadas.keys()].sort()).toEqual([...RESTRICOES].sort());
  });

  it.each(RESTRICOES)('%s aceita exatamente os IDIOMAS de @hubkeep/i18n', (nome) => {
    expect(achadas.get(nome)).toEqual([...IDIOMAS]);
  });
});
