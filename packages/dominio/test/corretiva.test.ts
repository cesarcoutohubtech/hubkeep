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
  type DadosDoAceite,
  Conflito,
  ESTADOS_DA_OS,
  ESTADOS_DO_CHAMADO,
  type EstadoDaOs,
  type EstadoDoChamado,
  type Papel,
  PAPEIS_DA_ADMINISTRACAO,
  PAPEIS_DA_TRIAGEM,
  PermissaoNegada,
  RegraViolada,
  type Responsavel,
  TRANSICOES_DA_OS,
  TRANSICOES_DO_CHAMADO,
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
  // Só o worker, sem autor (ADR-044): nenhum ator humano.
  aceitar_automatico: [],
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
  aceitar_automatico: { concluida: { os: 'aceita', chamado: 'concluido' } },
  reabrir: { concluida: { os: 'em_execucao', chamado: 'em_execucao' } },
  // A OS cancelada devolve o chamado à triagem, para ganhar outra OS (Cesar, 29/09/2026).
  cancelar: {
    atribuida: { os: 'cancelada', chamado: 'em_triagem' },
    em_execucao: { os: 'cancelada', chamado: 'em_triagem' },
    pausada: { os: 'cancelada', chamado: 'em_triagem' },
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
  cancelada: 'em_triagem',
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
                osDoChamado: [],
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
        decidirNaOs('gerar', {
          ator: gerente,
          chamado: chamado(estado),
          os: null,
          osDoChamado: [],
          agora,
        });
      if (estado === 'aberto' || estado === 'em_triagem') expect(f().chamado).toBe('em_execucao');
      else expect(codigo(f)).toBe('transicao_invalida');
    }
  });

  it('OS cancelada: o chamado volta à triagem e ganha outra OS', () => {
    const cancelada = decidirNaOs('cancelar', {
      ator: gerente,
      chamado: chamado('em_execucao'),
      os: { estado: 'em_execucao', responsavel: DO_TECNICO },
      motivo: 'Técnico errado',
      agora,
    });
    expect(cancelada).toMatchObject({ estado: 'cancelada', chamado: 'em_triagem' });
    const outra = decidirNaOs('gerar', {
      ator: gerente,
      chamado: chamado(cancelada.chamado ?? 'aberto'),
      os: null,
      osDoChamado: ['cancelada'],
      agora,
    });
    expect(outra).toMatchObject({ estado: 'atribuida', chamado: 'em_execucao' });
  });

  it('o Admin do grupo é um grupo à parte da triagem, com as mesmas ações de gestão', () => {
    expect([...PAPEIS_DA_TRIAGEM]).toEqual(['gestor_csc', 'gerente_hotel']);
    expect([...PAPEIS_DA_ADMINISTRACAO]).toEqual(['admin_grupo']);
    const gestao = [
      TRANSICOES_DO_CHAMADO.triar.quem,
      TRANSICOES_DO_CHAMADO.cancelar.quem,
      ...(['gerar', 'reatribuir', 'cancelar'] as const).map((a) => TRANSICOES_DA_OS[a].quem),
    ];
    for (const quem of gestao) expect([...quem]).toEqual(['administracao', 'triagem']);
    for (const a of ['iniciar', 'pausar', 'retomar', 'concluir', 'aceitar', 'reabrir'] as const)
      expect(TRANSICOES_DA_OS[a].quem).not.toContain('administracao');
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

  describe('quem abriu e executa a OS não decide o aceite; só o Gerente (Cesar, 30/09/2026)', () => {
    const decidir = (
      acao: 'aceitar' | 'reabrir',
      a: AtorDaCorretiva,
      abertoPor: string,
      responsavel: Responsavel,
    ) =>
      decidirNaOs(acao, {
        ator: a,
        chamado: { ...chamado('aguardando_aceite'), abertoPor },
        os: { estado: 'concluida', responsavel },
        motivo: 'não resolveu',
        agora,
      });
    for (const acao of ['aceitar', 'reabrir'] as const) {
      it(`${acao}: o técnico responsável que abriu é recusado, e o Gerente decide`, () => {
        expect(codigo(() => decidir(acao, ATORES.tecnicoResponsavel, 'tec-1', DO_TECNICO))).toBe(
          'acao_fora_do_papel',
        );
        expect(decidir(acao, ATORES.gerente, 'tec-1', DO_TECNICO).estado).toBe(
          acao === 'aceitar' ? 'aceita' : 'em_execucao',
        );
      });
      it(`${acao}: o membro da equipe responsável que abriu é recusado`, () => {
        expect(
          codigo(() =>
            decidir(acao, ATORES.tecnicoDaEquipe, 'tec-2', { tipo: 'equipe', equipeId: EQUIPE }),
          ),
        ).toBe('acao_fora_do_papel');
      });
    }
    it('o Gerente que abriu e executa também não decide', () => {
      const gerenteTecnico = ator('ger-tec', [
        atr('ger-tec', 'gerente_hotel', noHotel),
        atr('ger-tec', 'tecnico', noHotel),
      ]);
      expect(
        codigo(() =>
          decidir('aceitar', gerenteTecnico, 'ger-tec', { tipo: 'tecnico', usuarioId: 'ger-tec' }),
        ),
      ).toBe('acao_fora_do_papel');
    });
    it('quem abriu e não executa segue aceitando; o executante que não abriu, não', () => {
      expect(decidir('aceitar', ATORES.tecnicoOutro, 'tec-3', DO_TECNICO).estado).toBe('aceita');
      expect(codigo(() => decidir('aceitar', ATORES.tecnicoResponsavel, 'sol-1', DO_TECNICO))).toBe(
        'acao_fora_do_papel',
      );
    });
  });

  describe('sem outro Gerente ativo no hotel, decidem o Gestor CSC ou o Admin (Cesar, 30/09/2026)', () => {
    const gerenteTecnico = ator('ger-tec', [
      atr('ger-tec', 'gerente_hotel', noHotel),
      atr('ger-tec', 'tecnico', noHotel),
    ]);
    const DO_GERENTE: Responsavel = { tipo: 'tecnico', usuarioId: 'ger-tec' };
    const DA_EQUIPE: Responsavel = { tipo: 'equipe', equipeId: EQUIPE };
    const soEle: DadosDoAceite = { equipesDeQuemAbriu: [], gerentes: gerenteTecnico.atribuicoes };
    const decidir = (
      acao: 'aceitar' | 'reabrir',
      a: AtorDaCorretiva,
      o: { abertoPor?: string; responsavel?: Responsavel; aceite?: DadosDoAceite } = {},
    ) =>
      decidirNaOs(acao, {
        ator: a,
        chamado: { ...chamado('aguardando_aceite'), abertoPor: o.abertoPor ?? 'ger-tec' },
        os: { estado: 'concluida', responsavel: o.responsavel ?? DO_GERENTE },
        motivo: 'não resolveu',
        ...(o.aceite ? { aceite: o.aceite } : {}),
        agora,
      });
    const recusa = (f: () => unknown) => expect(codigo(f)).toBe('acao_fora_do_papel');

    for (const acao of ['aceitar', 'reabrir'] as const) {
      it(`${acao}: Gerente único que abriu e executa — o Gestor CSC e o Admin decidem`, () => {
        expect(decidir(acao, ATORES.gestor, { aceite: soEle }).estado).toBe(
          acao === 'aceitar' ? 'aceita' : 'em_execucao',
        );
        expect(decidir(acao, ATORES.admin, { aceite: soEle }).estado).toBe(
          acao === 'aceitar' ? 'aceita' : 'em_execucao',
        );
        recusa(() => decidir(acao, gerenteTecnico, { aceite: soEle }));
      });
    }

    it('com outro Gerente vigente no hotel, só ele decide', () => {
      const comOutro: DadosDoAceite = {
        equipesDeQuemAbriu: [],
        gerentes: [...gerenteTecnico.atribuicoes, ...ATORES.gerente.atribuicoes],
      };
      recusa(() => decidir('aceitar', ATORES.gestor, { aceite: comOutro }));
      recusa(() => decidir('aceitar', ATORES.admin, { aceite: comOutro }));
      expect(decidir('aceitar', ATORES.gerente, { aceite: comOutro }).estado).toBe('aceita');
    });

    it('Gerente vencido, revogado ou de outro hotel não conta como outro Gerente', () => {
      const semOutro: DadosDoAceite = {
        equipesDeQuemAbriu: [],
        gerentes: [
          ...gerenteTecnico.atribuicoes,
          ...ATORES.gerenteVencido.atribuicoes,
          ...ATORES.gerenteRevogado.atribuicoes,
          ...ATORES.gerenteDeOutroHotel.atribuicoes,
        ],
      };
      expect(decidir('aceitar', ATORES.gestor, { aceite: semOutro }).estado).toBe('aceita');
    });

    it('Gerente pela bandeira ou pelo grupo cobre o hotel e conta', () => {
      for (const escopo of [
        { tipo: 'bandeira', bandeiraId: HOTEL.bandeiraId },
        { tipo: 'grupo' },
      ] as const) {
        const comOutro: DadosDoAceite = {
          equipesDeQuemAbriu: [],
          gerentes: [atr('ger-2', 'gerente_hotel', escopo)],
        };
        recusa(() => decidir('aceitar', ATORES.gestor, { aceite: comOutro }));
      }
    });

    it('quem abriu é da equipe responsável: o fallback vale pelas equipes dele', () => {
      const equipe: DadosDoAceite = { equipesDeQuemAbriu: [EQUIPE], gerentes: [] };
      expect(
        decidir('aceitar', ATORES.gestor, { responsavel: DA_EQUIPE, aceite: equipe }).estado,
      ).toBe('aceita');
      // Quem abriu não é da equipe: não executa, então ele mesmo decide, não o Gestor.
      recusa(() =>
        decidir('aceitar', ATORES.gestor, {
          responsavel: DA_EQUIPE,
          aceite: { equipesDeQuemAbriu: [], gerentes: [] },
        }),
      );
    });

    it('quem abriu não executa: o Gestor não decide, mesmo sem Gerente no hotel', () => {
      recusa(() =>
        decidir('aceitar', ATORES.gestor, {
          abertoPor: 'sol-1',
          aceite: { equipesDeQuemAbriu: [], gerentes: [] },
        }),
      );
    });

    it('Técnico que abriu e executa, hotel sem Gerente: o Gestor decide', () => {
      expect(
        decidir('aceitar', ATORES.gestor, {
          abertoPor: 'tec-1',
          responsavel: DO_TECNICO,
          aceite: { equipesDeQuemAbriu: [], gerentes: [] },
        }).estado,
      ).toBe('aceita');
    });

    it('sem os dados do aceite, falha fechada; Gestor de outra bandeira nunca decide', () => {
      recusa(() => decidir('aceitar', ATORES.gestor));
      recusa(() => decidir('aceitar', ATORES.gestorDeOutraBandeira, { aceite: soEle }));
    });
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
