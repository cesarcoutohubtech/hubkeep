// O que a ligação monta a partir das linhas do banco: que chamado é corretiva,
// desde quando ler, e as políticas resolvidas de cada hotel com a versão.
import { registrosDePoliticasPorModulo } from '@hubkeep/dominio';
import { describe, expect, it } from 'vitest';
import {
  type ChamadoDaFonte,
  EXTENSAO_DE_POLITICAS_DO_INTELLIGENCE,
  type HotelDaFonte,
  JANELA_CUSTO_DIAS,
  type LinhaDePolitica,
  type OsDaFonte,
  PADRAO_ATENCAO,
  PADRAO_REINCIDENCIA,
  PADRAO_SISTEMICO,
  corretivasDosChamados,
  hoteisDoDia,
  inicioDaLeitura,
  politicaSistemicaDoGrupo,
  primeiroChamadoPorHotel,
} from '../src';
import { agora, dia } from './apoio';

const registro = registrosDePoliticasPorModulo([
  { modulo: 'inteligencia', extensao: EXTENSAO_DE_POLITICAS_DO_INTELLIGENCE },
]).doTenant(new Set(['inteligencia']));

const os = (p: Partial<OsDaFonte> = {}): OsDaFonte => ({
  estado: 'em_execucao',
  criadaEm: dia(-5),
  codigoFalha: null,
  executadoPor: 'equipe_interna',
  fornecedorId: null,
  custoInformado: null,
  transicoes: [],
  ...p,
});

const chamado = (p: Partial<ChamadoDaFonte> & { id: string }): ChamadoDaFonte => ({
  hotelId: 'h1',
  localId: 'l1',
  ativoId: 'a1',
  abertaEm: dia(-5),
  estado: 'em_execucao',
  impactoHospede: null,
  os: [],
  ...p,
});

describe('corretivasDosChamados', () => {
  it('o chamado cancelado sem OS não é corretiva; o ainda sem OS entra sem os campos dela', () => {
    const r = corretivasDosChamados([
      chamado({ id: 'cancelado', estado: 'cancelado' }),
      chamado({ id: 'na_triagem', estado: 'em_triagem', impactoHospede: true }),
    ]);
    expect(r).toEqual([
      {
        id: 'na_triagem',
        hotelId: 'h1',
        localId: 'l1',
        ativoId: 'a1',
        abertaEm: dia(-5),
        impactoHospede: true,
        codigoFalha: null,
        transicoes: [],
      },
    ]);
  });

  it('o chamado cancelado fica fora mesmo depois de ter OS (glossário, divergência b)', () => {
    const r = corretivasDosChamados([
      chamado({ id: 'c1', estado: 'cancelado', os: [os({ estado: 'cancelada' })] }),
      chamado({ id: 'c2', estado: 'cancelado', os: [os({ estado: 'concluida' })] }),
    ]);
    expect(r).toEqual([]);
  });

  it('com mais de uma OS, vale a que não foi cancelada', () => {
    const viva = os({
      estado: 'concluida',
      criadaEm: dia(-3),
      codigoFalha: 'compressor',
      executadoPor: 'fornecedor',
      fornecedorId: 'f1',
      custoInformado: 350.5,
      transicoes: [{ acao: 'concluir', para: 'concluida', quando: dia(-1) }],
    });
    const r = corretivasDosChamados([
      chamado({
        id: 'c1',
        os: [os({ estado: 'cancelada', criadaEm: dia(-2), codigoFalha: 'outro' }), viva],
      }),
    ]);
    expect(r[0]).toMatchObject({
      codigoFalha: 'compressor',
      executadoPor: 'fornecedor',
      fornecedorId: 'f1',
      custoInformado: 350.5,
      transicoes: viva.transicoes,
    });
  });

  it('só com OS canceladas, vale a mais recente', () => {
    const r = corretivasDosChamados([
      chamado({
        id: 'c1',
        os: [
          os({ estado: 'cancelada', criadaEm: dia(-4), codigoFalha: 'antiga' }),
          os({ estado: 'cancelada', criadaEm: dia(-2), codigoFalha: 'recente' }),
        ],
      }),
    ]);
    expect(r[0]?.codigoFalha).toBe('recente');
  });
});

describe('inicioDaLeitura', () => {
  const hoteis = [{ hotelId: 'h1', bandeiraId: null }];

  it('com os padrões, 12 meses: a janela do custo informado', () => {
    expect(inicioDaLeitura(hoteis, PADRAO_SISTEMICO, agora)).toEqual(dia(-JANELA_CUSTO_DIAS));
  });

  it('a maior janela vence: a da reincidência de um hotel, mais os dias da falha depois de preventiva, ou o dobro da do crescimento', () => {
    const longa = { ...PADRAO_REINCIDENCIA, janelaDias: 400 };
    expect(
      inicioDaLeitura(
        [...hoteis, { hotelId: 'h2', bandeiraId: null, reincidencia: longa }],
        PADRAO_SISTEMICO,
        agora,
      ),
    ).toEqual(dia(-430));
    const crescimento = { ...PADRAO_SISTEMICO.crescimento, janelaDias: 250 };
    expect(inicioDaLeitura(hoteis, { ...PADRAO_SISTEMICO, crescimento }, agora)).toEqual(dia(-500));
  });
});

describe('hoteisDoDia', () => {
  const hoteis: HotelDaFonte[] = [
    { id: 'h1', bandeiraId: 'b1', status: 'ativo', fuso: 'America/Sao_Paulo' },
    { id: 'h2', bandeiraId: 'b1', status: 'ativo', fuso: 'America/Sao_Paulo' },
    { id: 'h3', bandeiraId: null, status: 'ativo', fuso: 'America/Manaus' },
    { id: 'h4', bandeiraId: null, status: 'em_implantacao', fuso: 'America/Sao_Paulo' },
    { id: 'h5', bandeiraId: null, status: 'desativado', fuso: 'America/Sao_Paulo' },
  ];
  const em = new Date('2026-09-01T10:00:00.000Z');
  const linha = (p: Partial<LinhaDePolitica> & Pick<LinhaDePolitica, 'id'>): LinhaDePolitica => ({
    chave: 'inteligencia.reincidencia',
    escopo: 'grupo',
    hotelId: null,
    bandeiraId: null,
    valor: PADRAO_REINCIDENCIA,
    atualizadoEm: em,
    ...p,
  });

  it('sem política gravada: só os hotéis ativos, com os padrões e a versão padrao', () => {
    expect(hoteisDoDia(hoteis, [], registro)).toEqual(
      ['h1', 'h2', 'h3'].map((id) => ({
        hotelId: id,
        bandeiraId: id === 'h3' ? null : 'b1',
        fuso: id === 'h3' ? 'America/Manaus' : 'America/Sao_Paulo',
        reincidencia: PADRAO_REINCIDENCIA,
        atencao: PADRAO_ATENCAO,
        versaoPolitica: 'padrao',
      })),
    );
  });

  it('hotel, senão bandeira, senão grupo; a versão cita a linha que resolveu', () => {
    const doHotel = { ...PADRAO_REINCIDENCIA, janelaDias: 30 };
    const daBandeira = { ...PADRAO_REINCIDENCIA, janelaDias: 60 };
    const doGrupo = { ...PADRAO_REINCIDENCIA, janelaDias: 120 };
    const r = hoteisDoDia(
      hoteis,
      [
        linha({ id: 'p-hotel', escopo: 'hotel', hotelId: 'h1', valor: doHotel }),
        linha({ id: 'p-bandeira', escopo: 'bandeira', bandeiraId: 'b1', valor: daBandeira }),
        linha({ id: 'p-grupo', valor: doGrupo }),
      ],
      registro,
    );
    expect(r.map((h) => [h.hotelId, h.reincidencia?.janelaDias, h.versaoPolitica])).toEqual([
      ['h1', 30, 'inteligencia.reincidencia=p-hotel@2026-09-01T10:00:00.000Z'],
      ['h2', 60, 'inteligencia.reincidencia=p-bandeira@2026-09-01T10:00:00.000Z'],
      ['h3', 120, 'inteligencia.reincidencia=p-grupo@2026-09-01T10:00:00.000Z'],
    ]);
  });

  it('a linha fora do formato não resolve nem entra na versão; as duas chaves entram juntas', () => {
    const atencao = { ...PADRAO_ATENCAO, limiteInsight: 80 };
    const [h1] = hoteisDoDia(
      hoteis.slice(0, 1),
      [
        linha({ id: 'p-ruim', escopo: 'hotel', hotelId: 'h1', valor: { janelaDias: 'x' } }),
        linha({ id: 'p-grupo' }),
        linha({ id: 'p-atencao', chave: 'inteligencia.atencao_ativo', valor: atencao }),
      ],
      registro,
    );
    expect(h1?.atencao).toEqual(atencao);
    expect(h1?.versaoPolitica).toBe(
      'inteligencia.reincidencia=p-grupo@2026-09-01T10:00:00.000Z;' +
        'inteligencia.atencao_ativo=p-atencao@2026-09-01T10:00:00.000Z',
    );
  });
});

describe('politicaSistemicaDoGrupo', () => {
  it('só a linha do grupo vale; sem ela, o padrão', () => {
    const ligado = {
      ...PADRAO_SISTEMICO,
      mesmoAndar: { ...PADRAO_SISTEMICO.mesmoAndar, ativa: true },
    };
    const linhaDoHotel: LinhaDePolitica = {
      id: 'p1',
      chave: 'inteligencia.sistemico',
      escopo: 'hotel',
      hotelId: 'h1',
      bandeiraId: null,
      valor: ligado,
      atualizadoEm: agora,
    };
    expect(politicaSistemicaDoGrupo([linhaDoHotel], registro)).toEqual(PADRAO_SISTEMICO);
    expect(
      politicaSistemicaDoGrupo([{ ...linhaDoHotel, escopo: 'grupo', hotelId: null }], registro),
    ).toEqual(ligado);
  });
});

describe('o primeiro chamado de cada hotel (sistêmico v4, crescimento)', () => {
  it('o mais antigo de cada hotel entre os lidos, com o cancelado', () => {
    const r = primeiroChamadoPorHotel([
      chamado({ id: 'c1', hotelId: 'h1', abertaEm: dia(-10) }),
      chamado({ id: 'c2', hotelId: 'h1', abertaEm: dia(-90), estado: 'cancelado' }),
      chamado({ id: 'c3', hotelId: 'h2', abertaEm: dia(-5) }),
      chamado({ id: 'c4', hotelId: 'h2', abertaEm: dia(-30) }),
    ]);
    expect(r).toEqual(
      new Map([
        ['h1', dia(-90)],
        ['h2', dia(-30)],
      ]),
    );
  });
});
