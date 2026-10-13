// Avisos de SLA em aberto (fase 1c; ADR-043, M4), com a porta em memória: o
// painel do hotel só para a gestão, com os vencidos primeiro e depois pelo
// prazo, e sem os chamados sem aviso; na ficha, quem não é da gestão recebe a
// lista vazia, sem erro. O SQL e a RLS são do teste de integração
// (packages/db/test/avisos-de-sla.test.ts).
import { type Atribuicao, HORARIO_PADRAO, SLA_PADRAO } from '@hubkeep/dominio';
import { describe, expect, it } from 'vitest';
import { type ChamadoComAvisos, criarCasosDeUsoDeAvisosDeSla } from '../src/index';

const H = 3_600_000;
const AGORA = new Date('2026-10-13T20:00:00Z');
const em = (horas: number) => new Date(AGORA.getTime() + horas * H);
const ctx = { tenantId: 't', usuarioId: 'u' };
const P = '0193f0a0-0000-7000-8000-0000000000aa';
const CAT = '0193f0a0-0000-7000-8000-000000000001';
const copia = {
  'chamado.sla': { ...SLA_PADRAO, porCategoria: { [CAT]: { pausa: true } } },
  'hotel.horario_atendimento': HORARIO_PADRAO,
};

const chamado = (c: Partial<ChamadoComAvisos>): ChamadoComAvisos => ({
  id: 'c',
  hotelId: 'h1',
  descricao: 'Ar não liga',
  estado: 'em_execucao',
  prioridadeId: P,
  categoriaId: CAT,
  politicaAplicada: copia,
  pausaEmCurso: null,
  jaTeveOs: true,
  prazoAtendimento: em(-5),
  prazoSolucao: em(3),
  gravados: [],
  ...c,
});

const atribuicao = (papel: Atribuicao['papel']): Atribuicao => ({
  id: 'a',
  usuarioId: 'u',
  papel,
  escopo: { tipo: 'hotel', hotelId: 'h1' },
  validoAte: null,
  revogadoEm: null,
});

function casos(chamados: ChamadoComAvisos[], papel: Atribuicao['papel'] = 'gerente_hotel') {
  return criarCasosDeUsoDeAvisosDeSla({
    avisos: {
      hotel: async (_c, id) => (id === 'h1' ? { id, bandeiraId: null } : null),
      chamadosDoHotel: async () => chamados,
      chamado: async (_c, id) => {
        const c = chamados.find((x) => x.id === id);
        return c ? { ...c, bandeiraId: null } : null;
      },
    },
    atribuicoes: { doUsuario: async () => [atribuicao(papel)] },
    prioridades: {
      listar: async () => [
        { id: P, chavePadrao: 'urgente', nomes: {}, ordem: 10, peso: 40, ativa: true },
      ],
    },
    relogio: { agora: () => AGORA },
  });
}

describe('painel dos avisos de SLA (M4)', () => {
  const lista = [
    chamado({ id: 'sem-aviso' }),
    chamado({
      id: 'em-risco-cedo',
      prazoSolucao: em(1),
      gravados: [{ tipo: 'solucao_em_risco', prazo: em(1) }],
    }),
    chamado({
      id: 'em-risco-tarde',
      prazoSolucao: em(2),
      gravados: [{ tipo: 'solucao_em_risco', prazo: em(2) }],
    }),
    chamado({ id: 'vencido', prazoSolucao: em(-1) }),
  ];

  it('vencidos primeiro, depois pelo prazo; sem aviso fica fora', async () => {
    const r = await casos(lista).doHotel(ctx, 'h1');
    expect(r.chamados.map((c) => c.chamadoId)).toEqual([
      'vencido',
      'em-risco-cedo',
      'em-risco-tarde',
    ]);
    expect(r.chamados[0]?.avisos).toEqual([
      { tipo: 'solucao_vencida', nivel: 'vencido', prazo: em(-1) },
    ]);
  });

  it('o técnico não vê o painel; o hotel que ele não lê é não encontrado', async () => {
    await expect(casos(lista, 'tecnico').doHotel(ctx, 'h1')).rejects.toMatchObject({
      codigo: 'avisos_sla_fora_do_escopo',
    });
    await expect(casos(lista).doHotel(ctx, 'h2')).rejects.toMatchObject({
      codigo: 'hotel_nao_encontrado',
    });
  });
});

describe('relógio parado pela pausa (M4)', () => {
  it('a pausa com motivo da lista congela o vencido da solução; sem motivo, não', async () => {
    const vencida = { id: 'p', prazoSolucao: em(-1) };
    const parado = chamado({ ...vencida, pausaEmCurso: { motivo: 'aguardando_peca' } });
    expect((await casos([parado]).doHotel(ctx, 'h1')).chamados).toEqual([]);
    const semMotivo = chamado({ ...vencida, pausaEmCurso: { motivo: null } });
    expect((await casos([semMotivo]).doHotel(ctx, 'h1')).chamados.map((c) => c.chamadoId)).toEqual([
      'p',
    ]);
  });
});

describe('selo da ficha (M4)', () => {
  const lista = [chamado({ id: 'vencido', prazoSolucao: em(-1) })];

  it('a gestão vê o aviso; quem não é da gestão recebe a lista vazia', async () => {
    expect((await casos(lista).doChamado(ctx, 'vencido')).avisos.map((a) => a.tipo)).toEqual([
      'solucao_vencida',
    ]);
    expect((await casos(lista, 'tecnico').doChamado(ctx, 'vencido')).avisos).toEqual([]);
  });

  it('o chamado que não se lê é não encontrado', async () => {
    await expect(casos(lista).doChamado(ctx, 'outro')).rejects.toMatchObject({
      codigo: 'chamado_nao_encontrado',
    });
  });
});
