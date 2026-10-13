// Prazos do chamado (fase 1c; ADR-042): a cópia do SLA, a região dos
// feriados, o calendário e os prazos na abertura e no recálculo da triagem.
import { describe, expect, it } from 'vitest';
import {
  HORARIO_PADRAO,
  SLA_PADRAO,
  anosDoCalendario,
  calendarioDeSla,
  pausaDoChamadoParaORelogio,
  prazosDoChamado,
  prazosNoRecalculo,
  regiaoDoHotel,
  slaDaCopia,
  slaDoChamado,
} from '../src/index';

const SP = 'America/Sao_Paulo';
// Terça, 13/10/2026, 17h em São Paulo.
const ABERTO = new Date('2026-10-13T20:00:00Z');
const media = SLA_PADRAO.porPrioridade['media'] as {
  atendimentoHoras: number;
  solucaoHoras: number;
  relogio: 'atendimento';
};
const cal = (oficiais: { data: string; tipo: 'feriado' | 'ponto_facultativo' }[] = []) =>
  calendarioDeSla({
    fuso: SP,
    horario: HORARIO_PADRAO,
    oficiais,
    doHotel: [],
    pontoFacultativo: false,
    anos: anosDoCalendario(ABERTO),
  });

describe('prazos do chamado', () => {
  it('na abertura, pelo horário de atendimento do hotel', () => {
    // Atendimento 8 h: 1 h na terça, 7 h na quarta (até 15h).
    // Solução 24 h: 1 h na terça, 10 na quarta, 10 na quinta, 3 na sexta (até 11h).
    expect(prazosDoChamado({ abertoEm: ABERTO, regra: media, calendario: cal() })).toEqual({
      prazoAtendimento: new Date('2026-10-14T18:00:00Z'),
      prazoSolucao: new Date('2026-10-16T14:00:00Z'),
    });
  });

  it('o feriado oficial não conta; o ponto facultativo, fora por padrão, conta', () => {
    const comFeriado = cal([{ data: '2026-10-14', tipo: 'feriado' }]);
    expect(
      prazosDoChamado({ abertoEm: ABERTO, regra: media, calendario: comFeriado }).prazoAtendimento,
    ).toEqual(new Date('2026-10-15T18:00:00Z'));
    const comPonto = cal([{ data: '2026-10-14', tipo: 'ponto_facultativo' }]);
    expect(
      prazosDoChamado({ abertoEm: ABERTO, regra: media, calendario: comPonto }).prazoAtendimento,
    ).toEqual(new Date('2026-10-14T18:00:00Z'));
  });

  it('o tempo já pausado estende só a solução', () => {
    const p = prazosDoChamado({
      abertoEm: ABERTO,
      regra: media,
      calendario: cal(),
      pausadoSegundos: 2 * 3600,
    });
    expect(p.prazoAtendimento).toEqual(new Date('2026-10-14T18:00:00Z'));
    expect(p.prazoSolucao).toEqual(new Date('2026-10-16T16:00:00Z'));
  });

  it('no recálculo, o atendimento fica o gravado depois da primeira OS', () => {
    const urgente = { atendimentoHoras: 1, solucaoHoras: 2, relogio: '24x7' as const };
    const gravado = new Date('2026-10-14T18:00:00Z');
    const base = {
      abertoEm: ABERTO,
      regra: urgente,
      calendario: cal(),
      pausadoSegundos: 0,
      prazoAtendimentoGravado: gravado,
    };
    expect(prazosNoRecalculo({ ...base, jaTeveOs: false })).toEqual({
      prazoAtendimento: new Date('2026-10-13T21:00:00Z'),
      prazoSolucao: new Date('2026-10-13T22:00:00Z'),
    });
    expect(prazosNoRecalculo({ ...base, jaTeveOs: true })).toEqual({
      prazoAtendimento: gravado,
      prazoSolucao: new Date('2026-10-13T22:00:00Z'),
    });
  });
});

describe('a cópia do SLA no chamado', () => {
  it('lê a cópia inteira; o chamado de antes da 0043 não tem', () => {
    const copia = {
      'chamado.prioridade_padrao_por_categoria': { categoriaId: null },
      'chamado.sla': SLA_PADRAO,
      'hotel.horario_atendimento': HORARIO_PADRAO,
    };
    expect(slaDaCopia(copia)).toEqual({
      'chamado.sla': SLA_PADRAO,
      'hotel.horario_atendimento': HORARIO_PADRAO,
    });
    expect(slaDaCopia({ 'chamado.prioridade_padrao_por_categoria': {} })).toBeNull();
    expect(slaDaCopia({ ...copia, 'chamado.sla': { porPrioridade: {} } })).toBeNull();
    expect(slaDaCopia(null)).toBeNull();
  });
});

describe('a região dos feriados do hotel', () => {
  const tenant = { pais: 'BR', subdivisao: 'BR-PR' };
  it('o nulo herda do tenant; a subdivisão do tenant só no país dele', () => {
    expect(regiaoDoHotel({ pais: null, subdivisao: null }, tenant)).toEqual(tenant);
    expect(regiaoDoHotel({ pais: null, subdivisao: 'BR-SC' }, tenant)).toEqual({
      pais: 'BR',
      subdivisao: 'BR-SC',
    });
    expect(regiaoDoHotel({ pais: 'AR', subdivisao: null }, tenant)).toEqual({
      pais: 'AR',
      subdivisao: null,
    });
  });

  it('os anos do calendário cobrem o anterior e a procura inteira', () => {
    const anos = anosDoCalendario(new Date('2026-01-01T01:00:00Z'));
    expect(anos[0]).toBe(2025);
    expect(anos).toContain(2027);
    expect(anos.at(-1)).toBeGreaterThanOrEqual(2036);
  });
});

describe('a pausa do chamado e o relógio', () => {
  const CAT = '0193f0a0-0000-7000-8000-000000000001';
  const P = '0193f0a0-0000-7000-8000-0000000000aa';
  const prioridades = [{ id: P, chavePadrao: 'media', peso: 20 }];
  const copia = (pausa: boolean) => ({
    'chamado.sla': { ...SLA_PADRAO, porCategoria: { [CAT]: { pausa } } },
    'hotel.horario_atendimento': HORARIO_PADRAO,
  });
  const prazo = new Date('2026-10-16T14:00:00Z');
  const sla = (pausa: boolean, categoriaId: string | null = CAT) =>
    slaDoChamado({ politicaAplicada: copia(pausa), prioridadeId: P, prioridades, categoriaId });

  it('para com a categoria ligada e o motivo da lista', () => {
    expect(sla(true)?.regra).toMatchObject({ relogio: 'atendimento', pausa: true });
    expect(pausaDoChamadoParaORelogio(sla(true), prazo, 'aguardando_peca')).toBe(true);
  });

  it('não para: motivo fora da lista, sem motivo, categoria sem pausa, sem prazo ou sem cópia', () => {
    expect(pausaDoChamadoParaORelogio(sla(true), prazo, 'fim_de_turno')).toBe(false);
    expect(pausaDoChamadoParaORelogio(sla(true), prazo, null)).toBe(false);
    expect(pausaDoChamadoParaORelogio(sla(false), prazo, 'aguardando_peca')).toBe(false);
    expect(pausaDoChamadoParaORelogio(sla(true, null), prazo, 'aguardando_peca')).toBe(false);
    expect(pausaDoChamadoParaORelogio(sla(true), null, 'aguardando_peca')).toBe(false);
    expect(
      slaDoChamado({ politicaAplicada: {}, prioridadeId: P, prioridades, categoriaId: CAT }),
    ).toBeNull();
    expect(
      slaDoChamado({
        politicaAplicada: copia(true),
        prioridadeId: 'outra',
        prioridades,
        categoriaId: CAT,
      }),
    ).toBeNull();
  });
});
