// Geração da OS preventiva (PV3; ADR-041), com a porta em memória:
//   - o dia é o do fuso de cada hotel;
//   - rodar duas vezes no mesmo dia não duplica (a segunda pula com ja_gerada);
//   - o responsável inválido pula o plano; o ativo cadastrado depois da data
//     prevista espera a próxima;
//   - a gravação que perde para outra execução (índice único) conta como já gerada;
//   - um hotel que falha não segura os outros;
//   - a OS nasce na situação do estado atribuida, com a cópia do checklist do
//     plano (só de modelo ativo) e, no hotel arrendado, a marca de quem
//     responde, pela categoria do ativo.
// O SQL, as travas e o índice único são do teste de integração, junto com a
// migração (zona protegida).
import type { NiveisDePolitica, PreventivaGerada, SituacaoParaRegra } from '@hubkeep/dominio';
import { describe, expect, it } from 'vitest';
import {
  type AtivoDoAlvo,
  type HotelParaGerar,
  type ModeloParaACopia,
  type PlanoDoHotel,
  type PreventivaAGravar,
  criarGeracaoDePreventivas,
} from '../src/index';

// 02:30 UTC de 01/03: ainda 28/02 em São Paulo, já 01/03 em Lisboa.
const AGORA = new Date('2026-03-01T02:30:00Z');
const TECNICO = {
  tipo: 'tecnico',
  usuarioId: 'u1',
  membroAtivo: true,
  atribuicoes: [
    {
      id: 'at-1',
      usuarioId: 'u1',
      papel: 'tecnico',
      escopo: { tipo: 'grupo' },
      validoAte: null,
      revogadoEm: null,
    },
  ],
} as const satisfies PlanoDoHotel['responsavel'];

// A matriz do arrendado é por id de categoria (UUID).
const CAT_AR = '0199a000-0000-7000-8000-000000000001';
const CAT_ELE = '0199a000-0000-7000-8000-000000000002';

const SITUACOES: SituacaoParaRegra[] = [
  { id: 'sit-atribuida-2', entidade: 'os', estado: 'atribuida', ordem: 20, ativa: true },
  { id: 'sit-atribuida-1', entidade: 'os', estado: 'atribuida', ordem: 10, ativa: true },
  { id: 'sit-execucao', entidade: 'os', estado: 'em_execucao', ordem: 5, ativa: true },
];

const hotel = (id: string, p: Partial<HotelParaGerar> = {}): HotelParaGerar => ({
  id,
  bandeiraId: null,
  fuso: 'America/Sao_Paulo',
  modeloContratual: null,
  ...p,
});

const plano = (p: Partial<PlanoDoHotel> = {}): PlanoDoHotel => ({
  id: 'plano-1',
  nome: 'Filtro',
  versao: 1,
  inicio: '2026-01-01',
  intervalo: 1,
  unidade: 'dia',
  checklistModeloId: null,
  responsavel: TECNICO,
  ...p,
});

interface Banco {
  hoteis: HotelParaGerar[];
  planos: Record<string, PlanoDoHotel[]>;
  ativos: Record<string, AtivoDoAlvo[]>;
  geradas: (PreventivaGerada & { planoId: string })[];
  falhaNoHotel?: string;
  /** Simula outra execução que grava a mesma ocorrência antes desta. */
  perdeACorrida?: boolean;
  situacoes?: SituacaoParaRegra[];
  politica?: NiveisDePolitica;
  modelos?: Record<string, ModeloParaACopia>;
}

function geracao(b: Banco) {
  const gravadas: PreventivaAGravar[] = [];
  const rodar = criarGeracaoDePreventivas({
    relogio: { agora: () => AGORA },
    geracao: {
      hoteisAtivos: async () => b.hoteis,
      noHotel: async ({ hotelId }, fn) => {
        if (hotelId === b.falhaNoHotel) throw new Error('falha simulada');
        return fn({
          planosAtivos: async () => b.planos[hotelId] ?? [],
          ativosDoAlvo: async (planoId) => b.ativos[planoId] ?? [],
          geradas: async (planoId) => b.geradas.filter((g) => g.planoId === planoId),
          situacoes: async () => b.situacoes ?? SITUACOES,
          politica: async () => b.politica ?? {},
          modeloDeChecklist: async (id) => b.modelos?.[id] ?? null,
          gerar: async (os) => {
            if (b.perdeACorrida) return false;
            gravadas.push(os);
            b.geradas.push({
              planoId: os.planoId,
              ativoId: os.ativoId,
              dataPrevista: os.dataPrevista,
              estado: 'atribuida',
            });
            return true;
          },
        });
      },
    },
  });
  return { rodar: () => rodar('t1'), gravadas };
}

const ativo = (
  id: string,
  criadoEm = new Date('2025-12-01T12:00:00Z'),
  categoriaId: string | null = null,
): AtivoDoAlvo => ({
  id,
  localId: `l-${id}`,
  categoriaId,
  criadoEm,
});

describe('criarGeracaoDePreventivas', () => {
  it('gera no dia do fuso de cada hotel', async () => {
    const { rodar, gravadas } = geracao({
      hoteis: [hotel('sp'), hotel('lx', { fuso: 'Europe/Lisbon' })],
      planos: { sp: [plano({ id: 'p-sp' })], lx: [plano({ id: 'p-lx' })] },
      ativos: { 'p-sp': [ativo('a1')], 'p-lx': [ativo('a2')] },
      geradas: [],
    });
    const r = await rodar();
    expect(gravadas.map((g) => [g.planoId, g.dataPrevista])).toEqual([
      ['p-sp', '2026-02-28'],
      ['p-lx', '2026-03-01'],
    ]);
    expect(r).toMatchObject({ hoteis: 2, planos: 2, geradas: 2, falhas: [] });
  });

  it('rodar duas vezes no mesmo dia não duplica', async () => {
    const b: Banco = {
      hoteis: [hotel('sp')],
      planos: { sp: [plano()] },
      ativos: { 'plano-1': [ativo('a1'), ativo('a2')] },
      geradas: [],
    };
    const primeira = await geracao(b).rodar();
    const segunda = await geracao(b).rodar();
    expect(primeira.geradas).toBe(2);
    expect(segunda.geradas).toBe(0);
    expect(segunda.puladas.ja_gerada).toBe(2);
  });

  it('a OS que outra execução gravou antes conta como já gerada', async () => {
    const r = await geracao({
      hoteis: [hotel('sp')],
      planos: { sp: [plano()] },
      ativos: { 'plano-1': [ativo('a1')] },
      geradas: [],
      perdeACorrida: true,
    }).rodar();
    expect(r.geradas).toBe(0);
    expect(r.puladas.ja_gerada).toBe(1);
  });

  it('o responsável inválido pula o plano; o ativo novo espera a próxima ocorrência', async () => {
    const { rodar, gravadas } = geracao({
      hoteis: [hotel('sp')],
      planos: {
        sp: [
          plano({ id: 'p1', responsavel: { ...TECNICO, membroAtivo: false } }),
          plano({ id: 'p2', unidade: 'mes', inicio: '2026-01-15' }),
        ],
      },
      ativos: {
        p1: [ativo('a1')],
        // Cadastrado em 20/02 (no fuso): a ocorrência da vez é 15/02.
        p2: [ativo('a2'), ativo('a3', new Date('2026-02-20T15:00:00Z'))],
      },
      geradas: [],
    });
    const r = await rodar();
    expect(gravadas.map((g) => [g.planoId, g.ativoId, g.dataPrevista])).toEqual([
      ['p2', 'a2', '2026-02-15'],
    ]);
    expect(r.puladas).toMatchObject({ sem_responsavel: 1, ativo_posterior: 1 });
  });

  it('o dia do cadastro do ativo também é o do fuso do hotel', async () => {
    // 01/03 às 01:00 UTC ainda é 28/02 em São Paulo: o ativo entra na ocorrência
    // de 28/02. Pelo dia em UTC, ficaria para a próxima.
    const { rodar, gravadas } = geracao({
      hoteis: [hotel('sp')],
      planos: { sp: [plano({ inicio: '2026-02-28' })] },
      ativos: { 'plano-1': [ativo('a1', new Date('2026-03-01T01:00:00Z'))] },
      geradas: [],
    });
    await rodar();
    expect(gravadas.map((g) => g.dataPrevista)).toEqual(['2026-02-28']);
  });

  it('um hotel que falha não segura os outros', async () => {
    const r = await geracao({
      hoteis: [hotel('h1'), hotel('h2')],
      planos: { h2: [plano()] },
      ativos: { 'plano-1': [ativo('a1')] },
      geradas: [],
      falhaNoHotel: 'h1',
    }).rodar();
    expect(r.falhas).toEqual([{ hotelId: 'h1', erro: 'falha simulada' }]);
    expect(r).toMatchObject({ hoteis: 2, geradas: 1 });
  });

  it('a OS nasce na situação atribuida de menor ordem, com a cópia do plano', async () => {
    const { rodar, gravadas } = geracao({
      hoteis: [hotel('sp')],
      planos: { sp: [plano()] },
      ativos: { 'plano-1': [ativo('a1')] },
      geradas: [],
    });
    await rodar();
    expect(gravadas).toEqual([
      {
        planoId: 'plano-1',
        ativoId: 'a1',
        localId: 'l-a1',
        dataPrevista: '2026-02-28',
        responsavel: { tipo: 'tecnico', usuarioId: 'u1' },
        checklistModeloId: null,
        planoAplicado: {
          planoId: 'plano-1',
          nome: 'Filtro',
          versao: 1,
          intervalo: 1,
          unidade: 'dia',
        },
        situacaoId: 'sit-atribuida-1',
        responsavelArrendamento: null,
        avisarLocador: false,
        checklist: null,
      },
    ]);
  });

  it('copia o checklist do plano só de modelo ativo', async () => {
    const modelo = (id: string, ativa: boolean): ModeloParaACopia => ({
      id,
      versao: 3,
      nomes: { 'pt-BR': 'Inspeção' },
      itens: [{ chave: 'filtro' }],
      ativa,
    });
    const { rodar, gravadas } = geracao({
      hoteis: [hotel('sp')],
      planos: {
        sp: [
          plano({ id: 'p-ativo', checklistModeloId: 'm-ativo' }),
          plano({ id: 'p-inativo', checklistModeloId: 'm-inativo' }),
          plano({ id: 'p-sumiu', checklistModeloId: 'm-sumiu' }),
        ],
      },
      ativos: { 'p-ativo': [ativo('a1')], 'p-inativo': [ativo('a2')], 'p-sumiu': [ativo('a3')] },
      geradas: [],
      modelos: { 'm-ativo': modelo('m-ativo', true), 'm-inativo': modelo('m-inativo', false) },
    });
    await rodar();
    expect(gravadas.map((g) => [g.planoId, g.checklist])).toEqual([
      [
        'p-ativo',
        { id: 'm-ativo', versao: 3, nomes: { 'pt-BR': 'Inspeção' }, itens: [{ chave: 'filtro' }] },
      ],
      ['p-inativo', null],
      ['p-sumiu', null],
    ]);
  });

  it('no hotel arrendado, marca quem responde pela categoria do ativo e avisa o locador; nos outros, nada', async () => {
    const b: Banco = {
      hoteis: [
        hotel('arr', { modeloContratual: 'arrendado' }),
        hotel('adm', { modeloContratual: 'administrado' }),
      ],
      planos: { arr: [plano({ id: 'p-arr' })], adm: [plano({ id: 'p-adm' })] },
      ativos: {
        'p-arr': [
          ativo('a-ar', undefined, CAT_AR),
          ativo('a-ele', undefined, CAT_ELE),
          ativo('a-sem', undefined, null),
        ],
        'p-adm': [ativo('a-adm', undefined, CAT_AR)],
      },
      geradas: [],
      politica: { grupo: { [CAT_AR]: 'locador' } },
    };
    const { rodar, gravadas } = geracao(b);
    await rodar();
    expect(gravadas.map((g) => [g.ativoId, g.responsavelArrendamento, g.avisarLocador])).toEqual([
      ['a-ar', 'locador', true],
      ['a-ele', 'arrendataria', false],
      ['a-sem', 'arrendataria', false],
      ['a-adm', null, false],
    ]);
  });

  it('sem situação para a OS atribuída, o hotel falha só se houver o que gerar', async () => {
    const r = await geracao({
      hoteis: [hotel('vazio'), hotel('sp')],
      planos: { sp: [plano()] },
      ativos: { 'plano-1': [ativo('a1')] },
      geradas: [],
      situacoes: [],
    }).rodar();
    expect(r.falhas.map((f) => f.hotelId)).toEqual(['sp']);
    expect(r.geradas).toBe(0);
  });
});
