// Impressão da OS (1c, item 9): o custo sai para quem tem papel vigente, que
// não o de proprietário, com escopo sobre o hotel; o aceite no papel.
import { describe, expect, it } from 'vitest';
import { type Atribuicao, aceiteNaImpressao, custoNaImpressao } from '../src/index';

const AGORA = new Date('2026-10-19T12:00:00Z');
const HOTEL = { id: 'h1', bandeiraId: 'b1' };

const atr = (
  papel: Atribuicao['papel'],
  escopo: Atribuicao['escopo'],
  extra: Partial<Atribuicao> = {},
): Atribuicao => ({
  id: 'a',
  usuarioId: 'u',
  papel,
  escopo,
  validoAte: null,
  revogadoEm: null,
  ...extra,
});

describe('o custo na impressão', () => {
  it('a gestão, o técnico do hotel e a bandeira do hotel veem o custo', () => {
    for (const a of [
      atr('admin_grupo', { tipo: 'grupo' }),
      atr('gestor_csc', { tipo: 'bandeira', bandeiraId: 'b1' }),
      atr('gerente_hotel', { tipo: 'hotel', hotelId: 'h1' }),
      atr('tecnico', { tipo: 'hotel', hotelId: 'h1' }),
    ]) {
      expect(custoNaImpressao([a], HOTEL, AGORA)).toBe(true);
    }
  });

  it('quem só enxerga o hotel como proprietário não vê o custo', () => {
    expect(
      custoNaImpressao([atr('proprietario', { tipo: 'hotel', hotelId: 'h1' })], HOTEL, AGORA),
    ).toBe(false);
    expect(
      custoNaImpressao(
        [atr('proprietario', { tipo: 'proprietario', proprietarioId: 'p1' })],
        HOTEL,
        AGORA,
      ),
    ).toBe(false);
  });

  it('o papel de outro hotel, o revogado e o vencido não contam', () => {
    expect(
      custoNaImpressao(
        [
          atr('proprietario', { tipo: 'hotel', hotelId: 'h1' }),
          atr('gerente_hotel', { tipo: 'hotel', hotelId: 'h2' }),
          atr('gestor_csc', { tipo: 'bandeira', bandeiraId: 'b2' }),
          atr('admin_grupo', { tipo: 'grupo' }, { revogadoEm: new Date('2026-10-01T00:00:00Z') }),
          atr(
            'tecnico',
            { tipo: 'hotel', hotelId: 'h1' },
            { validoAte: new Date('2026-10-18T00:00:00Z') },
          ),
        ],
        HOTEL,
        AGORA,
      ),
    ).toBe(false);
  });

  it('o proprietário que também é Gerente do hotel vê o custo', () => {
    expect(
      custoNaImpressao(
        [
          atr('proprietario', { tipo: 'hotel', hotelId: 'h1' }),
          atr('gerente_hotel', { tipo: 'hotel', hotelId: 'h1' }),
        ],
        HOTEL,
        AGORA,
      ),
    ).toBe(true);
  });
});

describe('o aceite na impressão', () => {
  it('assinado, aceito, pendente e a cancelada sem aceite', () => {
    expect(aceiteNaImpressao({ estado: 'aceita', assinaturaAceiteId: 'x' })).toBe('assinado');
    expect(aceiteNaImpressao({ estado: 'aceita', assinaturaAceiteId: null })).toBe('aceito');
    expect(aceiteNaImpressao({ estado: 'concluida', assinaturaAceiteId: null })).toBe('pendente');
    // Reaberta e concluída de novo: a assinatura do aceite anterior não vale.
    expect(aceiteNaImpressao({ estado: 'em_execucao', assinaturaAceiteId: 'x' })).toBe('pendente');
    expect(aceiteNaImpressao({ estado: 'cancelada', assinaturaAceiteId: null })).toBeNull();
  });
});
