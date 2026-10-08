// Asset Attention Score, versão 2 (aprovada em 08/10/2026): nove componentes,
// UH-dias com peso 0, e o peso do componente sem dado dividido entre os presentes.
import { CATALOGOS, IDIOMAS, criarTradutor } from '@hubkeep/i18n';
import { describe, expect, it } from 'vitest';
import {
  type MedicoesDoAtivo,
  PADRAO_ATENCAO,
  type Score,
  type SituacaoDaGarantia,
  VERSAO_ATENCAO,
  atencaoDoAtivo,
  detalhamentoDoScore,
  situacaoDaGarantia,
} from '../src';

const reinc = (valor: number | null): Score => ({
  chave: 'reincidencia',
  versao: 1,
  valor,
  faixa: 'x',
  componentes: [],
  ausentes: [],
  configuracao: {},
});

describe('atenção por ativo, versão 2', () => {
  it('a versão e os pesos padrão são os aprovados, e somam 100', () => {
    expect(VERSAO_ATENCAO).toBe(2);
    const p = PADRAO_ATENCAO.pesos;
    expect(Object.fromEntries(Object.entries(p).map(([k, v]) => [k, Math.round(v * 100)]))).toEqual(
      {
        reincidencia: 20,
        parada: 15,
        impactoHospede: 15,
        criticidade: 15,
        custo: 10,
        preventivaAtrasada: 10,
        medicoesForaDaFaixa: 10,
        garantiaVencida: 5,
        uhDias: 0,
      },
    );
    expect(Object.values(p).reduce((s, v) => s + v, 0)).toBeCloseTo(1);
    expect(PADRAO_ATENCAO.limiteInsight).toBe(70);
  });

  it('só os dados internos: o peso do que falta vai para os presentes, e os ausentes ficam listados', () => {
    const s = atencaoDoAtivo({
      criticidade: 4,
      reincidencia: reinc(77),
      horasParadas: 24,
    });
    // (0,77 × 0,20 + 24/48 × 0,15 + 0,8 × 0,15) / 0,50 = 0,349 / 0,50 = 70.
    expect([s.valor, s.faixa, s.versao]).toEqual([70, 'alta_atencao', 2]);
    expect(s.ausentes).toEqual([
      'impacto_hospede',
      'custo',
      'preventiva_atrasada',
      'medicoes_fora_da_faixa',
      'garantia_vencida',
      'uh_dias',
    ]);
    expect(s.componentes.find((c) => c.chave === 'reincidencia')?.evidencia).toEqual({
      score: 77,
      faixa: 'x',
      versao: 1,
    });
    // Os presentes ficam com 0,40, 0,30 e 0,30 do peso.
    const usados = Object.fromEntries(s.componentes.map((c) => [c.chave, c.pesoEfetivo]));
    expect(usados['reincidencia']).toBeCloseTo(0.4);
    expect(usados['parada']).toBeCloseTo(0.3);
    expect(usados['criticidade']).toBeCloseTo(0.3);
    expect(usados['garantia_vencida']).toBe(0);
  });

  it('com todas as fontes, os pesos valem como estão (UH-dias segue sem dado, com peso 0)', () => {
    const s = atencaoDoAtivo({
      criticidade: 4,
      reincidencia: reinc(77),
      horasParadas: 24,
      custoInformado12m: 6000,
      impactoHospede: 50,
      preventivaAtrasada: true,
      medicoes: { foraDaFaixa: 2, total: 4 },
      garantia: { vencida: true, diasVencida: 10 },
    });
    // 0,154 + 0,075 + 0,075 + 0,12 + 0,06 + 0,10 + 0,05 + 0,05 = 0,684.
    expect([s.valor, s.faixa]).toEqual([68, 'atencao']);
    expect(s.ausentes).toEqual(['uh_dias']);
    for (const c of s.componentes) expect(c.pesoEfetivo).toBeCloseTo(c.peso);
    expect(s.componentes.find((c) => c.chave === 'custo')?.evidencia).toEqual({
      valor12m: 6000,
      limite: 10_000,
    });
    expect(s.componentes.find((c) => c.chave === 'garantia_vencida')?.evidencia).toEqual({
      vencida: true,
      diasVencida: 10,
    });
  });

  it('criticidade e custo informado, da instrumentação da 1b, entram como opcionais', () => {
    const base = { reincidencia: reinc(77), horasParadas: 24 };
    const sem = atencaoDoAtivo({ ...base, criticidade: null });
    const com = atencaoDoAtivo({
      ...base,
      criticidade: 5,
      custoInformado12m: 15_000,
    });
    // Sem os dois: (0,154 + 0,075) / 0,35 = 65.
    expect([sem.valor, sem.ausentes]).toEqual([
      65,
      [
        'impacto_hospede',
        'criticidade',
        'custo',
        'preventiva_atrasada',
        'medicoes_fora_da_faixa',
        'garantia_vencida',
        'uh_dias',
      ],
    ]);
    // Com os dois, acima do limite: (0,154 + 0,075 + 0,15 + 0,10) / 0,60 = 80.
    expect([com.valor, com.ausentes]).toEqual([
      80,
      [
        'impacto_hospede',
        'preventiva_atrasada',
        'medicoes_fora_da_faixa',
        'garantia_vencida',
        'uh_dias',
      ],
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

  describe('garantia vencida', () => {
    const base = { criticidade: null, reincidencia: reinc(null), horasParadas: 0 };
    const valorDe = (garantia?: SituacaoDaGarantia | null) =>
      atencaoDoAtivo(garantia === undefined ? base : { ...base, garantia }).componentes.find(
        (c) => c.chave === 'garantia_vencida',
      )?.valor;

    it('vencida vale 1; dentro da garantia, 0; sem a data, sem dado', () => {
      expect(valorDe({ vencida: true, diasVencida: 3 })).toBe(1);
      expect(valorDe({ vencida: false, diasVencida: 0 })).toBe(0);
      expect(valorDe(null)).toBeNull();
      expect(valorDe(undefined)).toBeNull();
    });

    it('a data de fim da garantia vale até o fim desse dia (UTC) e vence no seguinte', () => {
      const fim = new Date('2026-09-30T00:00:00Z');
      expect(situacaoDaGarantia({ garantiaAte: fim }, new Date('2026-09-30T23:59:59Z'))).toEqual({
        vencida: false,
        diasVencida: 0,
      });
      expect(situacaoDaGarantia({ garantiaAte: fim }, new Date('2026-10-01T00:00:00Z'))).toEqual({
        vencida: true,
        diasVencida: 1,
      });
      expect(situacaoDaGarantia({ garantiaAte: fim }, new Date('2026-12-30T12:00:00Z'))).toEqual({
        vencida: true,
        diasVencida: 91,
      });
      expect(situacaoDaGarantia({ garantiaAte: new Date('2027-01-01T00:00:00Z') }, fim)).toEqual({
        vencida: false,
        diasVencida: 0,
      });
      expect(situacaoDaGarantia({ garantiaAte: null }, fim)).toBeNull();
      expect(situacaoDaGarantia({}, fim)).toBeNull();
    });
  });

  describe('medições fora da faixa', () => {
    const base = { criticidade: null, reincidencia: reinc(null), horasParadas: 0 };
    const valorDe = (medicoes?: MedicoesDoAtivo | null) =>
      atencaoDoAtivo(medicoes === undefined ? base : { ...base, medicoes }).componentes.find(
        (c) => c.chave === 'medicoes_fora_da_faixa',
      )?.valor;

    it('é a fração das medições fora da faixa; sem medição, sem dado (até o checklist tipado)', () => {
      expect(valorDe({ foraDaFaixa: 3, total: 4 })).toBe(0.75);
      expect(valorDe({ foraDaFaixa: 0, total: 6 })).toBe(0);
      expect(valorDe({ foraDaFaixa: 0, total: 0 })).toBeNull();
      expect(valorDe(null)).toBeNull();
      expect(valorDe(undefined)).toBeNull();
    });
  });

  it('UH-dias tem peso 0: nunca soma pontos nem recebe peso, e fica sem dado', () => {
    const s = atencaoDoAtivo({ criticidade: 3, reincidencia: reinc(50), horasParadas: 12 });
    const uh = s.componentes.find((c) => c.chave === 'uh_dias');
    expect([uh?.peso, uh?.pesoEfetivo, uh?.pontos, uh?.valor]).toEqual([0, 0, 0, null]);
  });
});

describe('detalhamento: o componente sem dado e a redistribuição', () => {
  it('lista o que não tem dado, o peso dividido e a chave do aviso', () => {
    const s = atencaoDoAtivo({ criticidade: 4, reincidencia: reinc(77), horasParadas: 24 });
    const d = detalhamentoDoScore(s);
    expect(d.semDadoComPeso).toEqual([
      'impacto_hospede',
      'custo',
      'preventiva_atrasada',
      'medicoes_fora_da_faixa',
      'garantia_vencida',
    ]);
    // Sem dado: 15 + 10 + 10 + 10 + 5 = 50% do peso; UH-dias (peso 0) não conta.
    expect(d.pesoRedistribuido).toBeCloseTo(0.5);
    expect(d.chaveDoAviso).toBe('inteligencia.detalhamento.sem_dado');
    expect(d.valoresDoAviso).toEqual({ quantidade: 5, peso: d.pesoRedistribuido });
    const linha = (c: string) => d.linhas.find((l) => l.componente === c);
    expect(linha('custo')).toMatchObject({ semDado: true, pesoUsado: 0, pontos: 0 });
    expect(linha('custo')?.peso).toBeCloseTo(0.1);
    expect(linha('reincidencia')).toMatchObject({ semDado: false });
    expect(linha('reincidencia')?.peso).toBeCloseTo(0.2);
    expect(linha('reincidencia')?.pesoUsado).toBeCloseTo(0.4);
    expect(linha('uh_dias')).toMatchObject({ semDado: true, peso: 0, pesoUsado: 0 });
    expect(linha('custo')?.chaveDoNome).toBe('inteligencia.componente.atencao_ativo.custo');
  });

  it('sem nada para redistribuir, não há aviso (UH-dias com peso 0 não conta)', () => {
    const s = atencaoDoAtivo({
      criticidade: 4,
      reincidencia: reinc(77),
      horasParadas: 24,
      custoInformado12m: 1000,
      impactoHospede: 10,
      preventivaAtrasada: false,
      medicoes: { foraDaFaixa: 0, total: 3 },
      garantia: { vencida: false, diasVencida: 0 },
    });
    const d = detalhamentoDoScore(s);
    expect(d).toMatchObject({ semDadoComPeso: [], pesoRedistribuido: 0, chaveDoAviso: null });
  });

  it('sem dado nenhum, o score fica sem valor e não finge redistribuir', () => {
    const s = atencaoDoAtivo({ criticidade: null, reincidencia: reinc(null), horasParadas: null });
    expect(s.valor).toBeNull();
    expect(detalhamentoDoScore(s)).toMatchObject({ semDadoComPeso: [], chaveDoAviso: null });
  });

  it.each(IDIOMAS)('%s: nome de cada componente e o aviso formatam pelo catálogo', (idioma) => {
    const { t } = criarTradutor(idioma);
    const s = atencaoDoAtivo({ criticidade: 4, reincidencia: reinc(77), horasParadas: 24 });
    const d = detalhamentoDoScore(s);
    for (const l of d.linhas) {
      expect(CATALOGOS[idioma]).toHaveProperty([l.chaveDoNome]);
      expect(t(l.chaveDoNome as never)).not.toMatch(/[{}]/);
    }
    const aviso = t(d.chaveDoAviso as never, { componentes: 'A, B', ...d.valoresDoAviso });
    expect(aviso).not.toMatch(/[{}]/);
    expect(aviso).toContain('50');
  });

  it('pt-BR: o aviso fala em peso dividido entre os que têm dado', () => {
    const { t } = criarTradutor('pt-BR');
    expect(
      t('inteligencia.detalhamento.sem_dado', {
        componentes: 'Custo informado',
        quantidade: 1,
        peso: 0.1,
      }),
    ).toMatch(/Sem dado: Custo informado\. O peso dele \(10\s?%\) foi dividido/);
  });
});
