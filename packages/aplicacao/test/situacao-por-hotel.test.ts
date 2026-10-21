// A situação por hotel da tela inicial (glossário de métricas, versão 4), com
// as portas em memória: só os hotéis da gestão de quem pede, o mais grave
// primeiro, as contagens pelos avisos em aberto, o chamado crítico pelo maior
// peso, a preventiva atrasada pela tolerância do hotel e os abertos por dia no
// fuso de cada hotel. O SQL e a RLS são do teste de integração
// (packages/db/test/avisos-de-sla.test.ts).
import { type Atribuicao, HORARIO_PADRAO, SLA_PADRAO } from '@hubkeep/dominio';
import { describe, expect, it } from 'vitest';
import {
  type ChamadoComAvisos,
  type HotelDoPainel,
  type PreventivaAberta,
  criarCasosDeUsoDaSituacaoPorHotel,
} from '../src/index';

const H = 3_600_000;
const AGORA = new Date('2026-10-20T15:00:00Z'); // 12:00 em São Paulo
const em = (horas: number) => new Date(AGORA.getTime() + horas * H);
const ctx = { tenantId: 't', usuarioId: 'u' };
const URGENTE = '0193f0a0-0000-7000-8000-0000000000aa';
const BAIXA = '0193f0a0-0000-7000-8000-0000000000bb';
const copia = { 'chamado.sla': SLA_PADRAO, 'hotel.horario_atendimento': HORARIO_PADRAO };

const chamado = (c: Partial<ChamadoComAvisos>): ChamadoComAvisos => ({
  id: 'c',
  hotelId: 'h1',
  descricao: 'Ar não liga',
  estado: 'em_execucao',
  prioridadeId: BAIXA,
  categoriaId: null,
  politicaAplicada: copia,
  pausaEmCurso: null,
  jaTeveOs: true,
  prazoAtendimento: null,
  prazoSolucao: em(10),
  gravados: [],
  ...c,
});

const hotel = (id: string, nome: string, fuso = 'America/Sao_Paulo'): HotelDoPainel => ({
  id,
  nome,
  fuso,
  bandeiraId: null,
  bandeiraNome: null,
  uhsAtivas: 10,
  doUsuarioComoProprietario: false,
});

const atribuicao = (papel: Atribuicao['papel'], hotelId = 'h1'): Atribuicao => ({
  id: `a-${hotelId}`,
  usuarioId: 'u',
  papel,
  escopo: { tipo: 'hotel', hotelId },
  validoAte: null,
  revogadoEm: null,
});

function casos(p: {
  minhas: Atribuicao[];
  hoteis: HotelDoPainel[];
  chamados?: ChamadoComAvisos[];
  preventivas?: PreventivaAberta[];
  aberturas?: { hotelId: string; abertoEm: Date }[];
  toleranciaDoH1?: number;
}) {
  const pedidos: { ateDia: string; desde: Date; ids: readonly string[] }[] = [];
  const c = criarCasosDeUsoDaSituacaoPorHotel({
    situacao: {
      preventivasAbertas: async (_c, ids, ateDia) => {
        pedidos.push({ ateDia, desde: new Date(0), ids });
        return p.preventivas ?? [];
      },
      aberturas: async (_c, ids, desde) => {
        pedidos.push({ ateDia: '', desde, ids });
        return p.aberturas ?? [];
      },
    },
    avisos: { chamadosEmCurso: async () => p.chamados ?? [] },
    indicadores: {
      hoteis: async () => p.hoteis,
      politicas: async () =>
        new Map(
          p.toleranciaDoH1 === undefined
            ? []
            : [
                [
                  'h1',
                  new Map([['preventiva.tolerancia_dias', { grupo: { dias: p.toleranciaDoH1 } }]]),
                ],
              ],
        ),
    },
    atribuicoes: { doUsuario: async () => p.minhas },
    prioridades: {
      listar: async () => [
        { id: URGENTE, chavePadrao: 'urgente', nomes: {}, ordem: 10, peso: 40, ativa: true },
        { id: BAIXA, chavePadrao: 'baixa', nomes: {}, ordem: 40, peso: 10, ativa: true },
      ],
    },
    relogio: { agora: () => AGORA },
  });
  return { c, pedidos };
}

describe('situação por hotel', () => {
  it('quem não é da gestão recebe 403, sem ler o banco', async () => {
    const { c, pedidos } = casos({ minhas: [atribuicao('tecnico')], hoteis: [hotel('h1', 'A')] });
    await expect(c.consultar(ctx)).rejects.toMatchObject({
      codigo: 'situacao_por_hotel_sem_permissao',
    });
    expect(pedidos).toEqual([]);
  });

  it('só os hotéis da gestão de quem pede; sem nenhum, a lista vazia', async () => {
    const { c } = casos({
      minhas: [atribuicao('gerente_hotel', 'h1'), atribuicao('proprietario', 'h2')],
      hoteis: [hotel('h1', 'A'), hotel('h2', 'B')],
    });
    expect((await c.consultar(ctx)).hoteis.map((h) => h.hotelId)).toEqual(['h1']);
    const { c: so } = casos({
      minhas: [atribuicao('gerente_hotel', 'h9')],
      hoteis: [hotel('h1', 'A')],
    });
    expect(await so.consultar(ctx)).toEqual({ hoteis: [] });
  });

  it('as contagens e a situação: o crítico vencido deixa o hotel crítico, e ele vem primeiro', async () => {
    const { c } = casos({
      minhas: [atribuicao('gestor_csc', 'h1'), atribuicao('gestor_csc', 'h2')],
      hoteis: [hotel('h1', 'Alfa'), hotel('h2', 'Beta')],
      chamados: [
        // h1: em risco pelo aviso gravado; um crítico sem prazo vencido.
        chamado({ id: 'r', gravados: [{ tipo: 'solucao_em_risco', prazo: em(10) }] }),
        chamado({ id: 'k', prioridadeId: URGENTE }),
        // h2: um crítico com o prazo de solução vencido.
        chamado({ id: 'v', hotelId: 'h2', prioridadeId: URGENTE, prazoSolucao: em(-1) }),
      ],
    });
    const { hoteis } = await c.consultar(ctx);
    expect(hoteis.map((h) => [h.hotelNome, h.situacao])).toEqual([
      ['Beta', 'critico'],
      ['Alfa', 'atencao'],
    ]);
    expect(hoteis[1]).toMatchObject({ vencemEmBreve: 1, foraDoPrazo: 0, criticos: 1 });
    expect(hoteis[0]).toMatchObject({ vencemEmBreve: 0, foraDoPrazo: 1, criticos: 1 });
  });

  it('as preventivas atrasadas pela tolerância do hotel', async () => {
    const preventivas: PreventivaAberta[] = [
      { hotelId: 'h1', dataPrevista: '2026-10-18', estado: 'atribuida' },
      { hotelId: 'h1', dataPrevista: '2026-10-19', estado: 'em_execucao' },
    ];
    const sem = casos({
      minhas: [atribuicao('admin_grupo')],
      hoteis: [hotel('h1', 'A')],
      preventivas,
    });
    const r = (await sem.c.consultar(ctx)).hoteis[0];
    expect(r).toMatchObject({ preventivasAtrasadas: 2, situacao: 'atencao' });
    expect(sem.pedidos[0]?.ateDia).toBe('2026-10-20');
    const com = casos({
      minhas: [atribuicao('admin_grupo')],
      hoteis: [hotel('h1', 'A')],
      preventivas,
      toleranciaDoH1: 1,
    });
    expect((await com.c.consultar(ctx)).hoteis[0]).toMatchObject({
      preventivasAtrasadas: 1,
      situacao: 'ok',
    });
  });

  it('os abertos por dia: 14 dias no fuso de cada hotel, desde o primeiro dia do mais adiantado', async () => {
    const { c, pedidos } = casos({
      minhas: [atribuicao('gerente_hotel', 'h1'), atribuicao('gerente_hotel', 'h2')],
      hoteis: [hotel('h1', 'A'), hotel('h2', 'B', 'Asia/Tokyo')],
      aberturas: [
        { hotelId: 'h1', abertoEm: new Date('2026-10-20T02:00:00Z') }, // 19/10 em São Paulo
        { hotelId: 'h2', abertoEm: new Date('2026-10-20T15:00:00Z') }, // 21/10, 00:00 em Tóquio
      ],
    });
    const { hoteis } = await c.consultar(ctx);
    const doHotel = (id: string) => hoteis.find((h) => h.hotelId === id)?.abertosPorDia;
    expect(doHotel('h1')?.slice(-2)).toEqual([1, 0]);
    expect(doHotel('h2')?.slice(-2)).toEqual([0, 1]);
    expect(doHotel('h1')).toHaveLength(14);
    // Em Tóquio já é 21/10, e os 14 dias de lá começam em 08/10; a leitura parte
    // do começo mais cedo, o de 07/10 em São Paulo.
    expect(pedidos.find((x) => x.ateDia === '')?.desde).toEqual(new Date('2026-10-07T03:00:00Z'));
  });
});
