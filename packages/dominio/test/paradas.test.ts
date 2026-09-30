// Parada do equipamento (C5): início e fim aceitos, parada aberta única, quem
// encerra pelo hotel e o tempo parado. As tabelas esperadas são escritas à mão.
import { describe, expect, it } from 'vitest';
import {
  type Atribuicao,
  PAPEIS,
  type Papel,
  exigirAtivoNoChamado,
  exigirParadaAberta,
  exigirSemParadaAberta,
  podeEncerrarParada,
  tempoParado,
  tempoParadoTotal,
  validarFimDaParada,
  validarParada,
} from '../src';

const agora = new Date('2026-09-29T12:00:00Z');
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

describe('início e fim da parada', () => {
  it('aceita início no passado, sem fim ou com fim depois do início', () => {
    expect(validarParada({ inicio: h(-3), fim: null }, agora)).toEqual({
      inicio: h(-3),
      fim: null,
    });
    expect(validarParada({ inicio: h(-3), fim: h(-1) }, agora).fim).toEqual(h(-1));
  });

  it('folga de 10 min para o relógio do aparelho adiantado', () => {
    expect(codigo(() => validarParada({ inicio: min(10), fim: null }, agora))).toBeNull();
    expect(codigo(() => validarParada({ inicio: min(11), fim: null }, agora))).toBe(
      'parada_invalida',
    );
    expect(codigo(() => validarFimDaParada(h(-1), min(11), agora))).toBe('parada_invalida');
  });

  it('fim igual ou antes do início, ou data inválida: parada_invalida', () => {
    expect(codigo(() => validarParada({ inicio: h(-1), fim: h(-1) }, agora))).toBe(
      'parada_invalida',
    );
    expect(codigo(() => validarParada({ inicio: h(-1), fim: h(-2) }, agora))).toBe(
      'parada_invalida',
    );
    expect(codigo(() => validarParada({ inicio: new Date('x'), fim: null }, agora))).toBe(
      'parada_invalida',
    );
    expect(codigo(() => validarFimDaParada(h(-1), new Date('x'), agora))).toBe('parada_invalida');
  });
});

describe('ativo e parada aberta', () => {
  it('parada só em chamado com ativo', () => {
    expect(exigirAtivoNoChamado('ativo-1')).toBe('ativo-1');
    expect(codigo(() => exigirAtivoNoChamado(null))).toBe('parada_sem_ativo');
  });

  it('uma parada aberta por ativo', () => {
    expect(codigo(() => exigirSemParadaAberta(null))).toBeNull();
    expect(codigo(() => exigirSemParadaAberta({ inicio: h(-2), fim: null }))).toBe(
      'parada_ja_aberta',
    );
  });

  it('encerrar exige a parada aberta', () => {
    const aberta = { id: 'p1', inicio: h(-2), fim: null };
    expect(exigirParadaAberta(aberta)).toBe(aberta);
    expect(codigo(() => exigirParadaAberta(null))).toBe('parada_nao_aberta');
    expect(codigo(() => exigirParadaAberta({ inicio: h(-2), fim: h(-1) }))).toBe(
      'parada_nao_aberta',
    );
  });
});

describe('quem encerra pelo hotel (web)', () => {
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
  const ENCERRA: Record<Papel, boolean> = {
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
      const r = codigo(() => podeEncerrarParada(ator(papel), HOTEL, agora));
      expect(r).toBe(ENCERRA[papel] ? null : 'parada_fora_do_papel');
    });

  it('gerente de outro hotel, não', () => {
    expect(codigo(() => podeEncerrarParada(ator('gerente_hotel', 'hotel-2'), HOTEL, agora))).toBe(
      'parada_fora_do_papel',
    );
  });
});

describe('tempo parado', () => {
  it('encerrada: do início ao fim; aberta: até agora', () => {
    expect(tempoParado({ inicio: h(-3), fim: h(-1) }, agora)).toBe(2 * 3_600_000);
    expect(tempoParado({ inicio: h(-3), fim: null }, agora)).toBe(3 * 3_600_000);
  });

  it('total sem contar duas vezes a sobreposição', () => {
    expect(tempoParadoTotal([], agora)).toBe(0);
    expect(
      tempoParadoTotal(
        [
          { inicio: h(-10), fim: h(-8) },
          { inicio: h(-9), fim: h(-7) },
          { inicio: h(-5), fim: h(-4) },
          { inicio: h(-2), fim: null },
        ],
        agora,
      ),
    ).toBe((3 + 1 + 2) * 3_600_000);
    expect(
      tempoParadoTotal(
        [
          { inicio: h(-6), fim: h(-1) },
          { inicio: h(-5), fim: h(-2) },
        ],
        agora,
      ),
    ).toBe(5 * 3_600_000);
  });
});
