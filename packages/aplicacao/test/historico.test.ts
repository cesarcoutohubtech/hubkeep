// Histórico do registro (D1): fora do escopo é 404 e a auditoria nem é lida;
// as mudanças saem do domínio; os nomes são pedidos só dos ids que aparecem.
import { ErroDeDominio } from '@hubkeep/dominio';
import { describe, expect, it, vi } from 'vitest';
import { criarCasosDeUsoDeHistorico } from '../src/casos-de-uso/historico';
import type { PortaHistorico } from '../src/portas/historico';

const ctx = { usuarioId: 'u1', tenantId: 't1' };
const EM = new Date('2026-09-30T12:00:00Z');

function porta(visivel: boolean): PortaHistorico {
  return {
    registroVisivel: vi.fn(async () => visivel),
    linhas: vi.fn(async () => [
      {
        id: 'a1',
        em: EM,
        acao: 'triar',
        usuarioId: 'g1',
        usuarioNome: 'Gerente',
        antes: { estado: 'aberto', prioridade_id: 'p1', versao: 1 },
        depois: { acao: 'triar', estado: 'em_triagem', prioridadeId: 'p2', versao: 2 },
      },
      {
        id: 'a2',
        em: EM,
        acao: 'cancelar',
        usuarioId: null,
        usuarioNome: null,
        antes: null,
        depois: { motivo: 'Duplicado', versao: 3 },
      },
    ]),
    referencias: vi.fn(async () => ({
      p2: { tipo: 'prioridade' as const, chavePadrao: 'urgente', nomes: {} },
    })),
    idiomaPadrao: vi.fn(async () => 'pt-BR' as const),
  };
}

describe('histórico do registro (D1)', () => {
  it('fora do escopo: 404 com a entidade, sem ler a auditoria', async () => {
    const p = porta(false);
    const erro = await criarCasosDeUsoDeHistorico({ historico: p })
      .historico(ctx, 'chamado', 'c1')
      .catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(ErroDeDominio);
    expect(erro).toMatchObject({
      codigo: 'registro_nao_encontrado',
      parametros: { entidade: 'chamado' },
    });
    expect(p.linhas).not.toHaveBeenCalled();
  });

  it('cada linha com as mudanças do domínio e os nomes dos ids que aparecem', async () => {
    const p = porta(true);
    const h = await criarCasosDeUsoDeHistorico({ historico: p }).historico(ctx, 'chamado', 'c1');
    expect(h.eventos.map((e) => [e.acao, e.mudancas])).toEqual([
      [
        'triar',
        [
          { campo: 'estado', chave: null, antes: 'aberto', depois: 'em_triagem' },
          { campo: 'prioridadeId', chave: null, antes: 'p1', depois: 'p2' },
        ],
      ],
      ['cancelar', [{ campo: 'motivo', chave: null, antes: null, depois: 'Duplicado' }]],
    ]);
    expect(p.referencias).toHaveBeenCalledWith(
      ctx,
      new Map([
        ['p1', 'prioridade'],
        ['p2', 'prioridade'],
      ]),
    );
    expect(h.referencias).toEqual({
      p2: { tipo: 'prioridade', chavePadrao: 'urgente', nomes: {} },
    });
    expect(h.idiomaPadrao).toBe('pt-BR');
  });

  it('sem id nas mudanças, os nomes não são pedidos', async () => {
    const p = porta(true);
    vi.mocked(p.linhas).mockResolvedValueOnce([
      {
        id: 'a3',
        em: EM,
        acao: 'alterar',
        usuarioId: 'g1',
        usuarioNome: 'Gerente',
        antes: { nome: 'UH 1' },
        depois: { nome: 'UH 101' },
      },
    ]);
    const h = await criarCasosDeUsoDeHistorico({ historico: p }).historico(ctx, 'local', 'l1');
    expect(h.referencias).toEqual({});
    expect(p.referencias).not.toHaveBeenCalled();
  });
});
