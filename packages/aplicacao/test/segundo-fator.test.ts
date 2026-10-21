// Remoção do segundo fator pelo Admin do grupo (SP1, ADR-049 e adendo ao
// ADR-024): a regra e o membro visível vêm antes do Auth, e a auditoria
// depois, com quantos fatores saíram.
import { type Atribuicao, type Contexto } from '@hubkeep/dominio';
import { describe, expect, it } from 'vitest';
import { criarCasoDeUsoDoSegundoFator } from '../src/index';

const ctx: Contexto = { usuarioId: 'admin', tenantId: 't-1' };
const atr = (papel: Atribuicao['papel']): Atribuicao => ({
  id: `a-${papel}`,
  usuarioId: 'admin',
  papel,
  escopo: { tipo: 'grupo' },
  validoAte: null,
  revogadoEm: null,
});
const codigoDe = async (p: Promise<unknown>) => {
  try {
    await p;
    return null;
  } catch (e) {
    return (e as { codigo?: string }).codigo ?? String(e);
  }
};

function montar(o: { minhas?: Atribuicao[]; membros?: string[] } = {}) {
  const passos: string[] = [];
  const caso = criarCasoDeUsoDoSegundoFator({
    atribuicoes: { doUsuario: async () => o.minhas ?? [atr('admin_grupo')] },
    membros: {
      existe: async (_c, id) => (o.membros ?? ['tec']).includes(id),
      registrarRemocaoDoSegundoFator: async (_c, id, n) => void passos.push(`auditar:${id}:${n}`),
    },
    segundoFator: {
      removerFatores: async (id) => {
        passos.push(`remover:${id}`);
        return 2;
      },
    },
    relogio: { agora: () => new Date('2026-10-21T12:00:00Z') },
  });
  return { caso, passos };
}

describe('remoção do segundo fator (SP1)', () => {
  it('o Admin remove os fatores do membro e a auditoria registra quantos', async () => {
    const { caso, passos } = montar();
    await expect(caso.removerSegundoFator(ctx, 'tec')).resolves.toEqual({ removidos: 2 });
    expect(passos).toEqual(['remover:tec', 'auditar:tec:2']);
  });

  it('quem não é Admin, o próprio e o membro de fora não chegam ao Auth', async () => {
    const naoAdmin = montar({ minhas: [atr('gestor_csc')] });
    expect(await codigoDe(naoAdmin.caso.removerSegundoFator(ctx, 'tec'))).toBe(
      'segundo_fator_so_admin',
    );
    const proprio = montar({ membros: ['admin'] });
    expect(await codigoDe(proprio.caso.removerSegundoFator(ctx, 'admin'))).toBe(
      'nao_remove_o_proprio_segundo_fator',
    );
    const deFora = montar();
    expect(await codigoDe(deFora.caso.removerSegundoFator(ctx, 'outro'))).toBe(
      'membro_nao_encontrado',
    );
    expect([...naoAdmin.passos, ...proprio.passos, ...deFora.passos]).toEqual([]);
  });
});
