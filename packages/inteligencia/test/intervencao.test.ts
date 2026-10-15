// A intervenção da efetividade (adendo ao ADR-033 de 15/10/2026): a OS
// corretiva concluída com o código de solução na lista da política do hotel.
import { describe, expect, it } from 'vitest';
import {
  type ChamadoDaEfetividade,
  type LinhaDePolitica,
  type OsDaEfetividade,
  PADRAO_EFETIVIDADE,
  type TransicaoDaOs,
  codigosDoTenant,
  efetividadeDaIntervencao,
  efetividadeDoHotel,
  ehCodigoDeIntervencao,
  intervencoesDosChamados,
} from '../src';
import { agora, dia } from './apoio';

const TROCA = 'solucao_troca_do_equipamento';
const concluir = (d: number): TransicaoDaOs => ({
  acao: 'concluir',
  para: 'concluida',
  quando: dia(d),
});
const aceitar = (d: number): TransicaoDaOs => ({ acao: 'aceitar', para: 'aceita', quando: dia(d) });

const os = (extra: Partial<OsDaEfetividade> = {}): OsDaEfetividade => ({
  estado: 'aceita',
  criadaEm: dia(-30),
  codigoFalha: null,
  executadoPor: 'fornecedor',
  fornecedorId: 'f1',
  custoInformado: 48_000,
  codigoSolucaoId: 'k-troca',
  codigoSolucaoChave: TROCA,
  transicoes: [concluir(-20), aceitar(-19)],
  ...extra,
});

let seq = 0;
const chamado = (extra: Partial<ChamadoDaEfetividade> = {}): ChamadoDaEfetividade => {
  seq += 1;
  return {
    id: `c${String(seq).padStart(3, '0')}`,
    hotelId: 'h1',
    bandeiraId: 'b1',
    localId: 'l1',
    ativoId: 'a1',
    abertaEm: dia(-30),
    estado: 'concluido',
    impactoHospede: null,
    os: [os()],
    ...extra,
  };
};

const desde = dia(-180);
const padrao = () => PADRAO_EFETIVIDADE;

describe('quais OS são intervenção', () => {
  it('pela chave padrão ou pelo id do código; outro código, não', () => {
    expect(ehCodigoDeIntervencao(os(), [TROCA])).toBe(true);
    expect(ehCodigoDeIntervencao(os({ codigoSolucaoChave: null }), ['k-troca'])).toBe(true);
    expect(ehCodigoDeIntervencao(os({ codigoSolucaoChave: null }), [TROCA])).toBe(false);
    expect(
      ehCodigoDeIntervencao(os({ codigoSolucaoId: null, codigoSolucaoChave: null }), [TROCA]),
    ).toBe(false);
  });

  it('a conclusão final da OS é a data; da mais recente para a mais antiga', () => {
    const velha = chamado({ os: [os({ transicoes: [concluir(-100)] })] });
    const nova = chamado({
      ativoId: 'a2',
      os: [os({ transicoes: [concluir(-50), aceitar(-49)] })],
    });
    const lista = intervencoesDosChamados([velha, nova], padrao, desde, agora);
    expect(lista.map((i) => [i.chamadoId, i.ativoId, i.em])).toEqual([
      [nova.id, 'a2', dia(-50)],
      [velha.id, 'a1', dia(-100)],
    ]);
    expect(lista[0]).toMatchObject({
      hotelId: 'h1',
      bandeiraId: 'b1',
      codigoSolucaoId: 'k-troca',
      executadoPor: 'fornecedor',
      fornecedorId: 'f1',
      custoInformado: 48_000,
    });
  });

  it('fora: chamado cancelado, OS cancelada, sem ativo, reaberta sem nova conclusão, antes da janela, outro código', () => {
    const fora = [
      chamado({ estado: 'cancelado' }),
      chamado({ os: [os({ estado: 'cancelada' })] }),
      chamado({ ativoId: null }),
      chamado({
        os: [
          os({
            estado: 'em_execucao',
            transicoes: [concluir(-20), { acao: 'reabrir', para: 'em_execucao', quando: dia(-18) }],
          }),
        ],
      }),
      chamado({ os: [os({ transicoes: [concluir(-200)] })] }),
      chamado({
        os: [os({ codigoSolucaoId: 'k-peca', codigoSolucaoChave: 'solucao_troca_de_peca' })],
      }),
      chamado({ os: [os({ transicoes: [] })] }),
    ];
    expect(intervencoesDosChamados(fora, padrao, desde, agora)).toEqual([]);
  });

  it('reaberta e concluída de novo: vale a última conclusão', () => {
    const c = chamado({
      os: [
        os({
          transicoes: [
            concluir(-40),
            { acao: 'reabrir', para: 'em_execucao', quando: dia(-35) },
            concluir(-30),
          ],
        }),
      ],
    });
    expect(intervencoesDosChamados([c], padrao, desde, agora)[0]?.em).toEqual(dia(-30));
  });

  it('com a OS cancelada e a que a substituiu, vale a que não foi cancelada', () => {
    const c = chamado({
      os: [os({ estado: 'cancelada', criadaEm: dia(-40), transicoes: [] }), os()],
    });
    expect(intervencoesDosChamados([c], padrao, desde, agora)).toHaveLength(1);
  });

  it('cada chamado pela lista do próprio hotel', () => {
    const peca = os({ codigoSolucaoId: 'k-peca', codigoSolucaoChave: 'solucao_troca_de_peca' });
    const noH1 = chamado({ os: [peca] });
    const noH2 = chamado({ hotelId: 'h2', os: [peca] });
    const config = (c: ChamadoDaEfetividade) =>
      c.hotelId === 'h2'
        ? { ...PADRAO_EFETIVIDADE, codigosDeIntervencao: ['solucao_troca_de_peca'] }
        : PADRAO_EFETIVIDADE;
    expect(
      intervencoesDosChamados([noH1, noH2], config, desde, agora).map((i) => i.chamadoId),
    ).toEqual([noH2.id]);
  });
});

describe('a política da efetividade por hotel', () => {
  const linha = (
    escopo: LinhaDePolitica['escopo'],
    valor: unknown,
    extra: Partial<LinhaDePolitica> = {},
  ): LinhaDePolitica => ({
    id: `p-${escopo}`,
    chave: 'inteligencia.efetividade',
    escopo,
    hotelId: escopo === 'hotel' ? 'h1' : null,
    bandeiraId: escopo === 'bandeira' ? 'b1' : null,
    valor,
    atualizadoEm: dia(-1),
    ...extra,
  });
  const com = (codigos: string[]) => ({ ...PADRAO_EFETIVIDADE, codigosDeIntervencao: codigos });

  it('hotel, bandeira, grupo e padrão, nesta ordem; a linha fora do formato não resolve', () => {
    const linhas = [
      linha('grupo', com(['g'])),
      linha('bandeira', com(['b'])),
      linha('hotel', com(['h'])),
    ];
    expect(efetividadeDoHotel(linhas, { id: 'h1', bandeiraId: 'b1' }).codigosDeIntervencao).toEqual(
      ['h'],
    );
    expect(efetividadeDoHotel(linhas, { id: 'h9', bandeiraId: 'b1' }).codigosDeIntervencao).toEqual(
      ['b'],
    );
    expect(efetividadeDoHotel(linhas, { id: 'h9', bandeiraId: null }).codigosDeIntervencao).toEqual(
      ['g'],
    );
    expect(efetividadeDoHotel([], { id: 'h1', bandeiraId: 'b1' })).toBe(PADRAO_EFETIVIDADE);
    const ruim = [linha('hotel', { janelaDias: 'x' }), linha('grupo', com(['g']))];
    expect(efetividadeDoHotel(ruim, { id: 'h1', bandeiraId: null }).codigosDeIntervencao).toEqual([
      'g',
    ]);
  });

  it('os códigos do tenant: o padrão e os das linhas válidas, para o filtro da leitura', () => {
    const linhas = [
      linha('grupo', com(['solucao_troca_de_peca'])),
      linha('hotel', com(['k-1', TROCA])),
      linha('bandeira', { ruim: true }),
      linha('grupo', com(['outra-chave']), { chave: 'inteligencia.sistemico' }),
    ];
    expect(codigosDoTenant(linhas)).toEqual(['k-1', 'solucao_troca_de_peca', TROCA]);
  });
});

describe('o antes e depois da intervenção, pelo histórico do ativo', () => {
  it('só o ativo da intervenção, com o custo das aceitas e sem a OS da troca', () => {
    const troca = chamado({ abertaEm: dia(-25) });
    const [i] = intervencoesDosChamados([troca], padrao, desde, agora);
    if (!i) throw new Error('sem intervenção');
    const corretiva = (d: number, custo: number | null, ativoId = 'a1') =>
      chamado({
        ativoId,
        abertaEm: dia(d - 1),
        os: [
          os({
            custoInformado: custo,
            codigoSolucaoChave: null,
            transicoes: [concluir(d), aceitar(d)],
          }),
        ],
      });
    const e = efetividadeDaIntervencao(
      i,
      {
        chamados: [
          troca,
          corretiva(-60, 300),
          corretiva(-40, 500),
          corretiva(-10, 100),
          corretiva(-50, 9_999, 'a2'),
        ],
        paradas: [
          { ativoId: 'a1', inicio: dia(-30), fim: dia(-29) },
          { ativoId: 'a2', inicio: dia(-30), fim: dia(-20) },
        ],
      },
      PADRAO_EFETIVIDADE,
      agora,
    );
    expect(e.metricas.find((m) => m.chave === 'horas_paradas')).toMatchObject({
      antes: 24,
      depois: 0,
    });
    // A troca abriu antes da conclusão: conta como chamado antes, mas não no custo.
    expect(e.metricas[0]).toMatchObject({ chave: 'chamados', antes: 3, depois: 1 });
    expect(e.custo).toEqual({
      antes: { soma: 800, informadas: 2, aceitas: 2 },
      depois: { soma: 100, informadas: 1, aceitas: 1 },
      suficiente: true,
      variacaoPercentual: -87.5,
    });
    expect(e.resultado).toBe('janela_incompleta');
  });
});
