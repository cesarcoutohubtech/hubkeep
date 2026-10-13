import { describe, expect, it } from 'vitest';
import type { Atribuicao } from '../src/index';
import {
  type Periodicidade,
  dataDaOcorrencia,
  decidirSituacaoDoPlano,
  normalizarNomeDoPlano,
  ocorrenciaMaisRecenteAte,
  ocorrencias,
  podeGerirPlanos,
  proximaOcorrencia,
  validarAlvoDoPlano,
  validarInicioDoPlano,
  validarPeriodicidade,
  validarResponsavelDoPlano,
} from '../src/plano-preventivo';

const AGORA = new Date('2026-10-13T12:00:00Z');
const atr = (
  papel: Atribuicao['papel'],
  escopo: Atribuicao['escopo'],
  validoAte: Date | null = null,
): Atribuicao => ({ id: 'a', usuarioId: 'u', papel, escopo, validoAte, revogadoEm: null });
const hotel = { id: 'h1', bandeiraId: 'b1' };
const codigo = (r: ReturnType<typeof podeGerirPlanos>) => (r.permitido ? 'ok' : r.erro.codigo);
const plano = (inicio: string, intervalo: number, unidade: Periodicidade['unidade']) => ({
  inicio,
  intervalo,
  unidade,
});

describe('quem gere os planos do hotel (decisão 8)', () => {
  it.each([
    ['admin do grupo', atr('admin_grupo', { tipo: 'grupo' }), 'ok'],
    ['gestor CSC da bandeira', atr('gestor_csc', { tipo: 'bandeira', bandeiraId: 'b1' }), 'ok'],
    ['gerente do hotel', atr('gerente_hotel', { tipo: 'hotel', hotelId: 'h1' }), 'ok'],
    ['implantador do hotel', atr('implantador', { tipo: 'hotel', hotelId: 'h1' }), 'ok'],
    [
      'gerente de outro hotel',
      atr('gerente_hotel', { tipo: 'hotel', hotelId: 'h2' }),
      'planos_fora_do_escopo',
    ],
    [
      'gestor de outra bandeira',
      atr('gestor_csc', { tipo: 'bandeira', bandeiraId: 'b2' }),
      'planos_fora_do_escopo',
    ],
    ['técnico do hotel', atr('tecnico', { tipo: 'hotel', hotelId: 'h1' }), 'planos_fora_do_escopo'],
    [
      'solicitante do hotel',
      atr('solicitante', { tipo: 'hotel', hotelId: 'h1' }),
      'planos_fora_do_escopo',
    ],
    [
      'implantador vencido',
      atr('implantador', { tipo: 'hotel', hotelId: 'h1' }, new Date('2026-10-01T00:00:00Z')),
      'planos_fora_do_escopo',
    ],
  ] as const)('%s', (_caso, a, esperado) => {
    expect(codigo(podeGerirPlanos([a], hotel, AGORA))).toBe(esperado);
  });
});

describe('nome, início e periodicidade', () => {
  it('nome sem espaços sobrando, de 1 a 120 caracteres', () => {
    expect(normalizarNomeDoPlano('  PMOC   mensal ')).toBe('PMOC mensal');
    for (const ruim of ['', '   ', 'x'.repeat(121), 7, null]) {
      expect(() => normalizarNomeDoPlano(ruim)).toThrow(
        expect.objectContaining({ codigo: 'plano_nome_invalido', parametros: { maximo: 120 } }),
      );
    }
  });

  it('início é uma data de calendário que existe', () => {
    expect(validarInicioDoPlano('2026-02-28')).toBe('2026-02-28');
    for (const ruim of ['2026-02-30', '2026-2-1', '01/02/2026', '', null]) {
      expect(() => validarInicioDoPlano(ruim)).toThrow(
        expect.objectContaining({ codigo: 'plano_inicio_invalido' }),
      );
    }
  });

  it('periodicidade: inteiro de 1 ao máximo da unidade (366 dias, 52 semanas, 24 meses)', () => {
    expect(validarPeriodicidade({ intervalo: 366, unidade: 'dia' })).toEqual({
      intervalo: 366,
      unidade: 'dia',
    });
    expect(validarPeriodicidade({ intervalo: 52, unidade: 'semana' }).intervalo).toBe(52);
    expect(validarPeriodicidade({ intervalo: 24, unidade: 'mes' }).intervalo).toBe(24);
    for (const [intervalo, unidade, maximo] of [
      [367, 'dia', 366],
      [53, 'semana', 52],
      [25, 'mes', 24],
      [0, 'mes', 24],
      [1.5, 'dia', 366],
      ['3', 'mes', 24],
    ] as const) {
      expect(() => validarPeriodicidade({ intervalo, unidade })).toThrow(
        expect.objectContaining({
          codigo: 'periodicidade_invalida',
          parametros: { unidade, maximo },
        }),
      );
    }
    expect(() => validarPeriodicidade({ intervalo: 1, unidade: 'ano' })).toThrow(
      expect.objectContaining({ codigo: 'periodicidade_invalida', parametros: { unidade: 'ano' } }),
    );
  });

  it('um alvo e no máximo um responsável', () => {
    expect(() => validarAlvoDoPlano({ ativoId: 'a', categoriaId: null })).not.toThrow();
    expect(() => validarAlvoDoPlano({ ativoId: null, categoriaId: 'c' })).not.toThrow();
    for (const alvo of [
      { ativoId: null, categoriaId: null },
      { ativoId: 'a', categoriaId: 'c' },
    ]) {
      expect(() => validarAlvoDoPlano(alvo)).toThrow(
        expect.objectContaining({ codigo: 'plano_alvo_invalido' }),
      );
    }
    expect(() => validarResponsavelDoPlano({ tecnicoId: null, equipeId: null })).not.toThrow();
    expect(() => validarResponsavelDoPlano({ tecnicoId: 't', equipeId: 'e' })).toThrow(
      expect.objectContaining({ codigo: 'plano_responsavel_duplo' }),
    );
  });
});

describe('calendário fixo, ancorado no início (decisão 6)', () => {
  it('dias e semanas: início + k × intervalo', () => {
    expect(ocorrencias(plano('2026-10-13', 10, 'dia'), '2026-10-13', 3)).toEqual([
      '2026-10-13',
      '2026-10-23',
      '2026-11-02',
    ]);
    expect(ocorrencias(plano('2026-12-28', 2, 'semana'), '2026-12-28', 3)).toEqual([
      '2026-12-28',
      '2027-01-11',
      '2027-01-25',
    ]);
  });

  it('mês: o dia que não existe cai no último dia do mês, sem deslizar', () => {
    expect(ocorrencias(plano('2027-01-31', 1, 'mes'), '2027-01-01', 5)).toEqual([
      '2027-01-31',
      '2027-02-28',
      '2027-03-31',
      '2027-04-30',
      '2027-05-31',
    ]);
    // Ano bissexto.
    expect(dataDaOcorrencia('2028-01-31', { intervalo: 1, unidade: 'mes' }, 1)).toBe('2028-02-29');
    // Anual pelo mês: 29/02 cai em 28/02 nos anos que não são bissextos e volta a 29/02.
    expect(ocorrencias(plano('2028-02-29', 12, 'mes'), '2028-01-01', 5)).toEqual([
      '2028-02-29',
      '2029-02-28',
      '2030-02-28',
      '2031-02-28',
      '2032-02-29',
    ]);
    // Trimestral atravessando o ano.
    expect(ocorrencias(plano('2026-11-30', 3, 'mes'), '2026-11-30', 3)).toEqual([
      '2026-11-30',
      '2027-02-28',
      '2027-05-30',
    ]);
  });

  it('as ocorrências a partir de uma data depois do início pulam as passadas', () => {
    expect(ocorrencias(plano('2026-01-15', 1, 'mes'), '2026-10-13', 2)).toEqual([
      '2026-10-15',
      '2026-11-15',
    ]);
    expect(ocorrencias(plano('2026-01-15', 1, 'mes'), '2026-10-15', 1)).toEqual(['2026-10-15']);
    expect(ocorrencias(plano('2026-01-31', 2, 'mes'), '2026-10-01', 2)).toEqual([
      '2026-11-30',
      '2027-01-31',
    ]);
    expect(ocorrencias(plano('2026-10-01', 7, 'dia'), '2026-10-09', 1)).toEqual(['2026-10-15']);
    expect(ocorrencias(plano('2026-10-13', 1, 'dia'), '2026-10-13', 0)).toEqual([]);
  });

  it('a próxima ocorrência é no dia, inclusive, ou depois; antes do início, o início', () => {
    const p = plano('2026-11-01', 1, 'mes');
    expect(proximaOcorrencia(p, '2026-10-13')).toBe('2026-11-01');
    expect(proximaOcorrencia(p, '2026-11-01')).toBe('2026-11-01');
    expect(proximaOcorrencia(p, '2026-11-02')).toBe('2026-12-01');
  });

  it('a ocorrência mais recente até o dia: só ela é gerada com várias vencidas (decisão 10)', () => {
    const p = plano('2026-01-31', 1, 'mes');
    expect(ocorrenciaMaisRecenteAte(p, '2026-01-30')).toBeNull();
    expect(ocorrenciaMaisRecenteAte(p, '2026-01-31')).toBe('2026-01-31');
    expect(ocorrenciaMaisRecenteAte(p, '2026-03-15')).toBe('2026-02-28');
    expect(ocorrenciaMaisRecenteAte(p, '2026-03-31')).toBe('2026-03-31');
    expect(ocorrenciaMaisRecenteAte(plano('2026-10-01', 2, 'semana'), '2026-10-20')).toBe(
      '2026-10-15',
    );
  });

  it('o calendário não desliza ao longo de muitas ocorrências', () => {
    const p = plano('2026-01-31', 1, 'mes');
    const datas = ocorrencias(p, '2026-01-31', 24);
    expect(datas.filter((d) => d.endsWith('-31'))).toHaveLength(14);
    expect(datas[23]).toBe('2027-12-31');
    // Cada data é a ocorrência k direta, sem depender da anterior.
    datas.forEach((d, k) => expect(dataDaOcorrencia(p.inicio, p, k)).toBe(d));
  });
});

describe('situação do plano', () => {
  const comTecnico = { tecnicoId: 't', equipeId: null };
  const semNinguem = { tecnicoId: null, equipeId: null };

  it('ativar vale do pausado, com responsável; pausar, do ativo; encerrar, dos dois', () => {
    expect(decidirSituacaoDoPlano('pausado', 'ativar', comTecnico)).toBe('ativo');
    expect(decidirSituacaoDoPlano('pausado', 'ativar', { tecnicoId: null, equipeId: 'e' })).toBe(
      'ativo',
    );
    expect(decidirSituacaoDoPlano('ativo', 'pausar', semNinguem)).toBe('pausado');
    expect(decidirSituacaoDoPlano('ativo', 'encerrar', semNinguem)).toBe('encerrado');
    expect(decidirSituacaoDoPlano('pausado', 'encerrar', semNinguem)).toBe('encerrado');
  });

  it('ativar sem responsável é recusado', () => {
    expect(() => decidirSituacaoDoPlano('pausado', 'ativar', semNinguem)).toThrow(
      expect.objectContaining({ codigo: 'plano_sem_responsavel' }),
    );
  });

  it('ação que não vale na situação', () => {
    expect(() => decidirSituacaoDoPlano('ativo', 'ativar', comTecnico)).toThrow(
      expect.objectContaining({
        codigo: 'plano_transicao_invalida',
        parametros: { situacao: 'ativo', acao: 'ativar' },
      }),
    );
    expect(() => decidirSituacaoDoPlano('pausado', 'pausar', comTecnico)).toThrow(
      expect.objectContaining({ codigo: 'plano_transicao_invalida' }),
    );
  });

  it('o encerrado não volta', () => {
    for (const acao of ['ativar', 'pausar', 'encerrar'] as const) {
      expect(() => decidirSituacaoDoPlano('encerrado', acao, comTecnico)).toThrow(
        expect.objectContaining({ codigo: 'plano_encerrado' }),
      );
    }
  });
});
