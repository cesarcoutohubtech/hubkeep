// Recurring Failure Score. Caso da seção 37 do PRD: 5 OS de HVAC no mesmo
// ativo em 60 dias dão score alto, com detalhamento, e sugerem insight. As
// contas esperadas estão escritas à mão em cada caso.
import { describe, expect, it } from 'vitest';
import {
  PADRAO_REINCIDENCIA,
  diasAposPreventiva,
  marcarAposPreventiva,
  reincidencia,
  sugereInsight,
} from '../src';
import { agora, corretiva, dia } from './apoio';

// Aberturas a cada 14 dias, cada uma concluída 2 dias depois; a última aberta.
const cincoEm60Dias = (codigoFalha: string | null = null) =>
  [-57, -43, -29, -15, -1].map((d, i) =>
    corretiva({
      abertaEm: dia(d),
      concluidaEm: i < 4 ? dia(d + 2) : null,
      reaberturas: i === 2 ? 1 : 0,
      codigoFalha,
    }),
  );

describe('reincidência', () => {
  it('PRD 37: 5 OS de HVAC em 60 dias → score alto, insight e detalhamento', () => {
    const s = reincidencia(cincoEm60Dias(), agora);
    // corretivas 5/5 × 0,30 + intervalo (1 − 14/30) × 0,15 + reaberturas 1/3 × 0,15
    // + voltas 4/4 × 0,15 = 0,58, sobre 0,75 de peso presente = 77.
    expect(s.valor).toBe(77);
    expect(s.faixa).toBe('alta_atencao');
    expect(sugereInsight(s)).toBe(true);
    expect(s.versao).toBe(4);
    expect(s.ausentes).toEqual(['mesma_falha', 'apos_preventiva']);
    const por = Object.fromEntries(s.componentes.map((c) => [c.chave, c]));
    expect(por.corretivas?.evidencia).toEqual({ quantidade: 5, janelaDias: 90, limite: 5 });
    expect(por.intervalo?.evidencia.intervaloMedioDias).toBe(14);
    expect(por.reaberturas?.evidencia.quantidade).toBe(1);
    expect(por.apos_corretiva?.evidencia.quantidade).toBe(4);
    expect(s.componentes.reduce((t, c) => t + c.pesoEfetivo, 0)).toBeCloseTo(1);
  });

  it('com o código de falha da instrumentação, a mesma falha entra no score', () => {
    const s = reincidencia(cincoEm60Dias('hvac_ruido'), agora);
    // 0,58 + 5/5 × 0,15 = 0,73, sobre 0,90 = 81.
    expect(s.valor).toBe(81);
    expect(s.ausentes).toEqual(['apos_preventiva']);
    const mesma = s.componentes.find((c) => c.chave === 'mesma_falha');
    expect(mesma?.evidencia).toEqual({ codigoFalha: 'hvac_ruido', quantidade: 5, comCodigo: 5 });
  });

  it('falhas com códigos todos diferentes não contam como mesma falha', () => {
    const cs = cincoEm60Dias().map((c, i) => ({ ...c, codigoFalha: `f${i}` }));
    expect(reincidencia(cs, agora).componentes.find((c) => c.chave === 'mesma_falha')?.valor).toBe(
      0,
    );
  });

  it('uma corretiva isolada fica em normal', () => {
    const s = reincidencia([corretiva({ abertaEm: dia(-10) })], agora);
    // 1/5 × 0,30 = 0,06, sobre 0,75 = 8.
    expect([s.valor, s.faixa]).toEqual([8, 'normal']);
    expect(sugereInsight(s)).toBe(false);
  });

  it('a corretiva de fora da janela só serve de anterior para a volta', () => {
    const s = reincidencia(
      [
        corretiva({ abertaEm: dia(-100), concluidaEm: dia(-95) }),
        corretiva({ abertaEm: dia(-80) }),
      ],
      agora,
    );
    // corretivas 1/5 × 0,30 + volta 1/1 × 0,15 = 0,21, sobre 0,75 = 28.
    expect(s.valor).toBe(28);
    expect(s.componentes.find((c) => c.chave === 'corretivas')?.evidencia.quantidade).toBe(1);
  });

  it('sem corretivas, zero; corretiva no futuro não conta', () => {
    expect(reincidencia([], agora).valor).toBe(0);
    expect(reincidencia([corretiva({ abertaEm: dia(5) })], agora).valor).toBe(0);
  });

  it('a falha depois de preventiva entra com o dado marcado na corretiva', () => {
    const cs = cincoEm60Dias().map((c, i) => ({ ...c, aposPreventiva: i < 2 }));
    const s = reincidencia(cs, agora);
    // 0,58 + 2/5 × 0,10 = 0,62, sobre 0,85 = 73.
    expect(s.valor).toBe(73);
    const comp = s.componentes.find((c) => c.chave === 'apos_preventiva');
    expect(comp?.evidencia).toEqual({ quantidade: 2, comDado: 5, diasAposPreventiva: 30 });
  });

  describe('marcarAposPreventiva (versão 4)', () => {
    const concluida = (quando: Date) => ({
      dataPrevista: '2026-08-01',
      transicoes: [
        { para: 'em_execucao' as const, quando: dia(-1, quando) },
        { para: 'concluida' as const, quando },
      ],
    });

    it('marca a corretiva aberta até 30 dias depois da conclusão de uma preventiva do ativo', () => {
      const cs = [-60, -40, -20, -5].map((d) => corretiva({ abertaEm: dia(d) }));
      // Conclusão em −50: a de −60 abre antes; a de −40, 10 dias depois; a de
      // −20, 30 dias depois (o limite conta); a de −5, 45 dias depois.
      const marcadas = marcarAposPreventiva(
        cs,
        [concluida(dia(-50))],
        diasAposPreventiva(PADRAO_REINCIDENCIA),
        agora,
      );
      expect(marcadas.map((c) => c.aposPreventiva)).toEqual([false, true, true, false]);
      // Com duas preventivas, vale qualquer uma: a de −5 fica a 5 dias da de −10.
      const duas = marcarAposPreventiva(cs, [concluida(dia(-50)), concluida(dia(-10))], 30, agora);
      expect(duas.map((c) => c.aposPreventiva)).toEqual([false, true, true, true]);
    });

    it('fora dos dias, antes da conclusão ou com a conclusão depois de agora, não conta', () => {
      const cs = [corretiva({ abertaEm: dia(-3) })];
      expect(marcarAposPreventiva(cs, [concluida(dia(-34))], 30, agora)[0]?.aposPreventiva).toBe(
        false,
      );
      expect(marcarAposPreventiva(cs, [concluida(dia(-2))], 30, agora)[0]?.aposPreventiva).toBe(
        false,
      );
      // A preventiva ainda aberta não tem conclusão: o ativo tem o dado, e a falha não conta.
      expect(
        marcarAposPreventiva(cs, [{ dataPrevista: '2026-09-01', transicoes: [] }], 30, agora)[0]
          ?.aposPreventiva,
      ).toBe(false);
      // Na leitura de um dia passado, a conclusão depois do instante ainda não existia.
      expect(marcarAposPreventiva(cs, [concluida(dia(-10))], 30, dia(-11))[0]?.aposPreventiva).toBe(
        false,
      );
    });

    it('o ativo sem nenhuma OS preventiva fica sem dado', () => {
      const cs = cincoEm60Dias();
      for (const p of [undefined, []]) {
        const marcadas = marcarAposPreventiva(cs, p, 30, agora);
        expect(marcadas.every((c) => c.aposPreventiva === undefined)).toBe(true);
        expect(reincidencia(marcadas, agora).ausentes).toContain('apos_preventiva');
      }
    });

    it('a política gravada antes da versão 4, sem o campo, fica com os 30 dias do padrão', () => {
      const antiga = { ...PADRAO_REINCIDENCIA };
      delete antiga.diasAposPreventiva;
      expect(diasAposPreventiva(antiga)).toBe(30);
      expect(diasAposPreventiva({ ...PADRAO_REINCIDENCIA, diasAposPreventiva: 7 })).toBe(7);
    });
  });

  it('a configuração muda o resultado e vai junto no score', () => {
    const config = {
      janelaDias: 30,
      limiteCorretivas: 2,
      intervaloReferenciaDias: 30,
      limiteReaberturas: 3,
      diasAposCorretiva: 30,
      pesos: {
        corretivas: 1,
        intervalo: 0,
        reaberturas: 0,
        mesmaFalha: 0,
        aposCorretiva: 0,
        aposPreventiva: 0,
      },
      faixas: [{ desde: 0, chave: 'normal' }],
    };
    const s = reincidencia(cincoEm60Dias(), agora, config);
    // Na janela de 30 dias ficam 3 corretivas (−29, −15 e −1): 3 ≥ 2 → 100.
    expect(s.valor).toBe(100);
    expect(s.configuracao).toBe(config);
  });
});
