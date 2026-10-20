// Aprovação do cadastro dos ativos (M4), com portas em memória: a fila é da
// gestão do hotel; a decisão vai com a versão vista e o motivo normalizado na
// recusa; o já decidido e o desativado não são decididos de novo; e a
// preparação do cadastro devolve a situação do PWA pela política do hotel.
import type { Atribuicao, Contexto, SituacaoDoCadastro } from '@hubkeep/dominio';
import { describe, expect, it } from 'vitest';
import {
  type CadastroDoAtivo,
  criarCasosDeUsoDeAtivos,
  criarCasosDeUsoDeCadastrosDeAtivos,
} from '../src/index';

const ctx: Contexto = { usuarioId: 'u', tenantId: 't' };
const HOTEL = { id: 'h-1', bandeiraId: null };
const papel = (p: Atribuicao['papel'], hotelId = HOTEL.id): Atribuicao => ({
  id: 'a',
  usuarioId: 'u',
  papel: p,
  escopo: { tipo: 'hotel', hotelId },
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

function montar(minhas: Atribuicao[] = [papel('gerente_hotel')]) {
  const ativos: Record<string, CadastroDoAtivo> = {
    pendente: { id: 'pendente', hotelId: HOTEL.id, versao: 2, situacao: 'pendente', ativo: true },
    aprovado: { id: 'aprovado', hotelId: HOTEL.id, versao: 1, situacao: 'aprovado', ativo: true },
    desistido: {
      id: 'desistido',
      hotelId: HOTEL.id,
      versao: 3,
      situacao: 'pendente',
      ativo: false,
    },
  };
  const decisoes: unknown[] = [];
  const casos = criarCasosDeUsoDeCadastrosDeAtivos({
    cadastros: {
      hotel: async () => HOTEL,
      pendentes: async () => [],
      ativo: async (_c, id) => ativos[id] ?? null,
      decidir: async (_c, d) => {
        decisoes.push(d);
        return { versao: d.versaoEsperada + 1 };
      },
    },
    atribuicoes: { doUsuario: async () => minhas },
    relogio: { agora: () => new Date('2026-10-19T12:00:00Z') },
  });
  return { casos, decisoes };
}

describe('aprovação do cadastro dos ativos (M4)', () => {
  it('o Gerente aprova com a versão vista', async () => {
    const { casos, decisoes } = montar();
    expect(
      await casos.decidir(ctx, 'pendente', { decisao: 'aprovado', motivo: null, versao: 2 }),
    ).toEqual({ versao: 3 });
    expect(decisoes).toEqual([
      {
        ativoId: 'pendente',
        hotelId: HOTEL.id,
        versaoEsperada: 2,
        decisao: 'aprovado',
        motivo: null,
      },
    ]);
  });

  it('a recusa leva o motivo normalizado; sem motivo, recusa', async () => {
    const { casos, decisoes } = montar();
    expect(
      await codigoDe(
        casos.decidir(ctx, 'pendente', { decisao: 'recusado', motivo: ' ', versao: 2 }),
      ),
    ).toBe('motivo_obrigatorio');
    await casos.decidir(ctx, 'pendente', {
      decisao: 'recusado',
      motivo: ' Local  errado',
      versao: 2,
    });
    expect(decisoes).toMatchObject([{ decisao: 'recusado', motivo: 'Local errado' }]);
  });

  it('o já decidido, o desativado e o que não existe não são decididos', async () => {
    const { casos, decisoes } = montar();
    const aprovar = { decisao: 'aprovado', motivo: null, versao: 1 };
    expect(await codigoDe(casos.decidir(ctx, 'aprovado', aprovar))).toBe('cadastro_ja_decidido');
    expect(await codigoDe(casos.decidir(ctx, 'desistido', aprovar))).toBe('ativo_desativado');
    expect(await codigoDe(casos.decidir(ctx, 'nenhum', aprovar))).toBe('ativo_nao_encontrado');
    expect(decisoes).toEqual([]);
  });

  it('o Implantador e o Técnico não veem a fila nem decidem', async () => {
    for (const p of ['implantador', 'tecnico'] as const) {
      const { casos } = montar([papel(p)]);
      expect(await codigoDe(casos.pendentes(ctx, HOTEL.id))).toBe('cadastro_fora_do_escopo');
      expect(
        await codigoDe(
          casos.decidir(ctx, 'pendente', { decisao: 'aprovado', motivo: null, versao: 2 }),
        ),
      ).toBe('cadastro_fora_do_escopo');
    }
  });

  it('a preparação do cadastro devolve a situação do PWA pela política do hotel', async () => {
    const situacaoCom = async (politica: {
      hotel?: unknown;
    }): Promise<SituacaoDoCadastro | undefined> => {
      const casos = criarCasosDeUsoDeAtivos({
        ativos: {
          hotel: async () => HOTEL,
          local: async () => ({ id: 'l-1', hotelId: HOTEL.id, status: 'ativo' }),
          politica: async (_c: unknown, _h: unknown, chave: string) =>
            chave === 'ativo.aprovacao_do_cadastro' ? politica : {},
          categorias: async () => [],
          modelo: async () => null,
        } as never,
        atribuicoes: {
          doUsuario: async () => [papel('tecnico')],
          doMembro: async () => [],
        } as never,
        relogio: { agora: () => new Date('2026-10-19T12:00:00Z') },
      });
      const c = await casos.prepararCadastro(ctx, {
        localId: 'l-1',
        categoriaId: null,
        nome: 'Split',
        fabricante: null,
        modelo: null,
        numeroSerie: null,
      });
      return c.situacaoNoPwa;
    };
    expect(await situacaoCom({})).toBe('aprovado');
    expect(await situacaoCom({ hotel: { ligado: true } })).toBe('pendente');
  });
});
