// A OS preventiva na máquina de estados (PV3, ADR-041): sem chamado, as mesmas
// transições da corretiva, sem reflexo em chamado; gerar fica com o worker. O
// aceite é do Gerente do hotel que não executa a OS; sem outro Gerente vigente
// no hotel, do Gestor CSC ou do Admin do grupo (decisão 12; Cesar, 21/10/2026). As tabelas esperadas são escritas à mão.
import { describe, expect, it } from 'vitest';
import {
  ACOES_DA_OS,
  type AcaoDaOs,
  type AtorDaCorretiva,
  type Atribuicao,
  type DadosDoAceite,
  ESTADOS_DA_OS,
  type EstadoDaOs,
  type Papel,
  REGISTROS_NA_OS,
  type Responsavel,
  decidirNaOs,
  decidirRegistroNaOs,
} from '../src';

const agora = new Date('2026-10-13T12:00:00Z');
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
  tecnicoResponsavel: ator('tec-1', [atr('tec-1', 'tecnico', noHotel)]),
  tecnicoDaEquipe: ator('tec-2', [atr('tec-2', 'tecnico', noHotel)], [EQUIPE]),
  tecnicoOutro: ator('tec-3', [atr('tec-3', 'tecnico', noHotel)]),
  solicitante: ator('sol-1', [atr('sol-1', 'solicitante', noHotel)]),
  gerenteDeOutroHotel: ator('gerente-2', [
    atr('gerente-2', 'gerente_hotel', { tipo: 'hotel', hotelId: 'hotel-2' }),
  ]),
} satisfies Record<string, AtorDaCorretiva>;
type NomeDoAtor = keyof typeof ATORES;
const NOMES = Object.keys(ATORES) as NomeDoAtor[];

const DO_TECNICO: Responsavel = { tipo: 'tecnico', usuarioId: 'tec-1' };
const DA_EQUIPE: Responsavel = { tipo: 'equipe', equipeId: EQUIPE };

const GESTAO: NomeDoAtor[] = ['admin', 'gestor', 'gerente'];
const EXECUCAO: NomeDoAtor[] = ['tecnicoResponsavel', 'tecnicoDaEquipe'];
const TECNICOS_DO_HOTEL: NomeDoAtor[] = ['tecnicoResponsavel', 'tecnicoDaEquipe', 'tecnicoOutro'];

/** Com um Gerente vigente no hotel (o caso comum), só ele decide o aceite. */
const COM_GERENTE: DadosDoAceite = { equipesDeQuemAbriu: [], gerentes: ATORES.gerente.atribuicoes };

const PODE: Record<Exclude<AcaoDaOs, 'gerar'>, NomeDoAtor[]> = {
  reatribuir: GESTAO,
  cancelar: GESTAO,
  iniciar: EXECUCAO,
  pausar: EXECUCAO,
  retomar: EXECUCAO,
  concluir: EXECUCAO,
  aceitar: ['gerente'],
  // Só o worker aceita sozinho (ADR-044), e só a corretiva: nenhum papel.
  aceitar_automatico: [],
  reabrir: ['gerente'],
};
const ESPERADO: Record<Exclude<AcaoDaOs, 'gerar'>, Partial<Record<EstadoDaOs, EstadoDaOs>>> = {
  reatribuir: { atribuida: 'atribuida', em_execucao: 'atribuida', pausada: 'atribuida' },
  iniciar: { atribuida: 'em_execucao' },
  pausar: { em_execucao: 'pausada' },
  retomar: { pausada: 'em_execucao' },
  concluir: { em_execucao: 'concluida' },
  aceitar: { concluida: 'aceita' },
  aceitar_automatico: { concluida: 'aceita' },
  reabrir: { concluida: 'em_execucao' },
  cancelar: { atribuida: 'cancelada', em_execucao: 'cancelada', pausada: 'cancelada' },
};

const codigo = (f: () => unknown): string | null => {
  try {
    f();
    return null;
  } catch (e) {
    return (e as { codigo?: string }).codigo ?? 'erro_sem_codigo';
  }
};

const naPreventiva = (
  acao: AcaoDaOs,
  a: AtorDaCorretiva,
  estado: EstadoDaOs,
  o: { responsavel?: Responsavel; aceite?: DadosDoAceite } = {},
) =>
  decidirNaOs(acao, {
    ator: a,
    chamado: null,
    hotel: HOTEL,
    os: { estado, responsavel: o.responsavel ?? DO_TECNICO },
    motivo: 'Refazer a vedação',
    ...(o.aceite ? { aceite: o.aceite } : {}),
    agora,
  });

describe('OS preventiva: toda ação × estado × papel, sem reflexo em chamado', () => {
  for (const acao of ACOES_DA_OS.filter((a) => a !== 'gerar'))
    for (const estado of ESTADOS_DA_OS)
      for (const nome of NOMES)
        for (const responsavel of PODE[acao] === EXECUCAO
          ? [DO_TECNICO, DA_EQUIPE]
          : [DO_TECNICO]) {
          const para = ESPERADO[acao][estado];
          const responde =
            responsavel.tipo === 'tecnico'
              ? nome === 'tecnicoResponsavel'
              : nome === 'tecnicoDaEquipe';
          const esperado =
            PODE[acao] === EXECUCAO && TECNICOS_DO_HOTEL.includes(nome)
              ? !para
                ? 'transicao_invalida'
                : responde
                  ? null
                  : 'os_de_outro_responsavel'
              : !PODE[acao].includes(nome)
                ? 'acao_fora_do_papel'
                : !para
                  ? 'transicao_invalida'
                  : null;
          it(`${acao} em ${estado} por ${nome} (OS de ${responsavel.tipo}): ${esperado ?? `vai para ${para}`}`, () => {
            const f = () =>
              naPreventiva(acao, ATORES[nome], estado, { responsavel, aceite: COM_GERENTE });
            if (esperado) expect(codigo(f)).toBe(esperado);
            else expect(f()).toMatchObject({ estado: para, chamado: null });
          });
        }
});

describe('OS preventiva: regras além da tabela', () => {
  it('gerar não passa pela regra: quem gera é o worker', () => {
    expect(() =>
      decidirNaOs('gerar', {
        ator: ATORES.gestor,
        chamado: null,
        hotel: HOTEL,
        os: null,
        osDoChamado: [],
        agora,
      }),
    ).toThrow(/worker/);
  });

  it('cancelar e reabrir pedem o motivo; as outras ações não o devolvem', () => {
    expect(naPreventiva('cancelar', ATORES.gestor, 'atribuida').motivo).toBe('Refazer a vedação');
    expect(
      naPreventiva('reabrir', ATORES.gerente, 'concluida', { aceite: COM_GERENTE }).motivo,
    ).toBe('Refazer a vedação');
    expect(naPreventiva('iniciar', ATORES.tecnicoResponsavel, 'atribuida').motivo).toBeNull();
  });

  describe('aceite sem Gerente vigente no hotel: o Gestor CSC ou o Admin (decisão 12)', () => {
    const SEM_GERENTE: DadosDoAceite = { equipesDeQuemAbriu: [], gerentes: [] };
    const recusa = (f: () => unknown) => expect(codigo(f)).toBe('acao_fora_do_papel');

    for (const acao of ['aceitar', 'reabrir'] as const) {
      it(`${acao}: sem Gerente no hotel, o Gestor CSC e o Admin decidem`, () => {
        const para = acao === 'aceitar' ? 'aceita' : 'em_execucao';
        expect(naPreventiva(acao, ATORES.gestor, 'concluida', { aceite: SEM_GERENTE }).estado).toBe(
          para,
        );
        expect(naPreventiva(acao, ATORES.admin, 'concluida', { aceite: SEM_GERENTE }).estado).toBe(
          para,
        );
      });
    }

    it('o Gerente vencido, revogado ou de outro hotel não conta como Gerente do hotel', () => {
      const naoContam: DadosDoAceite = {
        equipesDeQuemAbriu: [],
        gerentes: [
          atr('g-v', 'gerente_hotel', noHotel, { validoAte: new Date('2026-09-01') }),
          atr('g-r', 'gerente_hotel', noHotel, { revogadoEm: new Date('2026-09-01') }),
          ...ATORES.gerenteDeOutroHotel.atribuicoes,
        ],
      };
      expect(
        naPreventiva('aceitar', ATORES.gestor, 'concluida', { aceite: naoContam }).estado,
      ).toBe('aceita');
    });

    it('com Gerente vigente no hotel, o Gestor CSC e o Admin não decidem', () => {
      recusa(() => naPreventiva('aceitar', ATORES.gestor, 'concluida', { aceite: COM_GERENTE }));
      recusa(() => naPreventiva('aceitar', ATORES.admin, 'concluida', { aceite: COM_GERENTE }));
    });

    it('sem os dados do aceite, falha fechada: só o Gerente decide', () => {
      recusa(() => naPreventiva('aceitar', ATORES.gestor, 'concluida'));
      recusa(() => naPreventiva('aceitar', ATORES.admin, 'concluida'));
      expect(naPreventiva('aceitar', ATORES.gerente, 'concluida').estado).toBe('aceita');
    });

    it('o Gestor CSC de outra bandeira, o Técnico e o Solicitante nunca decidem', () => {
      const gestorDeOutra = ator('gestor-2', [
        atr('gestor-2', 'gestor_csc', { tipo: 'bandeira', bandeiraId: 'bandeira-2' }),
      ]);
      recusa(() => naPreventiva('aceitar', gestorDeOutra, 'concluida', { aceite: SEM_GERENTE }));
      recusa(() =>
        naPreventiva('aceitar', ATORES.tecnicoResponsavel, 'concluida', { aceite: SEM_GERENTE }),
      );
      recusa(() =>
        naPreventiva('aceitar', ATORES.solicitante, 'concluida', { aceite: SEM_GERENTE }),
      );
    });
  });

  describe('o Gerente que executa a preventiva não decide o aceite (Cesar, 21/10/2026)', () => {
    const recusa = (f: () => unknown) => expect(codigo(f)).toBe('acao_fora_do_papel');
    const DO_GERENTE: Responsavel = { tipo: 'tecnico', usuarioId: 'gerente' };
    const gerenteDaEquipe = ator('gerente', ATORES.gerente.atribuicoes, [EQUIPE]);
    const outroGerente = ator('gerente-3', [atr('gerente-3', 'gerente_hotel', noHotel)]);

    for (const acao of ['aceitar', 'reabrir'] as const) {
      it(`${acao}: o Gerente responsável pela OS não decide; o Gestor CSC e o Admin, sim`, () => {
        const o = { responsavel: DO_GERENTE, aceite: COM_GERENTE };
        recusa(() => naPreventiva(acao, ATORES.gerente, 'concluida', o));
        expect(codigo(() => naPreventiva(acao, ATORES.gestor, 'concluida', o))).toBeNull();
        expect(codigo(() => naPreventiva(acao, ATORES.admin, 'concluida', o))).toBeNull();
      });
    }

    it('o Gerente membro da equipe responsável não decide; o Gestor CSC, sim', () => {
      const aceite: DadosDoAceite = { ...COM_GERENTE, membrosDaEquipeResponsavel: ['gerente'] };
      const o = { responsavel: DA_EQUIPE, aceite };
      recusa(() => naPreventiva('aceitar', gerenteDaEquipe, 'concluida', o));
      expect(naPreventiva('aceitar', ATORES.gestor, 'concluida', o).estado).toBe('aceita');
    });

    it('sem os membros da equipe, o Gerente conta como outro Gerente: falha fechada', () => {
      const o = { responsavel: DA_EQUIPE, aceite: COM_GERENTE };
      recusa(() => naPreventiva('aceitar', gerenteDaEquipe, 'concluida', o));
      recusa(() => naPreventiva('aceitar', ATORES.gestor, 'concluida', o));
    });

    it('com outro Gerente vigente no hotel, decide ele, e não o Gestor CSC', () => {
      const aceite: DadosDoAceite = {
        equipesDeQuemAbriu: [],
        gerentes: [...ATORES.gerente.atribuicoes, ...outroGerente.atribuicoes],
      };
      const o = { responsavel: DO_GERENTE, aceite };
      expect(naPreventiva('aceitar', outroGerente, 'concluida', o).estado).toBe('aceita');
      recusa(() => naPreventiva('aceitar', ATORES.gestor, 'concluida', o));
    });
  });

  describe('registros na OS preventiva: a mesma regra da corretiva', () => {
    const registrar = (
      registro: (typeof REGISTROS_NA_OS)[number],
      a: AtorDaCorretiva,
      estado: EstadoDaOs,
    ) =>
      codigo(() =>
        decidirRegistroNaOs(registro, {
          ator: a,
          chamado: null,
          hotel: HOTEL,
          os: { estado, responsavel: DO_TECNICO },
          agora,
        }),
      );

    for (const registro of REGISTROS_NA_OS) {
      it(`${registro}: o responsável registra com a OS em execução`, () => {
        expect(registrar(registro, ATORES.tecnicoResponsavel, 'em_execucao')).toBeNull();
        expect(registrar(registro, ATORES.tecnicoOutro, 'em_execucao')).toBe(
          'os_de_outro_responsavel',
        );
        expect(registrar(registro, ATORES.gerente, 'em_execucao')).toBe('acao_fora_do_papel');
        expect(registrar(registro, ATORES.tecnicoResponsavel, 'concluida')).toBe(
          'transicao_invalida',
        );
      });
    }
  });
});
