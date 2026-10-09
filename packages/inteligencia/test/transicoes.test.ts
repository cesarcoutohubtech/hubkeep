// Conclusão e reaberturas pelas transições da OS (app.os_transicao, etapa I5
// da 1b) e a criticidade fixa de 1 a 5 (etapa I1).
import { describe, expect, it } from 'vitest';
import {
  CRITICIDADE_MAXIMA,
  type TransicaoDaOs,
  conclusaoEReaberturas,
  ehCriticidade,
} from '../src';
import { agora, dia } from './apoio';

const t = (acao: TransicaoDaOs['acao'], para: TransicaoDaOs['para'], d: number): TransicaoDaOs => ({
  acao,
  para,
  quando: dia(d),
});

describe('conclusaoEReaberturas', () => {
  const historia = [
    t('gerar', 'atribuida', -20),
    t('iniciar', 'em_execucao', -19),
    t('concluir', 'concluida', -15),
    t('reabrir', 'em_execucao', -10),
    t('concluir', 'concluida', -8),
    t('aceitar', 'aceita', -5),
  ];

  it('hoje: a última conclusão vale e o aceite não muda; uma reabertura', () => {
    expect(conclusaoEReaberturas(historia, agora)).toEqual({
      concluidaEm: dia(-8),
      reaberturas: 1,
    });
  });

  it('num dia passado, vê a OS como ela estava: nada depois da data conta', () => {
    expect(conclusaoEReaberturas(historia, dia(-12))).toEqual({
      concluidaEm: dia(-15),
      reaberturas: 0,
    });
    expect(conclusaoEReaberturas(historia, dia(-9))).toEqual({ concluidaEm: null, reaberturas: 1 });
    expect(conclusaoEReaberturas(historia, dia(-30))).toEqual({
      concluidaEm: null,
      reaberturas: 0,
    });
  });

  it('a ordem da lista não importa, e o cancelamento desfaz a conclusão', () => {
    expect(conclusaoEReaberturas([...historia].reverse(), agora)).toEqual({
      concluidaEm: dia(-8),
      reaberturas: 1,
    });
    expect(
      conclusaoEReaberturas(
        [t('concluir', 'concluida', -3), t('cancelar', 'cancelada', -1)],
        agora,
      ),
    ).toEqual({ concluidaEm: null, reaberturas: 0 });
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
