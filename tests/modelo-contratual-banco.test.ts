// O modelo contratual do hotel (I2) mora no domínio (MODELOS_CONTRATUAIS), e
// a coluna app.hotel.modelo_contratual tem um check com os mesmos valores
// (migração 0032). Este teste lê as migrações e falha se o check e a lista do
// domínio divergirem: valor novo exige migração que amplia o check. O pgTAP
// 026 prova, no banco, que o check aceita os quatro e recusa o resto.
import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MODELOS_CONTRATUAIS } from '../packages/dominio/src/index';

const RESTRICAO = 'hotel_modelo_contratual_lista';

/** Última definição da restrição, pela ordem das migrações. */
function valoresDoCheck(): string[] | undefined {
  const dir = 'supabase/migrations';
  let achados: string[] | undefined;
  for (const arquivo of readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()) {
    const sql = readFileSync(`${dir}/${arquivo}`, 'utf8');
    for (const m of sql.matchAll(
      /constraint\s+(\w+)\s+check\s*\(\s*modelo_contratual\s+in\s*\(([^)]*)\)\s*\)/gi,
    )) {
      if (m[1] !== RESTRICAO) continue;
      achados = [...(m[2] ?? '').matchAll(/'([^']+)'/g)].map((v) => v[1] ?? '');
    }
  }
  return achados;
}

describe('modelo contratual: banco × domínio (I2)', () => {
  it(`${RESTRICAO} aceita exatamente os MODELOS_CONTRATUAIS do domínio`, () => {
    expect(valoresDoCheck()).toEqual([...MODELOS_CONTRATUAIS]);
  });
});
