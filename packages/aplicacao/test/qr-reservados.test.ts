// Códigos de QR reservados (M3), com portas em memória: quem gere o hotel
// gera o lote, de 1 a 500; o técnico não gera; a lista e a consulta passam
// pelo hotel visível e pelo código como uma pessoa digitaria.
import type { Atribuicao, Contexto } from '@hubkeep/dominio';
import { describe, expect, it } from 'vitest';
import { criarCasosDeUsoDeQrReservados } from '../src/index';

const ctx: Contexto = { usuarioId: 'u', tenantId: 't' };
const atr = (papel: Atribuicao['papel']): Atribuicao => ({
  id: 'a',
  usuarioId: 'u',
  papel,
  escopo: { tipo: 'hotel', hotelId: 'h-1' },
  validoAte: null,
  revogadoEm: null,
});
const codigoDe = async (p: Promise<unknown>) => {
  try {
    await p;
    return null;
  } catch (e) {
    return (e as { codigo: string }).codigo;
  }
};

function montar(papel: Atribuicao['papel']) {
  const pedidos: number[] = [];
  const casos = criarCasosDeUsoDeQrReservados({
    qr: {
      hotel: async (_c, id) => (id === 'h-1' ? { id, bandeiraId: null } : null),
      reservar: async (_c, _h, quantidade) => {
        pedidos.push(quantidade);
        return { loteId: 'l', codigos: Array.from({ length: quantidade }, () => '7K3M9QX2AB') };
      },
      codigos: async () => [
        { codigo: '7K3M9QX2AB', loteId: 'l', criadoEm: new Date(0), ligado: false },
      ],
      reserva: async (_c, codigo) =>
        codigo === '7K3M9QX2AB' ? { hotelId: 'h-1', ligado: false } : null,
    },
    atribuicoes: { doUsuario: async () => [atr(papel)] },
    relogio: { agora: () => new Date('2026-10-20T12:00:00Z') },
  });
  return { casos, pedidos };
}

describe('gerar o lote', () => {
  it('a gestão do hotel gera de 1 a 500', async () => {
    const { casos, pedidos } = montar('gerente_hotel');
    expect((await casos.gerar(ctx, 'h-1', 3)).codigos).toHaveLength(3);
    expect(await codigoDe(casos.gerar(ctx, 'h-1', 0))).toBe('qr_lote_invalido');
    expect(await codigoDe(casos.gerar(ctx, 'h-1', 501))).toBe('qr_lote_invalido');
    expect(pedidos).toEqual([3]);
  });

  it('o técnico não gera; o hotel invisível dá hotel_nao_encontrado', async () => {
    const { casos, pedidos } = montar('tecnico');
    expect(await codigoDe(casos.gerar(ctx, 'h-1', 3))).toBe('qr_reserva_fora_do_escopo');
    expect(await codigoDe(casos.gerar(ctx, 'h-2', 3))).toBe('hotel_nao_encontrado');
    expect(pedidos).toEqual([]);
  });
});

describe('listar e consultar', () => {
  it('a lista pede o hotel visível', async () => {
    const { casos } = montar('tecnico');
    expect(await casos.listar(ctx, 'h-1')).toHaveLength(1);
    expect(await codigoDe(casos.listar(ctx, 'h-2'))).toBe('hotel_nao_encontrado');
  });

  it('a consulta lê o código como digitado; o desconhecido dá qr_nao_reservado', async () => {
    const { casos } = montar('tecnico');
    expect(await casos.consultar(ctx, '7k3m9-qx2ab')).toEqual({
      codigo: '7K3M9QX2AB',
      hotelId: 'h-1',
      ligado: false,
    });
    expect(await codigoDe(casos.consultar(ctx, '7K3M9QX2AZ'))).toBe('qr_nao_reservado');
    expect(await codigoDe(casos.consultar(ctx, 'x'))).toBe('qr_nao_reservado');
  });
});
