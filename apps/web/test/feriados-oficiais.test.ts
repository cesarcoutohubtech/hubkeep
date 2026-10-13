// Regressão dos feriados oficiais (fase 1c; ADR-042): a cada atualização da
// date-holidays, os feriados nacionais do Brasil e os de uma amostra de
// estados no ano corrente e no seguinte, com os tipos que contam.
import { describe, expect, it } from 'vitest';
import { criarFeriadosOficiais } from '../src/servidor/feriados-oficiais';

const NACIONAIS = (ano: number, sextaSanta: string) => [
  `${ano}-01-01`,
  sextaSanta,
  `${ano}-04-21`,
  `${ano}-05-01`,
  `${ano}-09-07`,
  `${ano}-10-12`,
  `${ano}-11-02`,
  `${ano}-11-15`,
  `${ano}-11-20`,
  `${ano}-12-25`,
];
const ANOS: [number, string][] = [
  [2026, '2026-04-03'],
  [2027, '2027-03-26'],
];
const DO_ESTADO: Record<string, string> = {
  'BR-SP': '07-09',
  'BR-PR': '12-19',
  'BR-RJ': '04-23',
  'BR-RS': '09-20',
};

const feriados = criarFeriadosOficiais();
const datas = (subdivisao: string | null, ano: number, tipo: string) =>
  feriados
    .doAno({ pais: 'BR', subdivisao }, ano)
    .filter((f) => f.tipo === tipo)
    .map((f) => f.data);

describe('feriados oficiais (date-holidays)', () => {
  it.each(ANOS)('os nacionais de %i, no país e em cada estado da amostra', (ano, sextaSanta) => {
    for (const sub of [null, ...Object.keys(DO_ESTADO)]) {
      expect(datas(sub, ano, 'feriado')).toEqual(
        expect.arrayContaining(NACIONAIS(ano, sextaSanta)),
      );
    }
  });

  it.each(ANOS)('o feriado de cada estado em %i, só no estado', (ano) => {
    for (const [sub, dia] of Object.entries(DO_ESTADO)) {
      expect(datas(sub, ano, 'feriado')).toContain(`${ano}-${dia}`);
      expect(datas(null, ano, 'feriado')).not.toContain(`${ano}-${dia}`);
    }
  });

  it('Carnaval e Cinzas são ponto facultativo; Páscoa e Dia das Mães não contam', () => {
    expect(datas(null, 2026, 'ponto_facultativo')).toEqual(
      expect.arrayContaining(['2026-02-16', '2026-02-17', '2026-02-18']),
    );
    const contam = feriados
      .doAno({ pais: 'BR', subdivisao: null }, 2026)
      .filter((f) => f.tipo !== 'observancia')
      .map((f) => f.data);
    expect(contam).not.toContain('2026-04-05');
    expect(contam).not.toContain('2026-05-10');
  });

  it('país sem cobertura: lista vazia; subdivisão de outro país é ignorada', () => {
    expect(feriados.doAno({ pais: 'XX', subdivisao: null }, 2026)).toEqual([]);
    expect(datas('AR-B', 2026, 'feriado')).toEqual(datas(null, 2026, 'feriado'));
  });
});
