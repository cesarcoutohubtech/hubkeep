// A conclusão do serviço, as reaberturas e o aceite da OS a partir das
// transições (glossário de métricas, versão 3). Os casos da conclusão vieram de
// packages/inteligencia/test/transicoes.test.ts, onde a função morava.
import { describe, expect, it } from 'vitest';
import { type TransicaoDoServico, aceiteDaOs, conclusaoEReaberturas } from '../src';

const DIA = 86_400_000;
const agora = new Date('2026-10-13T12:00:00Z');
const dia = (d: number) => new Date(agora.getTime() + d * DIA);
const t = (acao: TransicaoDoServico['acao'], d: number): TransicaoDoServico => ({
  acao,
  quando: dia(d),
});

const historia = [
  t('gerar', -20),
  t('iniciar', -19),
  t('concluir', -15),
  t('reabrir', -10),
  t('concluir', -8),
  t('aceitar', -5),
];

describe('conclusaoEReaberturas', () => {
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
    expect(conclusaoEReaberturas([t('concluir', -3), t('cancelar', -1)], agora)).toEqual({
      concluidaEm: null,
      reaberturas: 0,
    });
  });
});

describe('aceiteDaOs', () => {
  it('o aceite do gestor vale a partir do dia dele', () => {
    expect(aceiteDaOs(historia, agora)).toEqual(dia(-5));
    expect(aceiteDaOs(historia, dia(-6))).toBeNull();
    expect(aceiteDaOs([...historia].reverse(), agora)).toEqual(dia(-5));
  });

  it('o aceite automático do worker conta como aceite', () => {
    expect(aceiteDaOs([t('concluir', -4), t('aceitar_automatico', -1)], agora)).toEqual(dia(-1));
  });

  it('sem aceite, ou com reabertura ou cancelamento depois dele, não há aceite', () => {
    expect(aceiteDaOs([t('concluir', -4)], agora)).toBeNull();
    expect(aceiteDaOs([t('aceitar', -4), t('reabrir', -2)], agora)).toBeNull();
    expect(aceiteDaOs([t('aceitar', -4), t('cancelar', -2)], agora)).toBeNull();
    expect(aceiteDaOs([], agora)).toBeNull();
  });
});
