// A preventiva atrasada (glossário de métricas, versão 3): passou do fim do dia
// previsto mais a tolerância, no fuso do hotel, sem ser concluída nem cancelada.
import { describe, expect, it } from 'vitest';
import { preventivaAtrasada } from '../src';

const FUSO = 'America/Sao_Paulo';
const em = (iso: string) => new Date(iso);
const os = (
  transicoes: { para: 'em_execucao' | 'concluida' | 'aceita' | 'cancelada'; quando: string }[] = [],
) => ({
  dataPrevista: '2026-10-10',
  transicoes: transicoes.map((t) => ({ para: t.para, quando: em(t.quando) })),
});
const atrasada = (o: ReturnType<typeof os>, agora: string, toleranciaDias = 0) =>
  preventivaAtrasada(o, { fuso: FUSO, agora: em(agora), toleranciaDias });

describe('preventivaAtrasada', () => {
  it('no dia previsto ainda não atrasou; no dia seguinte, no fuso do hotel, sim', () => {
    // 23:59 de 10/10 em São Paulo é 02:59 UTC de 11/10: ainda é o dia previsto.
    expect(atrasada(os(), '2026-10-11T02:59:00Z')).toBe(false);
    expect(atrasada(os(), '2026-10-11T03:00:00Z')).toBe(true);
  });

  it('a tolerância adia o atraso em dias inteiros', () => {
    expect(atrasada(os(), '2026-10-12T12:00:00Z', 2)).toBe(false);
    expect(atrasada(os(), '2026-10-13T12:00:00Z', 2)).toBe(true);
  });

  it('a concluída, a aceita e a cancelada não atrasam; em execução, sim', () => {
    const agora = '2026-10-20T12:00:00Z';
    expect(atrasada(os([{ para: 'concluida', quando: '2026-10-15T12:00:00Z' }]), agora)).toBe(
      false,
    );
    expect(atrasada(os([{ para: 'aceita', quando: '2026-10-15T12:00:00Z' }]), agora)).toBe(false);
    expect(atrasada(os([{ para: 'cancelada', quando: '2026-10-15T12:00:00Z' }]), agora)).toBe(
      false,
    );
    expect(atrasada(os([{ para: 'em_execucao', quando: '2026-10-09T12:00:00Z' }]), agora)).toBe(
      true,
    );
  });

  it('vale o estado no instante: a conclusão depois de agora não conta', () => {
    const o = os([
      { para: 'em_execucao', quando: '2026-10-09T12:00:00Z' },
      { para: 'concluida', quando: '2026-10-18T12:00:00Z' },
    ]);
    expect(atrasada(o, '2026-10-15T12:00:00Z')).toBe(true);
    expect(atrasada(o, '2026-10-19T12:00:00Z')).toBe(false);
  });

  it('recusa data prevista fora do formato e tolerância inválida', () => {
    expect(() =>
      atrasada({ dataPrevista: '10/10/2026', transicoes: [] }, '2026-10-20T12:00:00Z'),
    ).toThrow();
    expect(() => atrasada(os(), '2026-10-20T12:00:00Z', -1)).toThrow();
    expect(() => atrasada(os(), '2026-10-20T12:00:00Z', 1.5)).toThrow();
  });
});
