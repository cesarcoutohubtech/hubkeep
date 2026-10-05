// Asset Attention Score: no 1.0, custo, impacto no hóspede e preventiva ficam
// ausentes, e o peso deles vai para criticidade, reincidência e parada.
import { describe, expect, it } from 'vitest';
import { type Score, atencaoDoAtivo } from '../src';

const reinc = (valor: number | null): Score => ({
  chave: 'reincidencia',
  versao: 1,
  valor,
  faixa: 'x',
  componentes: [],
  ausentes: [],
  configuracao: {},
});

describe('atenção por ativo', () => {
  it('Intelligence 1.0: só os dados internos, com os ausentes listados', () => {
    const s = atencaoDoAtivo({
      criticidade: { nivel: 4, maximo: 5 },
      reincidencia: reinc(77),
      horasParadas: 24,
    });
    // (0,8 × 0,20 + 0,77 × 0,20 + 24/48 × 0,15) / 0,55 = 0,389 / 0,55 = 71.
    expect([s.valor, s.faixa]).toEqual([71, 'alta_atencao']);
    expect(s.ausentes).toEqual(['custo', 'impacto_hospede', 'preventiva_ou_compliance']);
    expect(s.componentes.find((c) => c.chave === 'reincidencia')?.evidencia).toEqual({
      score: 77,
      faixa: 'x',
      versao: 1,
    });
  });

  it('com todas as fontes, os pesos do PRD valem como estão', () => {
    const s = atencaoDoAtivo({
      criticidade: { nivel: 4, maximo: 5 },
      reincidencia: reinc(77),
      horasParadas: 24,
      custoInformado12m: 6000,
      impactoHospede: 50,
      preventivaOuCompliance: true,
    });
    // 0,16 + 0,154 + 0,075 + 6.000/10.000 × 0,15 + 0,5 × 0,20 + 1 × 0,10 = 0,679.
    expect([s.valor, s.faixa]).toEqual([68, 'atencao']);
    expect(s.ausentes).toEqual([]);
    for (const c of s.componentes) expect(c.pesoEfetivo).toBeCloseTo(c.peso);
    expect(s.componentes.find((c) => c.chave === 'custo')?.evidencia).toEqual({
      valor12m: 6000,
      limite: 10_000,
    });
  });

  it('criticidade e custo informado, da instrumentação da 1b, entram como opcionais', () => {
    const base = { reincidencia: reinc(77), horasParadas: 24 };
    const sem = atencaoDoAtivo({ ...base, criticidade: null });
    const com = atencaoDoAtivo({
      ...base,
      criticidade: { nivel: 5, maximo: 5 },
      custoInformado12m: 15_000,
    });
    // Sem os dois: (0,154 + 0,075) / 0,35 = 65.
    expect([sem.valor, sem.ausentes]).toEqual([
      65,
      ['criticidade', 'custo', 'impacto_hospede', 'preventiva_ou_compliance'],
    ]);
    // Com os dois, acima do limite: (0,20 + 0,154 + 0,075 + 0,15) / 0,70 = 83.
    expect([com.valor, com.ausentes]).toEqual([
      83,
      ['impacto_hospede', 'preventiva_ou_compliance'],
    ]);
  });

  it('sem criticidade cadastrada, o score sai só de reincidência e parada', () => {
    const s = atencaoDoAtivo({ criticidade: null, reincidencia: reinc(40), horasParadas: 0 });
    // 0,4 × 0,20 / 0,35 = 23.
    expect([s.valor, s.faixa]).toEqual([23, 'normal']);
    expect(s.ausentes).toContain('criticidade');
  });

  it('parada acima do limite não passa do componente cheio', () => {
    const s = atencaoDoAtivo({ criticidade: null, reincidencia: reinc(null), horasParadas: 500 });
    expect(s.valor).toBe(100);
  });
});
