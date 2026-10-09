// A origem do chamado e quem executa a OS (I4) moram no domínio
// (ORIGENS_DO_CHAMADO e EXECUTORES_DA_OS), e as colunas app.chamado.origem e
// app.os.executado_por têm checks com os mesmos valores (migração 0034). Este
// teste lê as migrações e falha se um check e a lista do domínio divergirem:
// valor novo exige migração que amplia o check. O pgTAP 028 prova, no banco,
// que o check recusa o que está fora.
import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { EXECUTORES_DA_OS, ORIGENS_DO_CHAMADO } from '../packages/dominio/src/index';

/** Última definição da restrição, pela ordem das migrações. */
function valoresDoCheck(restricao: string, coluna: string): string[] | undefined {
  const dir = 'supabase/migrations';
  const padrao = new RegExp(
    `constraint\\s+(\\w+)\\s+check\\s*\\(\\s*${coluna}\\s+in\\s*\\(([^)]*)\\)\\s*\\)`,
    'gi',
  );
  let achados: string[] | undefined;
  for (const arquivo of readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()) {
    const sql = readFileSync(`${dir}/${arquivo}`, 'utf8');
    for (const m of sql.matchAll(padrao)) {
      if (m[1] !== restricao) continue;
      achados = [...(m[2] ?? '').matchAll(/'([^']+)'/g)].map((v) => v[1] ?? '');
    }
  }
  return achados;
}

describe('valores canônicos: banco × domínio (I4)', () => {
  it('chamado_origem_lista aceita exatamente as ORIGENS_DO_CHAMADO do domínio', () => {
    expect(valoresDoCheck('chamado_origem_lista', 'origem')).toEqual([...ORIGENS_DO_CHAMADO]);
  });

  it('os_executado_por_lista aceita exatamente os EXECUTORES_DA_OS do domínio', () => {
    expect(valoresDoCheck('os_executado_por_lista', 'executado_por')).toEqual([
      ...EXECUTORES_DA_OS,
    ]);
  });
});
