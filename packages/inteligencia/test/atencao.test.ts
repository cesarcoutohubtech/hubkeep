// Asset Attention Score, versão 2 (aprovada em 08/10/2026, com as respostas de
// 10/10/2026): nove componentes, UH-dias com peso 0, a disponibilidade de cada
// componente e o peso do componente sem dado dividido entre os presentes.
import { CATALOGOS, IDIOMAS, criarTradutor } from '@hubkeep/i18n';
import { describe, expect, it } from 'vitest';
import {
  type CustoDaAtencao,
  type MedicoesDoAtivo,
  MINIMO_DE_CUSTO_INFORMADO_NO_TENANT,
  PADRAO_ATENCAO,
  type Score,
  type SituacaoDaGarantia,
  VERSAO_ATENCAO,
  atencaoDoAtivo,
  custoDisponivelNoTenant,
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

/** Custo do ativo com o tenant acima do mínimo (30 de 40 aceitas com o dado). */
const custoDe = (soma: number, informadas = 1, aceitas = 1): CustoDaAtencao => ({
  ativo: { soma, informadas, aceitas },
  tenant: { informadas: 30, aceitas: 40 },
});

describe('atenção por ativo, versão 6', () => {
  it('a versão, os pesos padrão e o mínimo de medições são os aprovados', () => {
    expect(VERSAO_ATENCAO).toBe(6);
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
    expect(PADRAO_ATENCAO.minMedicoes).toBe(3);
  });

  it('só os dados internos: o peso do que falta vai para os presentes, e os ausentes ficam listados', () => {
    const s = atencaoDoAtivo({
      criticidade: 4,
      reincidencia: reinc(77),
      horasParadas: 24,
    });
    // Impacto no hóspede e garantia valem 0 e têm peso:
    // (0,77 × 0,20 + 24/48 × 0,15 + 0 + 0,8 × 0,15 + 0) / 0,70 = 0,349 / 0,70 = 50.
    expect([s.valor, s.faixa, s.versao]).toEqual([50, 'atencao', 6]);
    expect(s.ausentes).toEqual([
      'custo',
      'preventiva_atrasada',
      'medicoes_fora_da_faixa',
      'uh_dias',
    ]);
    expect(s.componentes.find((c) => c.chave === 'reincidencia')?.evidencia).toEqual({
      score: 77,
      faixa: 'x',
      versao: 1,
    });
    const usados = Object.fromEntries(s.componentes.map((c) => [c.chave, c.pesoEfetivo]));
    expect(usados['reincidencia']).toBeCloseTo(0.2 / 0.7);
    expect(usados['impacto_hospede']).toBeCloseTo(0.15 / 0.7);
    expect(usados['garantia_vencida']).toBeCloseTo(0.05 / 0.7);
    expect(usados['custo']).toBe(0);
  });

  it('com todas as fontes, os pesos valem como estão (UH-dias segue sem dado, com peso 0)', () => {
    const s = atencaoDoAtivo({
      criticidade: 4,
      reincidencia: reinc(77),
      horasParadas: 24,
      custo: custoDe(6000, 3, 4),
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
      informadas: 3,
      aceitas: 4,
      disponivelNoTenant: true,
      percentualNoTenant: 75,
      minimoNoTenant: 50,
    });
    expect(s.componentes.find((c) => c.chave === 'garantia_vencida')?.evidencia).toEqual({
      vencida: true,
      diasVencida: 10,
      semData: false,
    });
  });

  it('criticidade e custo informado entram quando existem', () => {
    const base = { reincidencia: reinc(77), horasParadas: 24 };
    const sem = atencaoDoAtivo({ ...base, criticidade: null });
    const com = atencaoDoAtivo({ ...base, criticidade: 5, custo: custoDe(15_000) });
    // Sem os dois: (0,154 + 0,075) / 0,55 = 42.
    expect([sem.valor, sem.ausentes]).toEqual([
      42,
      ['criticidade', 'custo', 'preventiva_atrasada', 'medicoes_fora_da_faixa', 'uh_dias'],
    ]);
    // Com os dois, o custo acima do limite: (0,154 + 0,075 + 0,15 + 0,10) / 0,80 = 60.
    expect([com.valor, com.ausentes]).toEqual([
      60,
      ['preventiva_atrasada', 'medicoes_fora_da_faixa', 'uh_dias'],
    ]);
  });

  it('sem criticidade cadastrada, a reincidência pesa sobre os sempre disponíveis', () => {
    const s = atencaoDoAtivo({ criticidade: null, reincidencia: reinc(40), horasParadas: 0 });
    // 0,4 × 0,20 / 0,55 = 15.
    expect([s.valor, s.faixa]).toEqual([15, 'normal']);
    expect(s.ausentes).toContain('criticidade');
  });

  it('parada acima do limite não passa do componente cheio', () => {
    const s = atencaoDoAtivo({ criticidade: null, reincidencia: reinc(null), horasParadas: 500 });
    expect(s.componentes.find((c) => c.chave === 'parada')?.valor).toBe(1);
    // 0,15 / (0,15 + 0,15 + 0,05) = 43.
    expect(s.valor).toBe(43);
  });

  describe('sempre disponíveis: tempo parado e impacto no hóspede', () => {
    it('o que não foi marcado é "não teve": vale 0, com peso, e não fica sem dado', () => {
      const s = atencaoDoAtivo({
        criticidade: null,
        reincidencia: reinc(null),
        horasParadas: null,
      });
      expect(s.valor).toBe(0);
      expect(s.ausentes).not.toContain('parada');
      expect(s.ausentes).not.toContain('impacto_hospede');
      const comp = (k: string) => s.componentes.find((c) => c.chave === k);
      expect(comp('parada')).toMatchObject({ valor: 0, evidencia: { horas: 0 } });
      expect(comp('impacto_hospede')).toMatchObject({ valor: 0, evidencia: { score: 0 } });
      expect(comp('parada')?.pesoEfetivo).toBeGreaterThan(0);
      expect(comp('impacto_hospede')?.pesoEfetivo).toBeGreaterThan(0);
    });
  });

  describe('garantia vencida', () => {
    const base = { criticidade: null, reincidencia: reinc(null), horasParadas: 0 };
    const compDe = (garantia?: SituacaoDaGarantia | null) =>
      atencaoDoAtivo(garantia === undefined ? base : { ...base, garantia }).componentes.find(
        (c) => c.chave === 'garantia_vencida',
      );

    it('vencida vale 1; dentro da garantia, 0; sem a data, 0 (não vencida), com peso', () => {
      expect(compDe({ vencida: true, diasVencida: 3 })?.valor).toBe(1);
      expect(compDe({ vencida: false, diasVencida: 0 })?.valor).toBe(0);
      for (const g of [null, undefined]) {
        expect(compDe(g)).toMatchObject({
          valor: 0,
          evidencia: { vencida: false, diasVencida: 0, semData: true },
        });
        expect(compDe(g)?.pesoEfetivo).toBeGreaterThan(0);
      }
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
    const compDe = (medicoes?: MedicoesDoAtivo | null, minMedicoes = 3) =>
      atencaoDoAtivo(medicoes === undefined ? base : { ...base, medicoes }, {
        ...PADRAO_ATENCAO,
        minMedicoes,
      }).componentes.find((c) => c.chave === 'medicoes_fora_da_faixa');

    it('a partir do mínimo, é a fração das medições fora da faixa', () => {
      expect(compDe({ foraDaFaixa: 3, total: 4 })?.valor).toBe(0.75);
      expect(compDe({ foraDaFaixa: 0, total: 6 })?.valor).toBe(0);
      expect(compDe({ foraDaFaixa: 2, total: 3 })?.valor).toBeCloseTo(2 / 3);
    });

    it('abaixo do mínimo, o ativo contribui 0, sem redistribuir o peso', () => {
      for (const m of [
        { foraDaFaixa: 2, total: 2 },
        { foraDaFaixa: 0, total: 0 },
      ]) {
        const c = compDe(m);
        expect(c).toMatchObject({
          valor: 0,
          pontos: 0,
          evidencia: { total: m.total, minimo: 3, abaixoDoMinimo: true },
        });
        expect(c?.pesoEfetivo).toBeGreaterThan(0);
      }
    });

    it('o mínimo vem da política: com 1, uma medição basta', () => {
      expect(compDe({ foraDaFaixa: 1, total: 1 }, 1)?.valor).toBe(1);
      expect(compDe({ foraDaFaixa: 1, total: 1 }, 3)?.valor).toBe(0);
    });

    it('sem a categoria com item de medição (null ou ausente), sem dado', () => {
      expect(compDe(null)?.valor).toBeNull();
      expect(compDe(undefined)?.valor).toBeNull();
    });
  });

  describe('custo informado: a regra da metade das corretivas aceitas do tenant', () => {
    const base = { criticidade: null, reincidencia: reinc(null), horasParadas: 0 };
    const compDe = (custo?: CustoDaAtencao | null) =>
      atencaoDoAtivo(custo === undefined ? base : { ...base, custo }).componentes.find(
        (c) => c.chave === 'custo',
      );

    it('disponível a partir de 50% das aceitas com o dado; abaixo, ou sem aceitas, não', () => {
      expect(MINIMO_DE_CUSTO_INFORMADO_NO_TENANT).toBe(0.5);
      expect(custoDisponivelNoTenant({ informadas: 5, aceitas: 10 })).toBe(true);
      expect(custoDisponivelNoTenant({ informadas: 10, aceitas: 10 })).toBe(true);
      expect(custoDisponivelNoTenant({ informadas: 4, aceitas: 9 })).toBe(false);
      expect(custoDisponivelNoTenant({ informadas: 0, aceitas: 0 })).toBe(false);
    });

    it('disponível, o ativo soma só as corretivas com o dado; sem nenhuma, vale 0', () => {
      expect(compDe(custoDe(2500, 2, 5))).toMatchObject({
        valor: 0.25,
        evidencia: { valor12m: 2500, informadas: 2, aceitas: 5 },
      });
      expect(compDe(custoDe(0, 0, 3))).toMatchObject({ valor: 0, evidencia: { informadas: 0 } });
      expect(compDe(custoDe(25_000))?.valor).toBe(1);
    });

    it('abaixo do mínimo no tenant, sem dado, por mais que o ativo tenha o custo', () => {
      const c = compDe({
        ativo: { soma: 9000, informadas: 3, aceitas: 3 },
        tenant: { informadas: 49, aceitas: 100 },
      });
      expect(c).toMatchObject({
        valor: null,
        evidencia: { valor12m: null, disponivelNoTenant: false, percentualNoTenant: 49 },
      });
      expect(compDe(null)?.valor).toBeNull();
      expect(compDe(undefined)?.valor).toBeNull();
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
    expect(d.semDadoComPeso).toEqual(['custo', 'preventiva_atrasada', 'medicoes_fora_da_faixa']);
    // Sem dado: 10 + 10 + 10 = 30% do peso; UH-dias (peso 0) não conta.
    expect(d.pesoRedistribuido).toBeCloseTo(0.3);
    expect(d.chaveDoAviso).toBe('inteligencia.detalhamento.sem_dado');
    expect(d.valoresDoAviso).toEqual({ quantidade: 3, peso: d.pesoRedistribuido });
    const linha = (c: string) => d.linhas.find((l) => l.componente === c);
    expect(linha('custo')).toMatchObject({ semDado: true, pesoUsado: 0, pontos: 0, nota: null });
    expect(linha('custo')?.peso).toBeCloseTo(0.1);
    expect(linha('reincidencia')).toMatchObject({ semDado: false, nota: null });
    expect(linha('reincidencia')?.peso).toBeCloseTo(0.2);
    expect(linha('reincidencia')?.pesoUsado).toBeCloseTo(0.2 / 0.7);
    expect(linha('uh_dias')).toMatchObject({ semDado: true, peso: 0, pesoUsado: 0 });
    expect(linha('custo')?.chaveDoNome).toBe('inteligencia.componente.atencao_ativo.custo');
  });

  it('sem nada para redistribuir, não há aviso (UH-dias com peso 0 não conta)', () => {
    const s = atencaoDoAtivo({
      criticidade: 4,
      reincidencia: reinc(77),
      horasParadas: 24,
      custo: custoDe(1000),
      impactoHospede: 10,
      preventivaAtrasada: false,
      medicoes: { foraDaFaixa: 0, total: 3 },
      garantia: { vencida: false, diasVencida: 0 },
    });
    const d = detalhamentoDoScore(s);
    expect(d).toMatchObject({ semDadoComPeso: [], pesoRedistribuido: 0, chaveDoAviso: null });
  });

  it('só os sempre disponíveis: o score vale 0 e o aviso lista o que falta', () => {
    const s = atencaoDoAtivo({ criticidade: null, reincidencia: reinc(null), horasParadas: null });
    expect(s.valor).toBe(0);
    expect(detalhamentoDoScore(s)).toMatchObject({
      semDadoComPeso: [
        'reincidencia',
        'criticidade',
        'custo',
        'preventiva_atrasada',
        'medicoes_fora_da_faixa',
      ],
      chaveDoAviso: 'inteligencia.detalhamento.sem_dado',
    });
  });

  describe('as notas da linha', () => {
    const notas = detalhamentoDoScore(
      atencaoDoAtivo({
        criticidade: 4,
        reincidencia: reinc(77),
        horasParadas: 24,
        custo: custoDe(4000, 3, 4),
        medicoes: { foraDaFaixa: 1, total: 2 },
      }),
    ).linhas;
    const nota = (c: string) => notas.find((l) => l.componente === c)?.nota;
    const semNoTenant = detalhamentoDoScore(
      atencaoDoAtivo({
        criticidade: 4,
        reincidencia: reinc(77),
        horasParadas: 24,
        custo: {
          ativo: { soma: 4000, informadas: 3, aceitas: 4 },
          tenant: { informadas: 9, aceitas: 20 },
        },
      }),
    ).linhas.find((l) => l.componente === 'custo')?.nota;

    it('custo informado em X de Y corretivas; sem dado no tenant; medições abaixo do mínimo; garantia sem data', () => {
      expect(nota('custo')).toEqual({
        chave: 'inteligencia.detalhamento.custo_informado_nas_aceitas',
        valores: { informadas: 3, aceitas: 4 },
      });
      expect(semNoTenant).toEqual({
        chave: 'inteligencia.detalhamento.custo_sem_dado_no_tenant_aceitas',
        valores: { percentual: 45, minimo: 50 },
      });
      expect(nota('medicoes_fora_da_faixa')).toEqual({
        chave: 'inteligencia.detalhamento.medicoes_abaixo_do_minimo',
        valores: { total: 2, minimo: 3 },
      });
      expect(nota('garantia_vencida')).toEqual({
        chave: 'inteligencia.detalhamento.garantia_sem_data',
        valores: {},
      });
      expect(nota('reincidencia')).toBeNull();
    });

    it('a atenção versão 2, já gravada, segue com a nota das corretivas encerradas', () => {
      const v3 = atencaoDoAtivo({
        criticidade: 4,
        reincidencia: reinc(77),
        horasParadas: 24,
        custo: custoDe(4000, 3, 4),
      });
      const v2 = {
        ...v3,
        componentes: v3.componentes.map((c) => {
          if (c.chave !== 'custo') return c;
          const { aceitas, ...resto } = c.evidencia;
          return { ...c, evidencia: { ...resto, encerradas: aceitas } as typeof c.evidencia };
        }),
      };
      expect(detalhamentoDoScore(v2).linhas.find((l) => l.componente === 'custo')?.nota).toEqual({
        chave: 'inteligencia.detalhamento.custo_informado_em',
        valores: { informadas: 3, encerradas: 4 },
      });
    });

    it('pt-BR: o custo informado em X de Y corretivas', () => {
      const { t } = criarTradutor('pt-BR');
      const n = nota('custo');
      expect(t(n?.chave as never, n?.valores)).toBe(
        'Custo informado em 3 de 4 corretivas aceitas nos últimos 12 meses.',
      );
    });

    it.each(IDIOMAS)('%s: as quatro notas formatam pelo catálogo', (idioma) => {
      const { t } = criarTradutor(idioma);
      for (const n of [
        nota('custo'),
        semNoTenant,
        nota('medicoes_fora_da_faixa'),
        nota('garantia_vencida'),
      ]) {
        expect(CATALOGOS[idioma]).toHaveProperty([n?.chave as string]);
        const texto = t(n?.chave as never, n?.valores);
        expect(texto).not.toMatch(/[{}]/);
        expect(texto.length).toBeGreaterThan(10);
      }
    });
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
    expect(aviso).toContain('30');
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
