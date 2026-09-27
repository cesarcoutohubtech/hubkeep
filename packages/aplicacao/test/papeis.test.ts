// Casos de uso de papéis com portas em memória: a orquestração (regra antes de
// gravar, alvo inexistente, revogação) sem banco. A garantia contra escalada no
// banco é provada na CI por packages/db/test/paridade-concessao.test.ts.
import type { Atribuicao, Contexto, PedidoDeConcessao } from '@hubkeep/dominio';
import { NaoEncontrado, PermissaoNegada } from '@hubkeep/dominio';
import { describe, expect, it } from 'vitest';
import { type PortaAtribuicoes, criarCasosDeUsoDePapeis } from '../src/index';

const AGORA = new Date('2026-09-24T12:00:00Z');
const ctx: Contexto = { usuarioId: 'eu', tenantId: 't1' };

function portas(minhas: Atribuicao[], outras: Atribuicao[] = []) {
  const gravadas: PedidoDeConcessao[] = [];
  const revogadas: string[] = [];
  const atribuicoes: PortaAtribuicoes = {
    doUsuario: async () => minhas,
    buscar: async (_c, id) => [...minhas, ...outras].find((a) => a.id === id) ?? null,
    conceder: async (_c, p) => {
      gravadas.push(p);
      return { id: 'nova' };
    },
    revogar: async (_c, id) => void revogadas.push(id),
  };
  const casos = criarCasosDeUsoDePapeis({
    atribuicoes,
    hoteis: {
      listarVisiveis: async () => [
        { id: 'h1', nome: 'Hotel 1', status: 'ativo', bandeiraId: null },
      ],
    },
    relogio: { agora: () => AGORA },
  });
  return { casos, gravadas, revogadas };
}

const a = (
  papel: Atribuicao['papel'],
  escopo: Atribuicao['escopo'],
  id: string = papel,
): Atribuicao => ({
  id,
  usuarioId: 'eu',
  papel,
  escopo,
  validoAte: papel === 'implantador' ? new Date('2026-12-31') : null,
  revogadoEm: null,
});

describe('casos de uso de papéis', () => {
  it('lista hotéis pela porta', async () => {
    const { casos } = portas([]);
    expect(await casos.listarHoteisVisiveis(ctx)).toEqual([
      { id: 'h1', nome: 'Hotel 1', status: 'ativo', bandeiraId: null },
    ]);
  });

  it('concessão permitida é gravada', async () => {
    const { casos, gravadas } = portas([a('admin_grupo', { tipo: 'grupo' })]);
    const pedido = {
      usuarioId: 'x',
      papel: 'tecnico' as const,
      escopo: { tipo: 'hotel' as const, hotelId: 'h1' },
    };
    expect(await casos.concederPapel(ctx, pedido)).toEqual({ id: 'nova' });
    expect(gravadas).toEqual([pedido]);
  });

  it('concessão negada não chega à porta de escrita', async () => {
    const { casos, gravadas } = portas([a('implantador', { tipo: 'hotel', hotelId: 'h1' })]);
    await expect(
      casos.concederPapel(ctx, { usuarioId: 'x', papel: 'admin_grupo', escopo: { tipo: 'grupo' } }),
    ).rejects.toBeInstanceOf(PermissaoNegada);
    expect(gravadas).toEqual([]);
  });

  it('verificarConcessao confere sem gravar', async () => {
    const { casos, gravadas } = portas([a('admin_grupo', { tipo: 'grupo' })]);
    await casos.verificarConcessao(ctx, {
      usuarioId: 'x',
      papel: 'tecnico',
      escopo: { tipo: 'grupo' },
    });
    expect(gravadas).toEqual([]);
  });

  it('revogar alvo inexistente é NaoEncontrado', async () => {
    const { casos } = portas([a('admin_grupo', { tipo: 'grupo' })]);
    await expect(casos.revogarPapel(ctx, 'nao-existe')).rejects.toBeInstanceOf(NaoEncontrado);
  });

  it('revogação permitida chega à porta; negada não', async () => {
    const alvo = { ...a('tecnico', { tipo: 'hotel', hotelId: 'h1' }, 'alvo'), usuarioId: 'outro' };
    const admin = portas([a('admin_grupo', { tipo: 'grupo' })], [alvo]);
    await admin.casos.revogarPapel(ctx, 'alvo');
    expect(admin.revogadas).toEqual(['alvo']);

    const gerente = portas([a('gerente_hotel', { tipo: 'hotel', hotelId: 'h1' })], [alvo]);
    await expect(gerente.casos.revogarPapel(ctx, 'alvo')).rejects.toBeInstanceOf(PermissaoNegada);
    expect(gerente.revogadas).toEqual([]);
  });
});
