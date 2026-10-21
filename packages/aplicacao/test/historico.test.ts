// Histórico do registro (D1): fora do escopo é 404 e a auditoria nem é lida;
// as mudanças saem do domínio; os nomes são pedidos só dos ids que aparecem.
// No histórico da OS, o custo informado some para o proprietário (1c).
import { type Atribuicao, ErroDeDominio } from '@hubkeep/dominio';
import { describe, expect, it, vi } from 'vitest';
import { criarCasosDeUsoDeHistorico } from '../src/casos-de-uso/historico';
import type { PortaHistorico } from '../src/portas/historico';
import type { OsGravada } from '../src/portas/triagem';

const ctx = { usuarioId: 'u1', tenantId: 't1' };
const EM = new Date('2026-09-30T12:00:00Z');

const atr = (papel: Atribuicao['papel']): Atribuicao => ({
  id: `a-${papel}`,
  usuarioId: 'u1',
  papel,
  escopo: { tipo: 'hotel', hotelId: 'h1' },
  validoAte: null,
  revogadoEm: null,
});

function criar(p: PortaHistorico, minhas: Atribuicao[] = [atr('gerente_hotel')]) {
  const os = vi.fn(async (_c: unknown, id: string) =>
    id === 'os1' ? ({ id, hotelId: 'h1', bandeiraId: null } as OsGravada) : null,
  );
  const casos = criarCasosDeUsoDeHistorico({
    historico: p,
    triagem: { os },
    atribuicoes: { doUsuario: async () => minhas },
    relogio: { agora: () => EM },
  });
  return { casos, os };
}

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
    const erro = await criar(p)
      .casos.historico(ctx, 'chamado', 'c1')
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
    const h = await criar(p).casos.historico(ctx, 'chamado', 'c1');
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
    const h = await criar(p).casos.historico(ctx, 'local', 'l1');
    expect(h.referencias).toEqual({});
    expect(p.referencias).not.toHaveBeenCalled();
  });

  describe('o custo informado no histórico da OS', () => {
    const aceite = [
      {
        id: 'a4',
        em: EM,
        acao: 'aceitar',
        usuarioId: 'g1',
        usuarioNome: 'Gerente',
        antes: { estado: 'concluida', custo_informado: null, versao: 4 },
        depois: { custoInformado: 350, estado: 'aceita', versao: 5 },
      },
    ];
    const campos = async (minhas: Atribuicao[], entidade: 'os' | 'chamado' = 'os') => {
      const p = porta(true);
      vi.mocked(p.linhas).mockResolvedValueOnce(aceite);
      const { casos, os } = criar(p, minhas);
      const h = await casos.historico(ctx, entidade, 'os1');
      return { campos: h.eventos.flatMap((e) => e.mudancas.map((m) => m.campo)), os };
    };

    it('o Gerente do hotel vê o custo', async () => {
      expect((await campos([atr('gerente_hotel')])).campos).toEqual(['custoInformado', 'estado']);
    });

    it('quem só enxerga o hotel como proprietário não vê o custo', async () => {
      expect((await campos([atr('proprietario')])).campos).toEqual(['estado']);
    });

    it('fora da OS, a OS nem é lida', async () => {
      const { os } = await campos([atr('proprietario')], 'chamado');
      expect(os).not.toHaveBeenCalled();
    });
  });
});
