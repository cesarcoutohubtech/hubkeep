// A situação por hotel da tela inicial (glossário de métricas, versão 4): o
// chamado crítico, as contagens do quadro, a regra da situação, a preventiva
// atrasada de agora, os abertos por dia no fuso do hotel e quem vê.
import { describe, expect, it } from 'vitest';
import {
  type Atribuicao,
  type AvisoDeSla,
  type Papel,
  LIMITES_DA_SITUACAO,
  abertosPorDia,
  contarChamadosDoHotel,
  contarPreventivasAtrasadas,
  diasDosAbertosDoQuadro,
  podeVerASituacaoPorHotel,
  prioridadesCriticas,
  situacaoDoHotel,
} from '../src/index';

const SP = 'America/Sao_Paulo';
const AGORA = new Date('2026-10-20T15:00:00Z');
const PRAZO = new Date('2026-10-20T12:00:00Z');
const vencido: AvisoDeSla = { tipo: 'solucao_vencida', nivel: 'vencido', prazo: PRAZO };
const emRisco: AvisoDeSla = { tipo: 'atendimento_em_risco', nivel: 'em_risco', prazo: PRAZO };
const zerada = { vencemEmBreve: 0, foraDoPrazo: 0, criticos: 0, criticosVencidos: 0 };

describe('chamado crítico', () => {
  it('as prioridades ativas de maior peso, com empate; a inativa não conta', () => {
    expect(
      prioridadesCriticas([
        { id: 'baixa', peso: 10, ativa: true },
        { id: 'urgente', peso: 100, ativa: true },
        { id: 'propria', peso: 100, ativa: true },
        { id: 'antiga', peso: 500, ativa: false },
      ]),
    ).toEqual(new Set(['urgente', 'propria']));
    expect(prioridadesCriticas([{ id: 'x', peso: 5, ativa: false }]).size).toBe(0);
  });
});

describe('contagens do quadro', () => {
  it('cada chamado uma vez: o vencido em "fora do prazo", mesmo com outro prazo em risco', () => {
    const c = contarChamadosDoHotel(
      [
        { prioridadeId: 'urgente', avisos: [vencido, emRisco] },
        { prioridadeId: 'urgente', avisos: [emRisco] },
        { prioridadeId: 'baixa', avisos: [emRisco] },
        { prioridadeId: null, avisos: [] },
      ],
      new Set(['urgente']),
    );
    expect(c).toEqual({ vencemEmBreve: 2, foraDoPrazo: 1, criticos: 2, criticosVencidos: 1 });
  });
});

describe('situação do hotel', () => {
  const com = (extra: Partial<Parameters<typeof situacaoDoHotel>[0]>) =>
    situacaoDoHotel({ ...zerada, preventivasAtrasadas: 0, ...extra });

  it('crítico: um crítico vencido, ou 3 ou mais vencidos', () => {
    expect(com({ foraDoPrazo: 1, criticos: 1, criticosVencidos: 1 })).toBe('critico');
    expect(com({ foraDoPrazo: LIMITES_DA_SITUACAO.vencidosParaCritico })).toBe('critico');
  });

  it('atenção: algum vencido ou em risco, ou 2 ou mais preventivas atrasadas', () => {
    expect(com({ foraDoPrazo: 2 })).toBe('atencao');
    expect(com({ vencemEmBreve: 1 })).toBe('atencao');
    expect(com({ preventivasAtrasadas: LIMITES_DA_SITUACAO.preventivasParaAtencao })).toBe(
      'atencao',
    );
  });

  it('ok: uma preventiva atrasada, ou um crítico sem prazo vencido', () => {
    expect(com({ preventivasAtrasadas: 1, criticos: 3 })).toBe('ok');
  });
});

describe('preventivas atrasadas agora', () => {
  it('passou do dia previsto mais a tolerância, no fuso do hotel, e a OS está aberta', () => {
    const o = { fuso: SP, agora: AGORA, toleranciaDias: 0 };
    expect(
      contarPreventivasAtrasadas(
        [
          { dataPrevista: '2026-10-19', estado: 'atribuida' },
          { dataPrevista: '2026-10-18', estado: 'em_execucao' },
          { dataPrevista: '2026-10-20', estado: 'atribuida' }, // hoje: ainda no prazo
          { dataPrevista: '2026-10-10', estado: 'concluida' },
          { dataPrevista: '2026-10-10', estado: 'cancelada' },
        ],
        o,
      ),
    ).toBe(2);
    expect(
      contarPreventivasAtrasadas([{ dataPrevista: '2026-10-19', estado: 'atribuida' }], {
        ...o,
        toleranciaDias: 1,
      }),
    ).toBe(0);
  });
});

describe('abertos por dia', () => {
  it('os 14 dias até hoje no fuso do hotel, e a abertura contada no dia local', () => {
    // 01:00 UTC de 21/10 ainda é 20/10 em São Paulo.
    const dias = diasDosAbertosDoQuadro(new Date('2026-10-21T01:00:00Z'), SP);
    expect(dias).toHaveLength(14);
    expect(dias[0]).toBe('2026-10-07');
    expect(dias[13]).toBe('2026-10-20');
    const n = abertosPorDia(
      [
        new Date('2026-10-20T02:00:00Z'), // 19/10, 23:00 local
        new Date('2026-10-20T12:00:00Z'),
        new Date('2026-10-21T01:00:00Z'),
        new Date('2026-09-01T12:00:00Z'), // fora dos 14 dias
      ],
      dias,
      SP,
    );
    expect(n.slice(-2)).toEqual([1, 2]);
    expect(n.reduce((a, b) => a + b, 0)).toBe(3);
  });
});

describe('quem vê a situação por hotel', () => {
  const atribuicao = (papel: Papel): Atribuicao => ({
    id: 'a',
    usuarioId: 'u',
    papel,
    escopo: { tipo: 'hotel', hotelId: 'h1' },
    validoAte: null,
    revogadoEm: null,
  });

  it('a gestão vê; o técnico e o proprietário recebem o código, sem frase', () => {
    for (const p of ['admin_grupo', 'gestor_csc', 'gerente_hotel'] as const) {
      expect(podeVerASituacaoPorHotel([atribuicao(p)], AGORA).permitido).toBe(true);
    }
    for (const p of ['tecnico', 'proprietario', 'solicitante'] as const) {
      const r = podeVerASituacaoPorHotel([atribuicao(p)], AGORA);
      expect(r.permitido).toBe(false);
      expect(r.permitido ? null : r.erro.codigo).toBe('situacao_por_hotel_sem_permissao');
    }
  });
});
