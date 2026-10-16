// "Procurar ativo" no HubKeep Intelligence (Cesar e Kaio, 16/10/2026): os
// ativos do termo, só dos hotéis em que a pessoa decide insight, para abrir a
// página do ativo sem precisar de insight nem de intervenção.
import type { Atribuicao, Escopo, Papel } from '@hubkeep/dominio';
import { describe, expect, it } from 'vitest';
import {
  type AtivoEncontrado,
  LEITURA_DA_BUSCA_DE_ATIVOS,
  LIMITE_DA_BUSCA_DE_ATIVOS,
  type PortasDaBuscaDeAtivos,
  procurarAtivos,
} from '../src/index';

const agora = new Date('2026-10-16T12:00:00Z');

const atribuicao = (papel: Papel, escopo: Escopo): Atribuicao => ({
  id: `a-${papel}`,
  usuarioId: 'u1',
  papel,
  escopo,
  validoAte: null,
  revogadoEm: null,
});

const ativo = (id: string, hotelId: string): AtivoEncontrado => ({
  id,
  nome: `Lava-roupa ${id}`,
  hotelId,
  bandeiraId: null,
});

function emMemoria(
  atribuicoes: Atribuicao[],
  ativos: AtivoEncontrado[],
): PortasDaBuscaDeAtivos & { buscas: { termo: string; limite: number }[] } {
  const buscas: { termo: string; limite: number }[] = [];
  const nao = async (): Promise<never> => {
    throw new Error('não usada');
  };
  return {
    buscas,
    modulos: async () => [{ modulo: 'inteligencia', inicio: new Date('2026-01-01'), fim: null }],
    atribuicoes: async () => atribuicoes,
    visibilidade: async () => ({
      aPartirDe: null,
      diasAposAtivacao: 60,
      papeis: ['admin_grupo', 'gestor_csc', 'gerente_hotel'],
    }),
    fuso: async () => 'America/Sao_Paulo',
    contagens: nao,
    insights: nao,
    insight: nao,
    ligados: nao,
    chamados: nao,
    decidir: nao,
    ativo: nao,
    metricasDoAtivo: nao,
    insightsDoEscopo: nao,
    nomes: async (p) => ({
      hoteis: Object.fromEntries(p.hotelIds.map((h) => [h, `Hotel ${h}`])),
      bandeiras: {},
      pessoas: {},
      ativos: {},
    }),
    ativosPorBusca: async (termo, limite) => {
      buscas.push({ termo, limite });
      return ativos.slice(0, limite);
    },
  };
}

describe('procurar ativo no Intelligence', () => {
  it('só os ativos dos hotéis em que a pessoa decide, com o nome do hotel', async () => {
    const p = emMemoria(
      [atribuicao('gerente_hotel', { tipo: 'hotel', hotelId: 'h6' })],
      [ativo('a1', 'h1'), ativo('a6', 'h6')],
    );
    const r = await procurarAtivos(p, 'lava', agora);
    expect(r.ativos.map((a) => a.id)).toEqual(['a6']);
    expect(r.nomes.hoteis).toEqual({ h6: 'Hotel h6' });
    expect(p.buscas).toEqual([{ termo: 'lava', limite: LEITURA_DA_BUSCA_DE_ATIVOS }]);
  });

  it('o Admin do grupo acha em todos os hotéis, até o limite da resposta', async () => {
    const muitos = Array.from({ length: 30 }, (_, i) => ativo(`a${i}`, `h${i % 6}`));
    const p = emMemoria([atribuicao('admin_grupo', { tipo: 'grupo' })], muitos);
    const r = await procurarAtivos(p, 'lava', agora);
    expect(r.ativos).toHaveLength(LIMITE_DA_BUSCA_DE_ATIVOS);
  });

  it('sem termo, a lista vem vazia e nada é lido; nenhum ativo do escopo, também', async () => {
    const p = emMemoria([atribuicao('admin_grupo', { tipo: 'grupo' })], [ativo('a1', 'h1')]);
    expect(await procurarAtivos(p, undefined, agora)).toEqual({
      ativos: [],
      nomes: { hoteis: {}, bandeiras: {}, pessoas: {}, ativos: {} },
    });
    expect(p.buscas).toEqual([]);
    const fora = emMemoria(
      [atribuicao('gerente_hotel', { tipo: 'hotel', hotelId: 'h9' })],
      [ativo('a1', 'h1')],
    );
    expect((await procurarAtivos(fora, 'lava', agora)).ativos).toEqual([]);
  });

  it('quem não decide insight não usa a busca', async () => {
    const p = emMemoria([atribuicao('tecnico', { tipo: 'hotel', hotelId: 'h1' })], []);
    await expect(procurarAtivos(p, 'lava', agora)).rejects.toMatchObject({
      codigo: 'inteligencia_indisponivel',
    });
  });
});
