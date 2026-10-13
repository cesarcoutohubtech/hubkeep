// Auditoria geral (fase 1c) com as portas em memória: só a gestão; o período
// conferido antes do banco; páginas de 50 (e de 1.000 na exportação) com uma
// linha a mais para saber se há página seguinte; o cursor da última linha, com
// o `em` exato; as mudanças e as referências como no histórico. O que a RLS
// mostra e o filtro pelos hotéis da gestão são do teste de integração.
import type { Atribuicao, Contexto, CursorDaAuditoria } from '@hubkeep/dominio';
import { describe, expect, it } from 'vitest';
import {
  type FiltroDaAuditoria,
  type LinhaDaAuditoriaGeral,
  criarCasosDeUsoDeAuditoriaGeral,
} from '../src/index';

const ctx: Contexto = { usuarioId: 'u', tenantId: 't' };
const AGORA = new Date('2026-10-13T12:00:00Z');
const PRIORIDADE = '0193a000-0000-4000-8000-0000000000a1';
const atribuicao = (papel: Atribuicao['papel']): Atribuicao => ({
  id: 'a',
  usuarioId: 'u',
  papel,
  escopo: { tipo: 'hotel', hotelId: 'h' },
  validoAte: null,
  revogadoEm: null,
});
const filtro: FiltroDaAuditoria = {
  de: new Date('2026-10-01T03:00:00Z'),
  ate: new Date('2026-10-14T03:00:00Z'),
  hotelId: null,
  entidade: null,
  acao: null,
  pessoa: null,
};

const linha = (n: number): LinhaDaAuditoriaGeral => ({
  id: `0193a000-0000-4000-8000-${String(n).padStart(12, '0')}`,
  em: new Date(Date.UTC(2026, 9, 13, 11, 0, 0) - n * 1000),
  emExato: new Date(Date.UTC(2026, 9, 13, 11, 0, 0) - n * 1000).toISOString().replace('Z', '123Z'),
  hotelId: 'h',
  hotelNome: 'Hotel Centro',
  entidade: 'chamado',
  registroId: '0193a000-0000-4000-8000-0000000000c1',
  acao: 'priorizar',
  usuarioId: 'u',
  usuarioNome: 'Gerente',
  antes: { prioridade_id: null },
  depois: { prioridadeId: PRIORIDADE },
});

function casos(papel: Atribuicao['papel'], total: number) {
  const pedidos: { depoisDe: CursorDaAuditoria | null; limite: number }[] = [];
  const todas = Array.from({ length: total }, (_, n) => linha(n));
  const c = criarCasosDeUsoDeAuditoriaGeral({
    auditoria: {
      pagina: async (_c, _f, depoisDe, limite) => {
        pedidos.push({ depoisDe, limite });
        const inicio = depoisDe ? todas.findIndex((l) => l.id === depoisDe.id) + 1 : 0;
        return todas.slice(inicio, inicio + limite);
      },
    },
    historico: {
      referencias: async (_c, ids) =>
        Object.fromEntries(
          [...ids.keys()].map((id) => [
            id,
            { tipo: 'prioridade' as const, chavePadrao: 'alta', nomes: {} },
          ]),
        ),
      idiomaPadrao: async () => 'pt-BR',
    },
    atribuicoes: {
      doUsuario: async () => [atribuicao(papel)],
      buscar: async () => null,
      conceder: async () => ({ id: 'x' }),
      revogar: async () => undefined,
    },
    relogio: { agora: () => AGORA },
  });
  return { c, pedidos };
}

describe('auditoria geral (1c)', () => {
  it('a página: 50 linhas, com as mudanças, as referências e o cursor da última', async () => {
    const { c, pedidos } = casos('gerente_hotel', 120);
    const p = await c.pagina(ctx, filtro);
    expect(pedidos).toEqual([{ depoisDe: null, limite: 51 }]);
    expect(p.linhas).toHaveLength(50);
    expect(p.linhas[0]).not.toHaveProperty('antes');
    expect(p.linhas[0]?.mudancas).toEqual([
      { campo: 'prioridadeId', chave: null, antes: null, depois: PRIORIDADE },
    ]);
    expect(p.referencias[PRIORIDADE]).toMatchObject({ tipo: 'prioridade' });
    const ultima = linha(49);
    expect(p.proximoCursor).toBe(`${ultima.emExato}~${ultima.id}`);

    const seguinte = await c.pagina(ctx, filtro, { cursor: p.proximoCursor });
    expect(pedidos[1]?.depoisDe).toEqual({ em: ultima.emExato, id: ultima.id });
    expect(seguinte.linhas[0]?.id).toBe(linha(50).id);
    const fim = await c.pagina(ctx, filtro, { cursor: seguinte.proximoCursor });
    expect(fim.linhas).toHaveLength(20);
    expect(fim.proximoCursor).toBeNull();
  });

  it('a exportação pede 1.000 por página', async () => {
    const { c, pedidos } = casos('admin_grupo', 3);
    const p = await c.pagina(ctx, filtro, { exportacao: true });
    expect(pedidos).toEqual([{ depoisDe: null, limite: 1001 }]);
    expect(p.proximoCursor).toBeNull();
  });

  it('só a gestão; o período e o cursor são conferidos antes do banco', async () => {
    const tecnico = casos('tecnico', 3);
    await expect(tecnico.c.pagina(ctx, filtro)).rejects.toMatchObject({
      codigo: 'auditoria_sem_permissao',
    });
    expect(tecnico.pedidos).toEqual([]);

    const gestor = casos('gestor_csc', 3);
    await expect(
      gestor.c.pagina(ctx, { ...filtro, ate: new Date('2027-01-02T03:00:00Z') }),
    ).rejects.toMatchObject({ codigo: 'auditoria_periodo_invalido' });
    await expect(gestor.c.pagina(ctx, filtro, { cursor: 'x' })).rejects.toMatchObject({
      codigo: 'auditoria_cursor_invalido',
    });
    expect(gestor.pedidos).toEqual([]);
  });
});
