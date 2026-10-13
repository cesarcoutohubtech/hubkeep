// A criticidade fixa de 1 a 5 (etapa I1) e a conclusão do serviço, que mora no
// domínio desde o glossário de métricas versão 3 (os casos estão em
// packages/dominio/test/servico-da-os.test.ts): o Intelligence só a reexporta.
import * as dominio from '@hubkeep/dominio';
import { describe, expect, it } from 'vitest';
import { CRITICIDADE_MAXIMA, conclusaoEReaberturas, ehCriticidade } from '../src';

describe('conclusão do serviço', () => {
  it('é a do domínio', () => {
    expect(conclusaoEReaberturas).toBe(dominio.conclusaoEReaberturas);
  });
});

describe('criticidade de 1 a 5', () => {
  it('só os inteiros de 1 ao máximo', () => {
    expect(CRITICIDADE_MAXIMA).toBe(5);
    expect([1, 2, 3, 4, 5].every(ehCriticidade)).toBe(true);
    for (const n of [0, 6, 2.5, -1, '3', null, undefined, Number.NaN])
      expect(ehCriticidade(n)).toBe(false);
  });
});
