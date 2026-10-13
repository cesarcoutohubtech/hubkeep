// Feriados do hotel (fase 1c; ADR-042), com as portas em memória: quem lê vê a
// lista e se pode cadastrar; quem não cadastra é recusado antes de gravar; o
// nome e a data passam pelo domínio. A RLS é do teste de integração
// (packages/db/test/feriados-do-hotel.test.ts).
import type { Atribuicao, Contexto } from '@hubkeep/dominio';
import { describe, expect, it } from 'vitest';
import { type FeriadoDoHotelGravado, criarCasosDeUsoDeFeriados } from '../src/index';

const ctx: Contexto = { usuarioId: 'u', tenantId: 't' };
const atribuicao = (papel: Atribuicao['papel']): Atribuicao => ({
  id: 'a',
  usuarioId: 'u',
  papel,
  escopo: { tipo: 'hotel', hotelId: 'h1' },
  validoAte: null,
  revogadoEm: null,
});
const FERIADO: FeriadoDoHotelGravado = {
  id: 'f1',
  hotelId: 'h1',
  data: '2026-09-08',
  nome: 'Aniversário da cidade',
  anual: true,
  ativo: true,
};

function casos(papel: Atribuicao['papel']) {
  const gravados: unknown[] = [];
  const c = criarCasosDeUsoDeFeriados({
    feriados: {
      hotel: async (_c, id) => (id === 'h1' ? { id, bandeiraId: null } : null),
      feriado: async (_c, id) => (id === 'f1' ? { feriado: FERIADO, bandeiraId: null } : null),
      listar: async () => [FERIADO],
      criar: async (_c, hotelId, f) => {
        gravados.push(['criar', hotelId, f]);
        return { id: 'novo' };
      },
      alterar: async (_c, id, m) => void gravados.push(['alterar', id, m]),
    },
    atribuicoes: { doUsuario: async () => [atribuicao(papel)] },
    relogio: { agora: () => new Date('2026-10-13T12:00:00Z') },
  });
  return { c, gravados };
}

describe('feriados do hotel (casos de uso)', () => {
  it('a gestão lista, cadastra (com o nome e a data do domínio), altera, desativa e reativa', async () => {
    const { c, gravados } = casos('gerente_hotel');
    expect(await c.listar(ctx, 'h1')).toEqual({ feriados: [FERIADO], podeCadastrar: true });
    await c.criar(ctx, 'h1', { data: '2026-11-20', nome: '  Consciência   Negra ' });
    await c.alterar(ctx, 'f1', { nome: ' Aniversário do município ', anual: false });
    await c.desativar(ctx, 'f1');
    await c.reativar(ctx, 'f1');
    expect(gravados).toEqual([
      ['criar', 'h1', { data: '2026-11-20', nome: 'Consciência Negra', anual: false }],
      ['alterar', 'f1', { nome: 'Aniversário do município', anual: false }],
      ['alterar', 'f1', { ativo: false }],
      ['alterar', 'f1', { ativo: true }],
    ]);
  });

  it('o Técnico lê sem poder cadastrar; gravar é recusado antes da porta', async () => {
    const { c, gravados } = casos('tecnico');
    expect((await c.listar(ctx, 'h1')).podeCadastrar).toBe(false);
    await expect(c.criar(ctx, 'h1', { data: '2026-11-20', nome: 'X' })).rejects.toMatchObject({
      codigo: 'feriados_fora_do_escopo',
    });
    await expect(c.desativar(ctx, 'f1')).rejects.toMatchObject({
      codigo: 'feriados_fora_do_escopo',
    });
    expect(gravados).toEqual([]);
  });

  it('data inválida, hotel e feriado invisíveis', async () => {
    const { c } = casos('gerente_hotel');
    await expect(c.criar(ctx, 'h1', { data: '2026-02-30', nome: 'X' })).rejects.toMatchObject({
      codigo: 'feriado_data_invalida',
    });
    await expect(c.listar(ctx, 'h9')).rejects.toMatchObject({ codigo: 'hotel_nao_encontrado' });
    await expect(c.alterar(ctx, 'f9', { anual: true })).rejects.toMatchObject({
      codigo: 'feriado_nao_encontrado',
    });
  });
});
