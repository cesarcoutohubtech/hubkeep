import { describe, expect, it } from 'vitest';
import {
  LIMITE_DO_LOTE_DE_QR,
  exigirCodigoReservadoLivre,
  podeReservarQr,
  validarTamanhoDoLote,
} from '../src/qr-reservado';
import type { Atribuicao } from '../src/tipos';

const H1 = { id: 'h1', bandeiraId: null };
const agora = new Date('2026-10-20T12:00:00Z');
const atribuicao = (
  papel: Atribuicao['papel'],
  extra: { hotelId?: string; validoAte?: Date } = {},
): Atribuicao => ({
  id: 'a',
  usuarioId: 'u',
  papel,
  escopo: { tipo: 'hotel', hotelId: extra.hotelId ?? 'h1' },
  validoAte: extra.validoAte ?? null,
  revogadoEm: null,
});

describe('podeReservarQr', () => {
  it('o Implantador e a gestão do hotel geram', () => {
    for (const papel of ['implantador', 'gerente_hotel'] as const) {
      expect(podeReservarQr([atribuicao(papel)], H1, agora).permitido).toBe(true);
    }
  });

  it('o técnico, outro hotel e o implantador vencido não geram', () => {
    const r = podeReservarQr([atribuicao('tecnico')], H1, agora);
    expect(r.permitido).toBe(false);
    if (!r.permitido) expect(r.erro.codigo).toBe('qr_reserva_fora_do_escopo');
    expect(
      podeReservarQr([atribuicao('gerente_hotel', { hotelId: 'h2' })], H1, agora).permitido,
    ).toBe(false);
    expect(
      podeReservarQr(
        [atribuicao('implantador', { validoAte: new Date('2026-10-19T00:00:00Z') })],
        H1,
        agora,
      ).permitido,
    ).toBe(false);
  });
});

describe('validarTamanhoDoLote', () => {
  it('aceita de 1 ao limite', () => {
    expect(validarTamanhoDoLote(1)).toBe(1);
    expect(validarTamanhoDoLote(LIMITE_DO_LOTE_DE_QR)).toBe(LIMITE_DO_LOTE_DE_QR);
  });

  it('recusa zero, acima do limite e fração', () => {
    for (const n of [0, LIMITE_DO_LOTE_DE_QR + 1, 2.5, Number.NaN]) {
      expect(() => validarTamanhoDoLote(n)).toThrow(
        expect.objectContaining({ codigo: 'qr_lote_invalido', parametros: { maximo: 500 } }),
      );
    }
  });
});

describe('exigirCodigoReservadoLivre', () => {
  it('o código reservado no hotel e livre passa', () => {
    expect(() => exigirCodigoReservadoLivre({ hotelId: 'h1', ligado: false }, 'h1')).not.toThrow();
  });

  it('sem reserva ou reservado em outro hotel: qr_nao_reservado', () => {
    for (const r of [null, { hotelId: 'h2', ligado: false }]) {
      expect(() => exigirCodigoReservadoLivre(r, 'h1')).toThrow(
        expect.objectContaining({ codigo: 'qr_nao_reservado' }),
      );
    }
  });

  it('o código que já tem ativo: qr_ja_ligado', () => {
    expect(() => exigirCodigoReservadoLivre({ hotelId: 'h1', ligado: true }, 'h1')).toThrow(
      expect.objectContaining({ codigo: 'qr_ja_ligado' }),
    );
  });
});
