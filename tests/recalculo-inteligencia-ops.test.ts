// Argumentos do recálculo do Intelligence (scripts/ops/recalcular-
// inteligencia.ts), sem conexão: o período sai conferido antes de o script
// conectar.
import { describe, expect, it } from 'vitest';
import {
  MAXIMO_DE_DIAS_DO_RECALCULO,
  lerPedidoDeRecalculo,
} from '../scripts/ops/recalculo-inteligencia.ts';

const T = '0193a000-0000-4000-8000-000000000001';
const AGORA = new Date('2026-10-13T12:00:00Z');
const ler = (...resto: string[]) =>
  lerPedidoDeRecalculo(['--ambiente', 'dev', '--tenant', T, '--por', 'Cesar', ...resto], AGORA);

describe('lerPedidoDeRecalculo', () => {
  it('os dias do --de ao --ate, inclusive, em ordem', () => {
    expect(ler('--de', '2026-09-29', '--ate', '2026-10-02')).toEqual({
      tenant: T,
      dias: ['2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02'],
      por: 'Cesar',
    });
    expect(ler('--de', '2026-10-12', '--ate', '2026-10-12').dias).toEqual(['2026-10-12']);
  });

  it(`até ${MAXIMO_DE_DIAS_DO_RECALCULO} dias`, () => {
    expect(ler('--de', '2025-10-12', '--ate', '2026-10-12').dias).toHaveLength(366);
    expect(() => ler('--de', '2025-10-11', '--ate', '2026-10-12')).toThrow(/No máximo 366/);
  });

  it.each([
    [
      'sem tenant',
      ['--ambiente', 'dev', '--de', '2026-10-01', '--ate', '2026-10-02', '--por', 'C'],
    ],
    ['sem --de', ['--tenant', T, '--ate', '2026-10-02', '--por', 'C']],
    ['dia inexistente', ['--tenant', T, '--de', '2026-02-30', '--ate', '2026-03-02', '--por', 'C']],
    [
      'dia com hora',
      ['--tenant', T, '--de', '2026-10-01T00:00Z', '--ate', '2026-10-02', '--por', 'C'],
    ],
    [
      '--ate antes do --de',
      ['--tenant', T, '--de', '2026-10-05', '--ate', '2026-10-02', '--por', 'C'],
    ],
    [
      'hoje ainda não terminou',
      ['--tenant', T, '--de', '2026-10-12', '--ate', '2026-10-13', '--por', 'C'],
    ],
    ['sem --por', ['--tenant', T, '--de', '2026-10-01', '--ate', '2026-10-02']],
  ])('recusa: %s', (_nome, argv) => {
    expect(() => lerPedidoDeRecalculo(argv, AGORA)).toThrow();
  });
});
