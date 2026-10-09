// UH indisponível (I4): só UH, início e fim aceitos, um período aberto por
// chamado, quem marca e libera pelo hotel, a liberação na conclusão e os
// UH-dias perdidos. As tabelas esperadas são escritas à mão.
import { describe, expect, it } from 'vitest';
import {
  type Atribuicao,
  ESTADOS_DO_CHAMADO,
  ESTADOS_QUE_ACEITAM_UH_INDISPONIVEL,
  PAPEIS,
  type Papel,
  type PeriodoDeUhIndisponivel,
  exigirChamadoQueAceitaUhIndisponivel,
  exigirPeriodoAberto,
  exigirSemPeriodoAberto,
  exigirUhParaIndisponibilidade,
  periodoALiberarNaConclusao,
  podeGerirUhIndisponivel,
  uhDiasPerdidos,
  validarFimDaIndisponibilidade,
  validarInicioDaIndisponibilidade,
} from '../src';

const agora = new Date('2026-10-09T12:00:00Z');
const h = (horas: number) => new Date(agora.getTime() + horas * 3_600_000);
const min = (minutos: number) => new Date(agora.getTime() + minutos * 60_000);
const codigo = (f: () => unknown): string | null => {
  try {
    f();
    return null;
  } catch (e) {
    return (e as { codigo: string }).codigo;
  }
};

describe('só a UH fica indisponível', () => {
  it('aceita UH e recusa área comum', () => {
    expect(codigo(() => exigirUhParaIndisponibilidade({ tipo: 'uh' }))).toBeNull();
    expect(codigo(() => exigirUhParaIndisponibilidade({ tipo: 'area_comum' }))).toBe(
      'uh_indisponivel_fora_de_uh',
    );
  });
});

describe('início e fim do período', () => {
  it('aceita início no passado e até a folga do relógio no futuro', () => {
    expect(validarInicioDaIndisponibilidade(h(-3), agora)).toEqual(h(-3));
    expect(validarInicioDaIndisponibilidade(min(10), agora)).toEqual(min(10));
  });

  it('recusa início além da folga e data inválida', () => {
    expect(codigo(() => validarInicioDaIndisponibilidade(min(11), agora))).toBe(
      'uh_indisponivel_periodo_invalido',
    );
    expect(codigo(() => validarInicioDaIndisponibilidade(new Date('x'), agora))).toBe(
      'uh_indisponivel_periodo_invalido',
    );
  });

  it('fim depois do início e não no futuro', () => {
    expect(validarFimDaIndisponibilidade(h(-3), h(-1), agora)).toEqual(h(-1));
    for (const fim of [h(-3), h(-4), min(11), new Date('x')])
      expect(codigo(() => validarFimDaIndisponibilidade(h(-3), fim, agora))).toBe(
        'uh_indisponivel_periodo_invalido',
      );
  });
});

describe('estado do chamado para marcar depois', () => {
  for (const estado of ESTADOS_DO_CHAMADO)
    it(estado, () => {
      const esperado = ['aberto', 'em_triagem', 'em_execucao', 'aguardando_aceite'].includes(estado)
        ? null
        : 'transicao_invalida';
      expect(codigo(() => exigirChamadoQueAceitaUhIndisponivel(estado))).toBe(esperado);
    });

  it('a lista é a dos estados em curso', () => {
    expect([...ESTADOS_QUE_ACEITAM_UH_INDISPONIVEL]).toEqual([
      'aberto',
      'em_triagem',
      'em_execucao',
      'aguardando_aceite',
    ]);
  });
});

describe('um período aberto por chamado', () => {
  it('marcar com período aberto é conflito; sem, passa', () => {
    expect(codigo(() => exigirSemPeriodoAberto(null))).toBeNull();
    expect(codigo(() => exigirSemPeriodoAberto({ inicio: h(-1), fim: null }))).toBe(
      'uh_indisponivel_ja_aberta',
    );
  });

  it('liberar exige o período aberto', () => {
    const aberto = { inicio: h(-1), fim: null };
    expect(exigirPeriodoAberto(aberto)).toBe(aberto);
    expect(codigo(() => exigirPeriodoAberto(null))).toBe('uh_indisponivel_nao_aberta');
    expect(codigo(() => exigirPeriodoAberto({ inicio: h(-2), fim: h(-1) }))).toBe(
      'uh_indisponivel_nao_aberta',
    );
  });
});

describe('liberação na conclusão da OS', () => {
  const aberto = { inicio: h(-2), fim: null };
  it('só com "UH liberada" respondido sim e o período aberto', () => {
    expect(periodoALiberarNaConclusao(aberto, true)).toBe(aberto);
    expect(periodoALiberarNaConclusao(aberto, false)).toBeNull();
    expect(periodoALiberarNaConclusao(aberto, undefined)).toBeNull();
    expect(periodoALiberarNaConclusao(null, true)).toBeNull();
    expect(periodoALiberarNaConclusao({ inicio: h(-2), fim: h(-1) }, true)).toBeNull();
  });
});

describe('quem marca e libera pelo hotel (web)', () => {
  const HOTEL = { id: 'hotel-1', bandeiraId: null };
  const ator = (papel: Papel, hotelId = HOTEL.id) => {
    const escopo: Atribuicao['escopo'] =
      papel === 'admin_grupo' ? { tipo: 'grupo' } : { tipo: 'hotel', hotelId };
    return {
      usuarioId: 'u',
      atribuicoes: [
        { id: 'a', usuarioId: 'u', papel, escopo, validoAte: null, revogadoEm: null },
      ] as Atribuicao[],
      equipes: [],
    };
  };
  const GERE: Record<Papel, boolean> = {
    admin_grupo: true,
    gestor_csc: true,
    gerente_hotel: true,
    implantador: false,
    tecnico: false,
    solicitante: false,
    proprietario: false,
  };

  for (const papel of PAPEIS)
    it(papel, () => {
      expect(codigo(() => podeGerirUhIndisponivel(ator(papel), HOTEL, agora))).toBe(
        GERE[papel] ? null : 'uh_indisponivel_fora_do_papel',
      );
    });

  it('gerente de outro hotel, não', () => {
    expect(
      codigo(() => podeGerirUhIndisponivel(ator('gerente_hotel', 'hotel-2'), HOTEL, agora)),
    ).toBe('uh_indisponivel_fora_do_papel');
  });
});

describe('UH-dias perdidos', () => {
  const de = new Date('2026-10-01T00:00:00Z');
  const ate = new Date('2026-10-08T00:00:00Z');
  const dia = (d: number, hora = 0) => new Date(Date.UTC(2026, 9, d, hora));
  const periodo = (
    localId: string,
    inicio: Date,
    fim: Date | null,
    extra: Partial<PeriodoDeUhIndisponivel> = {},
  ): PeriodoDeUhIndisponivel => ({
    chamadoId: `c-${localId}-${inicio.toISOString()}`,
    hotelId: 'h1',
    localId,
    inicio,
    fim,
    ...extra,
  });

  it('soma por UH, em dias, com uma casa decimal', () => {
    expect(
      uhDiasPerdidos(
        [periodo('uh-101', dia(2), dia(3)), periodo('uh-102', dia(2), dia(2, 12))],
        de,
        ate,
        ate,
      ),
    ).toBe(1.5);
  });

  it('o trecho sobreposto na mesma UH conta uma vez', () => {
    expect(
      uhDiasPerdidos(
        [periodo('uh-101', dia(2), dia(4)), periodo('uh-101', dia(3), dia(5))],
        de,
        ate,
        ate,
      ),
    ).toBe(3);
  });

  it('corta no intervalo e conta o aberto até agora', () => {
    expect(uhDiasPerdidos([periodo('uh-101', dia(6), null)], de, ate, dia(7))).toBe(1);
    expect(uhDiasPerdidos([periodo('uh-101', dia(6), null)], de, ate, dia(10))).toBe(2);
    expect(uhDiasPerdidos([periodo('uh-101', dia(9), dia(10))], de, ate, dia(10))).toBe(0);
  });

  it('o período de chamado cancelado não conta', () => {
    expect(
      uhDiasPerdidos([periodo('uh-101', dia(2), dia(3), { chamadoCancelado: true })], de, ate, ate),
    ).toBe(0);
  });

  it('a mesma UH em hotéis diferentes não se sobrepõe', () => {
    expect(
      uhDiasPerdidos(
        [periodo('uh-101', dia(2), dia(3)), periodo('uh-101', dia(2), dia(3), { hotelId: 'h2' })],
        de,
        ate,
        ate,
      ),
    ).toBe(2);
  });
});
