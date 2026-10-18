// O pré-voo de seleção deve ser seguro mesmo que nunca seja executado no dev.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const fonte = readFileSync('scripts/ops/mews-candidatos-hotel-dev.mjs', 'utf8');

describe('Mews Demo: candidatos fictícios no dev sem escrita', () => {
  it('executa as oito regras puras sem rede, banco ou variáveis do operador', () => {
    const saida = execFileSync(
      process.execPath,
      ['--test', 'scripts/ops/mews-candidatos-core.test.mjs'],
      { cwd: process.cwd(), encoding: 'utf8', timeout: 20_000 },
    );
    expect(saida).toMatch(/# tests 8\b/);
    expect(saida).toMatch(/# pass 8\b/);
    expect(saida).toMatch(/# fail 0\b/);
  });

  it('somente --ambiente dev, transação READ ONLY e rollback obrigatório', () => {
    expect(fonte).toContain("argv[0] !== '--ambiente' || argv[1] !== 'dev'");
    expect(fonte).toContain('conexaoDono(ambiente)');
    expect(fonte).toContain('BEGIN TRANSACTION READ ONLY');
    expect(fonte).toContain("'ROLLBACK'");
    expect(fonte).toContain('mews_vinculo');
    expect(fonte).toContain('limit $1');
    expect(fonte).not.toMatch(/cliente\.query\(\s*['"`](INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TRUNCATE)\b/i);
  });
});
