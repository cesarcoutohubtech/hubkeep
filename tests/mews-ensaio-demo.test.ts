// Ensaio do laboratório Mews no pipeline principal: sem rede nem acesso ao dev.
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

describe('Mews Demo: contrato de pré-vínculo e preview isolado', () => {
  it('executa todos os cenários Node offline e exige 12 aprovações', () => {
    const resultado = execFileSync(
      process.execPath,
      ['--test', 'docs/referencia/laboratorio-eu/mews-poc/ensaio-vinculo-demo.test.mjs'],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
        timeout: 20_000,
        maxBuffer: 1024 * 1024,
      },
    );
    expect(resultado).toMatch(/# tests 12\b/);
    expect(resultado).toMatch(/# pass 12\b/);
    expect(resultado).toMatch(/# fail 0\b/);
  });
});
