// Máquina de estados da corretiva (C1; ADR-027): toda transição, permitida e
// proibida, por papel. As tabelas esperadas abaixo são escritas à mão, e não
// derivadas de TRANSICOES_*: se a regra mudar, o teste precisa mudar junto.
import { describe, expect, it } from 'vitest';
import {
  ACOES_DA_OS,
  ACOES_DO_CHAMADO,
  type AcaoDaOs,
  type AtorDaCorretiva,
  type Atribuicao,
  type ChamadoParaRegra,
  Conflito,
  ESTADOS_DA_OS,
  ESTADOS_DO_CHAMADO,
  type EstadoDaOs,
  type EstadoDoChamado,
  type Papel,
  PermissaoNegada,
  RegraViolada,
  type Responsavel,
  decidirNaOs,
  decidirNoChamado,
  normalizarMotivo,
  podeAbrirChamado,
  podeTriar,
} from '../src';

const agora = new Date('2026-09-29T12:00:00Z');
const HOTEL = { id: 'hotel-1', bandeiraId: 'bandeira-1' };
const EQUIPE = 'equipe-1';

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
const ator = (usuarioId: string, atribuicoes: Atribuicao[], equipes: string[] = []) => ({
  usuarioId,
  atribuicoes,
  equipes,
});
const noHotel = { tipo: 'hotel', hotelId: HOTEL.id } as const;

const ATORES = {
  admin: ator('admin', [atr('admin', 'admin_grupo', { tipo: 'grupo' })]),
  gestor: ator('gestor', [
    atr('gestor', 'gestor_csc', { tipo: 'bandeira', bandeiraId: HOTEL.bandeiraId }),
  ]),
  gerente: ator('gerente', [atr('gerente', 'gerente_hotel', noHotel)]),
  implantador: ator('implantador', [
    atr('implantador', 'implantador', noHotel, { validoAte: new Date('2026-12-31') }),
  ]),
  tecnicoResponsavel: ator('tec-1', [atr('tec-1', 'tecnico', noHotel)]),
  tecnicoDaEquipe: ator('tec-2', [atr('tec-2', 'tecnico', noHotel)], [EQUIPE]),
  tecnicoOutro: ator('tec-3', [atr('tec-3', 'tecnico', noHotel)]),
  solicitanteQueAbriu: ator('sol-1', [atr('sol-1', 'solicitante', noHotel)]),
  solicitanteOutro: ator('sol-2', [atr('sol-2', 'solicitante', noHotel)]),
  proprietario: ator('dono', [
    atr('dono', 'proprietario', { tipo: 'proprietario', proprietarioId: 'p-1' }),
  ]),
  gerenteDeOutroHotel: ator('gerente-2', [
    atr('gerente-2', 'gerente_hotel', { tipo: 'hotel', hotelId: 'hotel-2' }),
  ]),
  gerenteVencido: ator('gerente-3', [
    atr('gerente-3', 'gerente_hotel', noHotel, { validoAte: new Date('2026-09-01') }),
  ]),
  gerenteRevogado: ator('gerente-4', [
    atr('gerente-4', 'gerente_hotel', noHotel, { revogadoEm: new Date('2026-09-01') }),
  ]),
  gestorDeOutraBandeira: ator('gestor-2', [
    atr('gestor-2', 'gestor_csc', { tipo: 'bandeira', bandeiraId: 'bandeira-2' }),
  ]),
} satisfies Record<string, AtorDaCorretiva>;
type NomeDoAtor = keyof typeof ATORES;
const NOMES = Object.keys(ATORES) as NomeDoAtor[];

const chamado = (estado: EstadoDoChamado): ChamadoParaRegra => ({
  hotel: HOTEL,
  estado,
  abertoPor: 'sol-1',
});
const DO_TECNICO: Responsavel = { tipo: 'tecnico', usuarioId: 'tec-1' };
const RESPONSAVEIS: Responsavel[] = [DO_TECNICO, { tipo: 'equipe', equipeId: EQUIPE }];

const TRIAGEM: NomeDoAtor[] = ['admin', 'gestor', 'gerente'];
const EXECUCAO: NomeDoAtor[] = ['tecnicoResponsavel', 'tecnicoDaEquipe'];
const ACEITE: NomeDoAtor[] = ['solicitanteQueAbriu', 'gerente'];

/** Quem pode, independente do estado. */
const PODE_NO_CHAMADO = { triar: TRIAGEM, cancelar: TRIAGEM };
const PODE_NA_OS: Record<AcaoDaOs, NomeDoAtor[]> = {
  gerar: TRIAGEM,
  reatribuir: TRIAGEM,
  cancelar: TRIAGEM,
  iniciar: EXECUCAO,
  pausar: EXECUCAO,
  retomar: EXECUCAO,
  concluir: EXECUCAO,
  aceitar: ACEITE,
  reabrir: ACEITE,
};

/** De onde para onde, com o reflexo no chamado. */
const ESPERADO_NO_CHAMADO: Record<string, Partial<Record<EstadoDoChamado, EstadoDoChamado>>> = {
  triar: { aberto: 'em_triagem' },
  cancelar: { aberto: 'cancelado', em_triagem: 'cancelado' },
};
type Passo = { os: EstadoDaOs; chamado: EstadoDoChamado | null };
const ESPERADO_NA_OS: Record<AcaoDaOs, Partial<Record<EstadoDaOs | 'nova', Passo>>> = {
  gerar: { nova: { os: 'atribuida', chamado: 'em_execucao' } },
  reatribuir: {
    atribuida: { os: 'atribuida', chamado: null },
    em_execucao: { os: 'atribuida', chamado: null },
    pausada: { os: 'atribuida', chamado: null },
  },
  iniciar: { atribuida: { os: 'em_execucao', chamado: null } },
  pausar: { em_execucao: { os: 'pausada', chamado: null } },
  retomar: { pausada: { os: 'em_execucao', chamado: null } },
  concluir: { em_execucao: { os: 'concluida', chamado: 'aguardando_aceite' } },
  aceitar: { concluida: { os: 'aceita', chamado: 'concluido' } },
  reabrir: { concluida: { os: 'em_execucao', chamado: 'em_execucao' } },
  cancelar: {
    atribuida: { os: 'cancelada', chamado: 'cancelado' },
    em_execucao: { os: 'cancelada', chamado: 'cancelado' },
    pausada: { os: 'cancelada', chamado: 'cancelado' },
  },
};
/** Estado do chamado coerente com cada estado da OS. */
const CHAMADO_DA_OS: Record<EstadoDaOs | 'nova', EstadoDoChamado> = {
  nova: 'aberto',
  atribuida: 'em_execucao',
  em_execucao: 'em_execucao',
  pausada: 'em_execucao',
  concluida: 'aguardando_aceite',
  aceita: 'concluido',
  cancelada: 'cancelado',
};

const codigo = (f: () => unknown): string | null => {
  try {
    f();
    return null;
  } catch (e) {
    return (e as { codigo: string }).codigo;
  }
};

describe('chamado antes da OS: toda ação × estado × papel', () => {
  for (const acao of ACOES_DO_CHAMADO)
    for (const estado of ESTADOS_DO_CHAMADO)
      for (const nome of NOMES) {
        const pode = PODE_NO_CHAMADO[acao].includes(nome);
        const para = ESPERADO_NO_CHAMADO[acao]?.[estado];
        const esperado = !pode ? 'acao_fora_do_papel' : !para ? 'transicao_invalida' : null;
        it(`${acao} em ${estado} por ${nome}: ${esperado ?? `vai para ${para}`}`, () => {
          const f = () =>
            decidirNoChamado(acao, {
              ator: ATORES[nome],
              chamado: chamado(estado),
              motivo: 'Duplicado',
              agora,
            });
          if (esperado) expect(codigo(f)).toBe(esperado);
          else expect(f().estado).toBe(para);
        });
      }
});

describe('OS: toda ação × estado × papel, com o reflexo no chamado', () => {
  for (const acao of ACOES_DA_OS)
    for (const estado of ['nova', ...ESTADOS_DA_OS] as const)
      for (const nome of NOMES)
        for (const responsavel of PODE_NA_OS[acao] === EXECUCAO
          ? RESPONSAVEIS
          : RESPONSAVEIS.slice(0, 1)) {
          const pode = PODE_NA_OS[acao].includes(nome);
          const passo = ESPERADO_NA_OS[acao][estado];
          const precisaResponder = PODE_NA_OS[acao] === EXECUCAO;
          const tecnicoDoHotel = ['tecnicoResponsavel', 'tecnicoDaEquipe', 'tecnicoOutro'];
          // Técnico do hotel que não responde por esta OS: conflito (409).
          const responde =
            responsavel.tipo === 'tecnico'
              ? nome === 'tecnicoResponsavel'
              : nome === 'tecnicoDaEquipe';
          const esperado =
            precisaResponder && tecnicoDoHotel.includes(nome)
              ? !passo
                ? 'transicao_invalida'
                : responde
                  ? null
                  : 'os_de_outro_responsavel'
              : !pode
                ? 'acao_fora_do_papel'
                : !passo
                  ? 'transicao_invalida'
                  : null;
          it(`${acao} em ${estado} por ${nome} (OS de ${responsavel.tipo}): ${esperado ?? `vai para ${passo?.os}`}`, () => {
            const f = () =>
              decidirNaOs(acao, {
                ator: ATORES[nome],
                chamado: chamado(CHAMADO_DA_OS[estado]),
                os: estado === 'nova' ? null : { estado, responsavel },
                motivo: 'Refazer a vedação',
                agora,
              });
            if (esperado) expect(codigo(f)).toBe(esperado);
            else expect(f()).toMatchObject({ estado: passo?.os, chamado: passo?.chamado });
          });
        }
});

describe('regras além da tabela', () => {
  const gerente = ATORES.gerente;

  it('gerar a OS pede o chamado aberto ou em triagem', () => {
    for (const estado of ESTADOS_DO_CHAMADO) {
      const f = () =>
        decidirNaOs('gerar', { ator: gerente, chamado: chamado(estado), os: null, agora });
      if (estado === 'aberto' || estado === 'em_triagem') expect(f().chamado).toBe('em_execucao');
      else expect(codigo(f)).toBe('transicao_invalida');
    }
  });

  it('transição inválida é conflito (409) com a ação e o estado', () => {
    try {
      decidirNoChamado('triar', { ator: gerente, chamado: chamado('cancelado'), agora });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(Conflito);
      expect((e as Conflito).parametros).toEqual({ acao: 'triar', estado: 'cancelado' });
    }
  });

  it('papel sem a ação é 403, e vem antes do estado', () => {
    const f = () =>
      decidirNoChamado('triar', {
        ator: ATORES.tecnicoOutro,
        chamado: chamado('cancelado'),
        agora,
      });
    expect(f).toThrow(PermissaoNegada);
    expect(codigo(f)).toBe('acao_fora_do_papel');
  });

  it('OS reatribuída com a operação do técnico na fila: conflito visível', () => {
    const f = () =>
      decidirNaOs('concluir', {
        ator: ATORES.tecnicoResponsavel,
        chamado: chamado('em_execucao'),
        os: { estado: 'em_execucao', responsavel: { tipo: 'tecnico', usuarioId: 'tec-3' } },
        agora,
      });
    expect(f).toThrow(Conflito);
    expect(codigo(f)).toBe('os_de_outro_responsavel');
  });

  it('cancelar e reabrir exigem motivo; triar e concluir não guardam motivo', () => {
    for (const motivo of [undefined, null, '', '   ', 'x'.repeat(501)]) {
      expect(
        codigo(() =>
          decidirNoChamado('cancelar', {
            ator: gerente,
            chamado: chamado('aberto'),
            motivo,
            agora,
          }),
        ),
      ).toBe('motivo_obrigatorio');
      expect(
        codigo(() =>
          decidirNaOs('reabrir', {
            ator: gerente,
            chamado: chamado('aguardando_aceite'),
            os: { estado: 'concluida', responsavel: DO_TECNICO },
            motivo,
            agora,
          }),
        ),
      ).toBe('motivo_obrigatorio');
    }
    expect(
      decidirNoChamado('cancelar', {
        ator: gerente,
        chamado: chamado('aberto'),
        motivo: '  aberto   em duplicidade ',
        agora,
      }).motivo,
    ).toBe('aberto em duplicidade');
    expect(
      decidirNoChamado('triar', { ator: gerente, chamado: chamado('aberto'), motivo: 'x', agora })
        .motivo,
    ).toBeNull();
  });

  it('quem abriu e perdeu o papel no hotel não aceita mais', () => {
    const exSolicitante = ator('sol-1', [
      atr('sol-1', 'solicitante', noHotel, { revogadoEm: new Date('2026-09-10') }),
    ]);
    expect(
      codigo(() =>
        decidirNaOs('aceitar', {
          ator: exSolicitante,
          chamado: chamado('aguardando_aceite'),
          os: { estado: 'concluida', responsavel: DO_TECNICO },
          agora,
        }),
      ),
    ).toBe('acao_fora_do_papel');
  });

  it('o técnico que abriu o chamado também aceita', () => {
    const r = decidirNaOs('aceitar', {
      ator: ATORES.tecnicoOutro,
      chamado: { ...chamado('aguardando_aceite'), abertoPor: 'tec-3' },
      os: { estado: 'concluida', responsavel: DO_TECNICO },
      agora,
    });
    expect(r).toMatchObject({ estado: 'aceita', chamado: 'concluido' });
  });

  it('normalizarMotivo lança RegraViolada com o máximo', () => {
    expect(() => normalizarMotivo('')).toThrow(RegraViolada);
    expect(() => normalizarMotivo('')).toThrow(
      expect.objectContaining({ parametros: { maximo: 500 } }),
    );
  });
});

describe('abrir chamado e triagem, por papel', () => {
  const ABREM: NomeDoAtor[] = [
    'admin',
    'gestor',
    'gerente',
    'implantador',
    'tecnicoResponsavel',
    'tecnicoDaEquipe',
    'tecnicoOutro',
    'solicitanteQueAbriu',
    'solicitanteOutro',
  ];
  for (const nome of NOMES) {
    it(`${nome} ${ABREM.includes(nome) ? 'abre' : 'não abre'} chamado`, () => {
      const f = () => podeAbrirChamado(ATORES[nome], HOTEL, agora);
      if (ABREM.includes(nome)) expect(f).not.toThrow();
      else expect(codigo(f)).toBe('chamado_fora_do_escopo');
    });
    it(`${nome} ${TRIAGEM.includes(nome) ? 'faz' : 'não faz'} a triagem`, () => {
      const f = () => podeTriar(ATORES[nome], HOTEL, agora);
      if (TRIAGEM.includes(nome)) expect(f).not.toThrow();
      else expect(codigo(f)).toBe('triagem_fora_do_papel');
    });
  }
});
