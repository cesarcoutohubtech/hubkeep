// Triagem e atribuição (C3): uma OS não cancelada por chamado, quem recebe a
// OS e o ajuste de prioridade. A paridade da primeira regra com o índice
// os_uma_ativa_por_chamado (migração 0022) está em packages/db/test/os.test.ts.
import { describe, expect, it } from 'vitest';
import {
  type Atribuicao,
  type ChamadoParaRegra,
  ESTADOS_DA_OS,
  ESTADOS_DO_CHAMADO,
  type EstadoDaOs,
  type Papel,
  decidirNaOs,
  ehTecnicoDoHotel,
  exigirCategoriaAtiva,
  exigirChamadoSemOsEmAndamento,
  exigirPrioridadeAtiva,
  exigirResponsavelDoHotel,
  osOcupaOChamado,
  podeAjustarCategoria,
  podeAjustarPrioridade,
} from '../src';

const agora = new Date('2026-09-29T12:00:00Z');
const HOTEL = { id: 'hotel-1', bandeiraId: 'bandeira-1' };

let seq = 0;
const atr = (
  usuarioId: string,
  papel: Papel,
  escopo: Atribuicao['escopo'],
  extra: Partial<Atribuicao> = {},
): Atribuicao => ({
  id: `a-${++seq}`,
  usuarioId,
  papel,
  escopo,
  validoAte: null,
  revogadoEm: null,
  ...extra,
});
const noHotel = { tipo: 'hotel', hotelId: HOTEL.id } as const;
const gerente = {
  usuarioId: 'gerente',
  atribuicoes: [atr('gerente', 'gerente_hotel', noHotel)],
  equipes: [],
};
const chamado = (estado: ChamadoParaRegra['estado']): ChamadoParaRegra => ({
  hotel: HOTEL,
  estado,
  abertoPor: 'sol-1',
});
const codigo = (f: () => unknown): string | null => {
  try {
    f();
    return null;
  } catch (e) {
    return (e as { codigo?: string }).codigo ?? (e as Error).message;
  }
};

describe('uma OS não cancelada por chamado', () => {
  // Escrito à mão: só a cancelada libera o chamado.
  const OCUPA: Record<EstadoDaOs, boolean> = {
    atribuida: true,
    em_execucao: true,
    pausada: true,
    concluida: true,
    aceita: true,
    cancelada: false,
  };

  for (const estado of ESTADOS_DA_OS)
    it(`OS ${estado} ${OCUPA[estado] ? 'ocupa' : 'não ocupa'} o chamado`, () => {
      expect(osOcupaOChamado(estado)).toBe(OCUPA[estado]);
      const f = () => exigirChamadoSemOsEmAndamento([estado]);
      if (OCUPA[estado]) expect(codigo(f)).toBe('os_em_andamento');
      else expect(f).not.toThrow();
    });

  it('chamado sem OS, ou só com canceladas, recebe OS', () => {
    expect(() => exigirChamadoSemOsEmAndamento([])).not.toThrow();
    expect(() => exigirChamadoSemOsEmAndamento(['cancelada', 'cancelada'])).not.toThrow();
    expect(codigo(() => exigirChamadoSemOsEmAndamento(['cancelada', 'pausada']))).toBe(
      'os_em_andamento',
    );
  });

  it('gerar recusa com os_em_andamento mesmo com o chamado ainda em triagem', () => {
    // O estado do chamado lido antes da outra triagem gravar: só as OS mostram.
    for (const estado of ESTADOS_DA_OS) {
      const f = () =>
        decidirNaOs('gerar', {
          ator: gerente,
          chamado: chamado('em_triagem'),
          os: null,
          osDoChamado: [estado],
          agora,
        });
      if (OCUPA[estado]) expect(codigo(f)).toBe('os_em_andamento');
      else expect(f()).toMatchObject({ estado: 'atribuida', chamado: 'em_execucao' });
    }
  });

  it('gerar sem as OS do chamado é erro de programação, não recusa silenciosa', () => {
    expect(() =>
      decidirNaOs('gerar', { ator: gerente, chamado: chamado('aberto'), os: null, agora }),
    ).toThrow('decidirNaOs(gerar) precisa das OS do chamado.');
  });

  it('aceite recusado reabre a mesma OS, sem pedir OS nova', () => {
    const reaberta = decidirNaOs('reabrir', {
      ator: gerente,
      chamado: chamado('aguardando_aceite'),
      os: { estado: 'concluida', responsavel: { tipo: 'tecnico', usuarioId: 'tec-1' } },
      motivo: 'Continua pingando',
      agora,
    });
    expect(reaberta).toMatchObject({ estado: 'em_execucao', chamado: 'em_execucao' });
    // Com a mesma OS de volta em execução, gerar outra continua recusado.
    expect(
      codigo(() =>
        decidirNaOs('gerar', {
          ator: gerente,
          chamado: chamado('em_triagem'),
          os: null,
          osDoChamado: [reaberta.estado],
          agora,
        }),
      ),
    ).toBe('os_em_andamento');
  });
});

describe('quem recebe a OS', () => {
  const tecnico = (atribuicoes: Atribuicao[]) =>
    ({ tipo: 'tecnico', usuarioId: 'tec-1', atribuicoes }) as const;

  it('Técnico com papel vigente no hotel, na bandeira ou no grupo', () => {
    for (const escopo of [
      noHotel,
      { tipo: 'bandeira', bandeiraId: HOTEL.bandeiraId },
      { tipo: 'grupo' },
    ] as const)
      expect(
        exigirResponsavelDoHotel(tecnico([atr('tec-1', 'tecnico', escopo)]), HOTEL, agora),
      ).toEqual({ tipo: 'tecnico', usuarioId: 'tec-1' });
  });

  it('recusa quem não é Técnico vigente do hotel', () => {
    const casos: Atribuicao[][] = [
      [],
      [atr('tec-1', 'gerente_hotel', noHotel)],
      [atr('tec-1', 'tecnico', { tipo: 'hotel', hotelId: 'hotel-2' })],
      [atr('tec-1', 'tecnico', { tipo: 'bandeira', bandeiraId: 'bandeira-2' })],
      [atr('tec-1', 'tecnico', noHotel, { validoAte: new Date('2026-09-01') })],
      [atr('tec-1', 'tecnico', noHotel, { revogadoEm: new Date('2026-09-01') })],
      // A atribuição de outra pessoa não vale para o candidato.
      [atr('tec-2', 'tecnico', noHotel)],
    ];
    for (const atribuicoes of casos)
      expect(codigo(() => exigirResponsavelDoHotel(tecnico(atribuicoes), HOTEL, agora))).toBe(
        'responsavel_sem_papel_tecnico',
      );
  });

  it('a lista de responsáveis usa a mesma regra (ehTecnicoDoHotel)', () => {
    const atribuicoes = [
      atr('tec-1', 'tecnico', noHotel),
      atr('tec-2', 'tecnico', { tipo: 'bandeira', bandeiraId: HOTEL.bandeiraId }),
      atr('tec-3', 'tecnico', noHotel, { validoAte: new Date('2026-09-01') }),
      atr('ger-1', 'gerente_hotel', noHotel),
      atr('tec-4', 'tecnico', { tipo: 'hotel', hotelId: 'hotel-2' }),
    ];
    const naLista = ['tec-1', 'tec-2', 'tec-3', 'ger-1', 'tec-4'].filter((u) =>
      ehTecnicoDoHotel(atribuicoes, u, HOTEL, agora),
    );
    expect(naLista).toEqual(['tec-1', 'tec-2']);
  });

  it('equipe ativa do hotel; de outro hotel ou desativada, não', () => {
    const equipe = (hotelId: string, ativa: boolean) =>
      ({ tipo: 'equipe', equipeId: 'eq-1', hotelId, ativa }) as const;
    expect(exigirResponsavelDoHotel(equipe(HOTEL.id, true), HOTEL, agora)).toEqual({
      tipo: 'equipe',
      equipeId: 'eq-1',
    });
    for (const e of [equipe('hotel-2', true), equipe(HOTEL.id, false)])
      expect(codigo(() => exigirResponsavelDoHotel(e, HOTEL, agora))).toBe('equipe_indisponivel');
  });
});

describe('ajuste de prioridade', () => {
  const prioridades = [
    { id: 'alta', ordem: 20, peso: 30, ativa: true },
    { id: 'antiga', ordem: 30, peso: 20, ativa: false },
  ];

  it('só prioridade ativa do tenant', () => {
    expect(() => exigirPrioridadeAtiva(prioridades, 'alta')).not.toThrow();
    expect(codigo(() => exigirPrioridadeAtiva(prioridades, 'antiga'))).toBe(
      'prioridade_indisponivel',
    );
    expect(codigo(() => exigirPrioridadeAtiva(prioridades, 'outra'))).toBe(
      'prioridade_indisponivel',
    );
  });

  it('até a execução, pela triagem', () => {
    for (const estado of ESTADOS_DO_CHAMADO) {
      const f = () => podeAjustarPrioridade(gerente, chamado(estado), agora);
      if (['aberto', 'em_triagem', 'em_execucao'].includes(estado)) expect(f).not.toThrow();
      else expect(codigo(f)).toBe('transicao_invalida');
    }
  });

  it('fora da triagem, 403 antes do estado', () => {
    const tecnico = {
      usuarioId: 'tec-1',
      atribuicoes: [atr('tec-1', 'tecnico', noHotel)],
      equipes: [],
    };
    expect(codigo(() => podeAjustarPrioridade(tecnico, chamado('concluido'), agora))).toBe(
      'triagem_fora_do_papel',
    );
  });
});

describe('ajuste de categoria (1c, ADR-042)', () => {
  const categorias = [
    { id: 'ar', ativa: true },
    { id: 'antiga', ativa: false },
  ];

  it('só categoria ativa do grupo; null tira a categoria', () => {
    expect(() => exigirCategoriaAtiva(categorias, 'ar')).not.toThrow();
    expect(() => exigirCategoriaAtiva(categorias, null)).not.toThrow();
    expect(codigo(() => exigirCategoriaAtiva(categorias, 'antiga'))).toBe('categoria_indisponivel');
    expect(codigo(() => exigirCategoriaAtiva(categorias, 'outra'))).toBe('categoria_indisponivel');
  });

  it('nos mesmos estados da prioridade, pela triagem', () => {
    for (const estado of ESTADOS_DO_CHAMADO) {
      const f = () => podeAjustarCategoria(gerente, chamado(estado), agora);
      if (['aberto', 'em_triagem', 'em_execucao'].includes(estado)) expect(f).not.toThrow();
      else expect(codigo(f)).toBe('transicao_invalida');
    }
  });

  it('fora da triagem, 403 antes do estado', () => {
    const tecnico = {
      usuarioId: 'tec-1',
      atribuicoes: [atr('tec-1', 'tecnico', noHotel)],
      equipes: [],
    };
    expect(codigo(() => podeAjustarCategoria(tecnico, chamado('concluido'), agora))).toBe(
      'triagem_fora_do_papel',
    );
  });
});
