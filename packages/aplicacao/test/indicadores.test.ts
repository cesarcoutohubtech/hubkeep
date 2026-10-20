// Painel de indicadores (1c, item 8) com a porta em memória: quem abre o
// painel, o período conferido antes do banco, a visão de cada hotel (a gestão
// vê tudo; o proprietário, só os cartões), a rede e as bandeiras só com os
// hotéis da visão completa, a janela que cobre os fusos e as políticas. O que
// a RLS mostra é do teste de integração.
import {
  type Atribuicao,
  type Contexto,
  type NiveisDePolitica,
  SLA_PADRAO,
} from '@hubkeep/dominio';
import { describe, expect, it } from 'vitest';
import {
  type DadosDoHotel,
  type HotelDoPainel,
  type JanelaDosIndicadores,
  criarCasosDeUsoDeIndicadores,
} from '../src/index';

const ctx: Contexto = { usuarioId: 'u', tenantId: 't' };
const AGORA = new Date('2026-10-15T12:00:00Z');
const PERIODO = { inicio: '2026-10-01', fim: '2026-10-10' };

const atribuicao = (papel: Atribuicao['papel'], escopo: Atribuicao['escopo']): Atribuicao => ({
  id: 'a',
  usuarioId: 'u',
  papel,
  escopo,
  validoAte: null,
  revogadoEm: null,
});

const hotel = (id: string, extra: Partial<HotelDoPainel> = {}): HotelDoPainel => ({
  id,
  nome: `Hotel ${id}`,
  fuso: 'America/Sao_Paulo',
  bandeiraId: 'b1',
  bandeiraNome: 'Bandeira 1',
  uhsAtivas: 100,
  doUsuarioComoProprietario: false,
  ...extra,
});

const concluido = (id: string, abertoEm: string, concluidoEm: string, prazo?: string) => ({
  id,
  estado: 'concluido' as const,
  abertoEm: new Date(abertoEm),
  prazoSolucao: prazo ? new Date(prazo) : null,
  pausadoSegundos: 0,
  categoriaId: null,
  os: [
    {
      id: `os-${id}`,
      estado: 'concluida' as const,
      equipeId: 'e1',
      transicoes: [{ acao: 'concluir' as const, quando: new Date(concluidoEm) }],
    },
  ],
});

function casos(
  minhas: Atribuicao[],
  hoteis: HotelDoPainel[],
  dados: Record<string, Partial<DadosDoHotel>> = {},
  politicas: Record<string, Record<string, NiveisDePolitica>> = {},
) {
  const janelas: JanelaDosIndicadores[] = [];
  const filtros: unknown[] = [];
  const c = criarCasosDeUsoDeIndicadores({
    atribuicoes: {
      doUsuario: async () => minhas,
      buscar: async () => null,
      conceder: async () => ({ id: 'x' }),
      revogar: async () => undefined,
    },
    relogio: { agora: () => AGORA },
    indicadores: {
      hoteis: async (_c, f) => {
        filtros.push(f);
        return hoteis;
      },
      dados: async (_c, j) => {
        janelas.push(j);
        return new Map(
          j.hotelIds.map((id) => [
            id,
            { chamados: [], preventivas: [], periodosDeUh: [], apontamentos: [], ...dados[id] },
          ]),
        );
      },
      politicas: async (_c, ids) =>
        new Map(ids.map((id) => [id, new Map(Object.entries(politicas[id] ?? {}))])),
      equipes: async () => [{ id: 'e1', nome: 'Manutenção' }],
    },
  });
  return { c, janelas, filtros };
}

const GESTOR = atribuicao('gestor_csc', { tipo: 'grupo' });

describe('quem abre o painel e o período', () => {
  it('o técnico não abre, e o período inválido não chega ao banco', async () => {
    const tecnico = casos([atribuicao('tecnico', { tipo: 'hotel', hotelId: 'h1' })], [hotel('h1')]);
    await expect(tecnico.c.consultar(ctx, { periodo: PERIODO })).rejects.toMatchObject({
      codigo: 'indicadores_sem_permissao',
    });
    const gestor = casos([GESTOR], [hotel('h1')]);
    await expect(
      gestor.c.consultar(ctx, { periodo: { inicio: '2026-10-10', fim: '2026-10-01' } }),
    ).rejects.toMatchObject({ codigo: 'indicadores_periodo_invalido' });
    expect(gestor.filtros).toEqual([]);
  });

  it('passa o filtro de hotel e de bandeira para a porta', async () => {
    const { c, filtros } = casos([GESTOR], [hotel('h1')]);
    await c.consultar(ctx, { periodo: PERIODO, hotelId: 'h1', bandeiraId: 'b1' });
    expect(filtros).toEqual([{ hotelId: 'h1', bandeiraId: 'b1' }]);
  });
});

describe('a visão de cada hotel', () => {
  it('a gestão vê os indicadores; a rede, as bandeiras, a série e a produtividade somam os hotéis', async () => {
    const { c, janelas } = casos(
      [GESTOR],
      [
        hotel('h1'),
        hotel('h2', { fuso: 'Europe/Lisbon', bandeiraId: 'b2', bandeiraNome: 'Bandeira 2' }),
      ],
      {
        h1: { chamados: [concluido('c1', '2026-10-02T00:00:00Z', '2026-10-02T10:00:00Z')] },
        h2: { chamados: [concluido('c2', '2026-10-02T00:00:00Z', '2026-10-02T20:00:00Z')] },
      },
    );
    const r = await c.consultar(ctx, { periodo: PERIODO });
    expect(janelas[0]).toEqual({
      hotelIds: ['h1', 'h2'],
      diaInicio: '2026-10-01',
      diaFim: '2026-10-10',
      de: new Date('2026-09-30T23:00:00Z'),
      ate: new Date('2026-10-11T03:00:00Z'),
    });
    expect(r.rede?.mttrHoras).toBe(15);
    expect(r.rede?.hoteis).toBe(2);
    expect(r.hoteis.map((h) => h.visao)).toEqual(['completa', 'completa']);
    expect(r.bandeiras.map((b) => [b.nome, b.indicadores.mttrHoras])).toEqual([
      ['Bandeira 1', 10],
      ['Bandeira 2', 20],
    ]);
    expect(r.serie.find((d) => d.dia === '2026-10-02')?.encerrados).toBe(2);
    // Os dois chamados, sem categoria, em "Onde mais quebra" da rede.
    expect(r.ondeMaisQuebra).toEqual({
      categorias: [{ categoriaId: null, chamados: 2 }],
      outras: 0,
    });
    expect(r.produtividade).toEqual([
      {
        hotelId: 'h1',
        equipeId: 'e1',
        equipeNome: 'Manutenção',
        osConcluidas: 1,
        segundosApontados: 0,
      },
      {
        hotelId: 'h2',
        equipeId: 'e1',
        equipeNome: 'Manutenção',
        osConcluidas: 1,
        segundosApontados: 0,
      },
    ]);
    expect(r.metaDeSla).toBe(90);
  });

  it('o proprietário vê só os cartões dos hotéis dele, sem rede, comparação nem produtividade', async () => {
    const { c } = casos(
      [atribuicao('proprietario', { tipo: 'proprietario', proprietarioId: 'p1' })],
      [hotel('h1', { doUsuarioComoProprietario: true }), hotel('h2')],
      { h1: { chamados: [concluido('c1', '2026-10-02T00:00:00Z', '2026-10-02T10:00:00Z')] } },
    );
    const r = await c.consultar(ctx, { periodo: PERIODO });
    expect(r.hoteis).toEqual([
      {
        id: 'h1',
        nome: 'Hotel h1',
        bandeiraId: 'b1',
        visao: 'cartoes',
        cartoes: {
          backlog: 0,
          backlogPorIdade: { ate_2: 0, de_3_a_7: 0, de_8_a_15: 0, de_16_a_30: 0, mais_de_30: 0 },
          uhDias: 0,
          abertos: 1,
          chamadosPor100Uhs: 1,
        },
      },
    ]);
    expect([r.rede, r.bandeiras, r.serie, r.produtividade]).toEqual([null, [], [], []]);
  });

  it('sem hotel visível, o painel vem vazio, sem ler o resto', async () => {
    const { c, janelas } = casos([GESTOR], []);
    const r = await c.consultar(ctx, { periodo: PERIODO });
    expect(r).toMatchObject({ rede: null, hoteis: [], bandeiras: [] });
    expect(janelas).toEqual([]);
  });
});

describe('as políticas de cada hotel', () => {
  it('a meta de SLA do hotel e a do grupo, e a tolerância da preventiva', async () => {
    const sla = (meta: number) => ({ ...SLA_PADRAO, metaPercentual: meta });
    const preventiva = {
      id: 'p',
      estado: 'concluida' as const,
      equipeId: null,
      dataPrevista: '2026-10-05',
      transicoes: [{ acao: 'concluir' as const, quando: new Date('2026-10-06T12:00:00Z') }],
    };
    const { c } = casos([GESTOR], [hotel('h1')], { h1: { preventivas: [preventiva] } }, {});
    const semTolerancia = await c.consultar(ctx, { periodo: PERIODO });
    expect(semTolerancia.rede?.percentualDePreventivaEmDia).toBe(0);

    const comPoliticas = casos(
      [GESTOR],
      [hotel('h1')],
      { h1: { preventivas: [preventiva] } },
      {
        h1: {
          'preventiva.tolerancia_dias': { hotel: { dias: 1 } },
          'chamado.sla': { grupo: sla(85), hotel: sla(95) },
        },
      },
    );
    const r = await comPoliticas.c.consultar(ctx, { periodo: PERIODO });
    expect(r.rede?.percentualDePreventivaEmDia).toBe(100);
    expect(r.metaDeSla).toBe(85);
    expect(r.hoteis[0]).toMatchObject({ visao: 'completa', metaDeSla: 95 });
  });
});
