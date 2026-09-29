// Padrão do ILIKE da busca (B6): o termo em qualquer parte, com os curingas
// digitados valendo como texto. Sem banco.
import { describe, expect, it } from 'vitest';
import { trecho } from '../src/adaptadores';

describe('trecho', () => {
  it('envolve o termo com %', () => {
    expect(trecho('frig')).toBe('%frig%');
  });

  it('escapa %, _ e a barra', () => {
    expect(trecho(String.raw`50%_a\b`)).toBe(String.raw`%50\%\_a\\b%`);
  });
});
