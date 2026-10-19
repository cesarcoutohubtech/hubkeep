// Telas do HubKeep Intelligence (proposta das telas do 1.0): a tabela da
// lista, a página do insight (sistêmico e atenção) e o detalhe do ativo,
// renderizadas no servidor (react-dom/server), sem rede, nos quatro idiomas e
// no pseudo-idioma. Nenhuma chave fica sem tradução (a chave crua apareceria
// no HTML), e a decisão só aparece para quem decide.
import { IDIOMAS, type IdiomaDeExibicao, PSEUDO_IDIOMA, mensagensDe } from '@hubkeep/i18n';
import type { ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type {
  Efetividades,
  Insight,
  Nomes,
  Reclamacoes,
} from '../src/app/(painel)/inteligencia/comum';
import { type Abertura, ConteudoDaAbertura } from '../src/app/(painel)/inteligencia/abertura/tela';
import { ConteudoDoAtivo } from '../src/app/(painel)/inteligencia/ativos/[id]/tela';
import { ConteudoDoInsight } from '../src/app/(painel)/inteligencia/insights/[id]/tela';
import {
  AtivosEncontrados,
  SecaoDaEfetividade,
  TabelaDeInsights,
  caminhoDaLista,
} from '../src/app/(painel)/inteligencia/insights/tela';
import { ProvedorDeIdioma } from '../src/i18n/cliente';

const H1 = '11111111-1111-4111-8111-111111111111';
const H2 = '11111111-1111-4111-8111-111111111112';
const B = '22222222-2222-4222-8222-222222222222';
const A = '33333333-3333-4333-8333-333333333333';
const U = '44444444-4444-4444-8444-444444444444';
const C1 = '55555555-5555-4555-8555-555555555551';
const I1 = '66666666-6666-4666-8666-666666666661';
const I2 = '66666666-6666-4666-8666-666666666662';

const nomes: Nomes = {
  hoteis: { [H1]: 'Hotel Batel', [H2]: 'Hotel Centro' },
  bandeiras: { [B]: 'Aurora' },
  pessoas: { [U]: 'Marina' },
  ativos: { [A]: 'Elevador social 2' },
};

const base: Insight = {
  id: I1,
  hotelId: H1,
  bandeiraId: B,
  hotelIds: [H1],
  tipo: 'atencao_ativo',
  escopo: { ativoId: A, hotelId: H1 },
  estado: 'novo',
  faixa: 'alta_atencao',
  valor: 78,
  versaoScore: 2,
  anteriorId: null,
  primeiraDeteccaoEm: '2026-10-01T03:00:00.000Z',
  ultimaDeteccaoEm: '2026-10-10T03:00:00.000Z',
  responsavelId: null,
  encerradoEm: null,
  encerradoPor: null,
  nota: null,
  motivoDeDescarte: null,
  versao: 1,
  substitui: null,
  substituidoPor: null,
  podeDecidir: true,
};

const componente = (chave: string, peso: number, valor: number | null, evidencia = {}) => ({
  chave,
  peso,
  pesoEfetivo: valor === null ? 0 : peso,
  valor,
  pontos: valor === null ? 0 : valor * peso * 100,
  evidencia,
});

const score = {
  chave: 'atencao_ativo',
  versao: 2,
  valor: 78,
  faixa: 'alta_atencao',
  componentes: [
    componente('criticidade', 0.15, 1, { nivel: 5, maximo: 5 }),
    componente('parada', 0.15, 0.8, { horas: 38.5 }),
    componente('impacto_hospede', 0.15, 0.6, { score: 60 }),
    componente('custo', 0.1, null, {}),
    componente('uh_dias', 0, null, {}),
  ],
  ausentes: ['custo', 'uh_dias'],
  configuracao: { limiteInsight: 70 },
};

const serie = Array.from({ length: 12 }, (_, i) => ({
  inicio: new Date(Date.UTC(2026, 6, 20 + i * 7)).toISOString(),
  quantidade: i % 3,
}));

const nada = async () => undefined;

const C2 = '55555555-5555-4555-8555-555555555552';
const K = '77777777-7777-4777-8777-777777777777';
const efetividade: Efetividades = {
  intervencoes: [
    {
      intervencao: {
        chamadoId: C2,
        hotelId: H1,
        bandeiraId: B,
        ativoId: A,
        em: '2026-09-05T15:00:00.000Z',
        codigoSolucaoId: K,
        executadoPor: 'fornecedor',
        fornecedorId: null,
        fornecedorNome: 'Elevadores Sul',
        custoInformado: 48000,
        descricao: 'Modernização do elevador',
      },
      efetividade: {
        versao: 4,
        resultado: 'janela_incompleta',
        diasDecorridos: 35,
        metricas: [
          { chave: 'chamados', antes: 9, depois: 1, variacaoPercentual: -88.9 },
          { chave: 'reaberturas', antes: 2, depois: 0, variacaoPercentual: -100 },
          { chave: 'horas_paradas', antes: 96.5, depois: 4, variacaoPercentual: -95.9 },
        ],
        custo: {
          antes: { soma: 7200, informadas: 3, aceitas: 9 },
          depois: { soma: 300, informadas: 1, aceitas: 1 },
          suficiente: false,
          variacaoPercentual: null,
        },
        configuracao: {
          janelaDias: 90,
          reducaoObservadaPercentual: 60,
          reducaoParcialPercentual: 25,
          aumentoObservadoPercentual: 20,
          minChamadosAntes: 3,
        },
      },
    },
  ],
  nomes: {
    hoteis: { [H1]: 'Hotel Batel' },
    bandeiras: {},
    pessoas: {},
    ativos: { [A]: 'Elevador social 2' },
  },
};
const semEfetividade: Efetividades = {
  intervencoes: [],
  nomes: { hoteis: {}, bandeiras: {}, pessoas: {}, ativos: {} },
};

type PaginaDoInsight = Parameters<typeof ConteudoDoInsight>[0]['pagina'];
type PaginaDoAtivo = Parameters<typeof ConteudoDoAtivo>[0]['pagina'];
const IDIOMAS_DO_TESTE: IdiomaDeExibicao[] = [...IDIOMAS, PSEUDO_IDIOMA];

const renderizar = (idioma: IdiomaDeExibicao, tela: ReactNode) =>
  renderToString(
    <ProvedorDeIdioma idioma={idioma} mensagens={mensagensDe(idioma)} pseudoLiberado>
      {tela}
    </ProvedorDeIdioma>,
  );

const insightDeAtencao = (extra: Partial<Insight> = {}): PaginaDoInsight => ({
  insight: {
    ...base,
    ...extra,
    detalhe: score,
    evidencia: {},
    acoes: (extra.podeDecidir ?? true) ? ['revisar', 'aceitar', 'descartar'] : [],
  },
  chamados: [],
  reclamacoes: null,
  serie,
  nomes,
  efetividade,
});

const sistemico: PaginaDoInsight = {
  insight: {
    ...base,
    id: I2,
    hotelId: null,
    hotelIds: [H1, H2],
    tipo: 'sistemico',
    escopo: { regra: 'mesmo_modelo', modelo: 'acme x1' },
    faixa: 'atencao',
    valor: null,
    podeDecidir: false,
    detalhe: {
      regra: 'mesmo_modelo',
      situacao: 'possivel',
      versao: 2,
      chave: {},
      evidencia: {
        quantidade: 9,
        distintos: 4,
        janelaDias: 90,
        hotelIds: [H1, H2],
        corretivaIds: [C1],
        taxaPorAtivo: 2.25,
        basePorAtivo: 0.5,
      },
    },
    evidencia: { corretivaIds: [C1] },
    acoes: [],
  },
  chamados: [
    {
      id: C1,
      hotelId: H1,
      ativoId: A,
      abertoEm: '2026-10-05T10:00:00.000Z',
      estado: 'aberto',
      descricao: 'Porta não fecha',
    },
  ],
  reclamacoes: null,
  serie,
  nomes,
  efetividade: semEfetividade,
};

const S = '88888888-8888-4888-8888-888888888881';
const UH = '88888888-8888-4888-8888-888888888882';
/** Uma reclamação de hóspede ligada ao ativo, como a API a devolve. */
const reclamacao = (
  extra: Partial<Reclamacoes['sinais'][number]> = {},
): Reclamacoes['sinais'][number] => ({
  id: S,
  hotelId: H1,
  fonte: 'google',
  idExterno: 'r-1',
  ocorridoEm: '2026-10-08T12:00:00.000Z',
  nota: 2,
  escala: 5,
  texto: 'O elevador parou com hóspedes dentro',
  textoApagadoEm: null,
  idioma: 'pt-BR',
  uhCitada: '1204',
  manutencao: true,
  categoriaId: null,
  uhId: UH,
  ativoId: A,
  ligacao: 'confirmada',
  classificadoEm: '2026-10-09T10:00:00.000Z',
  classificadoPor: null,
  importadoEm: '2026-10-09T09:00:00.000Z',
  versao: 2,
  ...extra,
});

const nomesDasReclamacoes = {
  ativos: { [A]: 'Elevador social 2' },
  pessoas: {},
  uhs: { [UH]: 'UH 1204' },
};

const dasReclamacoes: PaginaDoInsight = {
  ...sistemico,
  insight: {
    ...sistemico.insight,
    hotelId: H1,
    hotelIds: [H1],
    escopo: { regra: 'reclamacoes_categoria', categoriaId: K },
    detalhe: {
      regra: 'reclamacoes_categoria',
      situacao: 'possivel',
      versao: 5,
      chave: {},
      evidencia: {
        quantidade: 3,
        distintos: 2,
        janelaDias: 14,
        hotelIds: [H1],
        corretivaIds: [],
        sinalIds: [S],
      },
    },
    evidencia: { sinalIds: [S], corretivaIds: [] },
  },
  chamados: [],
  reclamacoes: {
    sinais: [reclamacao()],
    total: 3,
    limitada: false,
    janelaDias: null,
    nomes: nomesDasReclamacoes,
  },
};

const ativo: PaginaDoAtivo = {
  ativo: {
    id: A,
    nome: 'Elevador social 2',
    hotelId: H1,
    bandeiraId: B,
    criticidade: 5,
    desativadoEm: null,
  },
  serie: [
    { dia: '2026-10-08', atencao: 60, faixa: 'atencao' },
    { dia: '2026-10-09', atencao: null, faixa: 'dados_insuficientes' },
    { dia: '2026-10-10', atencao: 78, faixa: 'alta_atencao' },
  ],
  atual: {
    dia: '2026-10-10',
    calculo: 1,
    recalculo: false,
    calculadoEm: '2026-10-10T03:00:00.000Z',
    atencao: 78,
    faixa: 'alta_atencao',
    reincidencia: 40,
    versaoFormulaAtencao: 2,
    versaoFormulaReincidencia: 1,
    versaoPolitica: 'padrao',
    detalheAtencao: score,
    detalheReincidencia: {},
  },
  insights: [base],
  nomes,
  efetividade,
  substituicao: {
    versao: 1,
    sinal: 'avaliar_substituicao',
    atingidos: 4,
    avaliados: 6,
    garantiaVigente: false,
    criterios: [
      { chave: 'corretivas12m', valor: 7, limite: 6, atingido: true },
      { chave: 'horasParadas12m', valor: 49, limite: 40, atingido: true },
      { chave: 'idadeAnos', valor: 12, limite: 10, atingido: true },
      { chave: 'custoSobreReposicao', valor: null, limite: 0.5, atingido: null },
      { chave: 'impactoHospede', valor: 0, limite: 70, atingido: false },
      { chave: 'criticidade', valor: 0.8, limite: 0.75, atingido: true },
      { chave: 'reincidencia', valor: null, limite: 70, atingido: null },
    ],
    calculadoEm: '2026-10-10T15:00:00.000Z',
  },
  reclamacoes: {
    sinais: [],
    total: null,
    limitada: false,
    janelaDias: 90,
    nomes: nomesDasReclamacoes,
  },
};

/** A atenção 7 pelas reclamações: o score e os componentes gravados na evidência. */
const scorePelasReclamacoes = {
  ...score,
  componentes: score.componentes.map((c) =>
    c.chave === 'impacto_hospede'
      ? componente('impacto_hospede', 0.15, 0.62, {
          score: 62,
          fonte: 'reclamacoes',
          versaoImpacto: 1,
          confirmadas: 3,
          possiveis: 1,
          janelaDias: 90,
          uhs: 2,
          depoisDoReparo: null,
          notaMediaEm5: 2,
          percentualDosChamados: 40,
          valorVolume: 0.6,
          pesoVolume: 0.3,
          pontosVolume: 22.5,
          valorSeveridade: 0.6,
          pesoSeveridade: 0.25,
          pontosSeveridade: 18.8,
          valorRecorrencia: null,
          pesoRecorrencia: 0.2,
          pontosRecorrencia: 0,
          valorAmplitude: 0.67,
          pesoAmplitude: 0.15,
          pontosAmplitude: 12.5,
          valorOperacional: 0.4,
          pesoOperacional: 0.1,
          pontosOperacional: 5,
        })
      : c,
  ),
};

const ativoComReclamacoes: PaginaDoAtivo = {
  ...ativo,
  atual: {
    ...(ativo.atual as NonNullable<PaginaDoAtivo['atual']>),
    detalheAtencao: scorePelasReclamacoes,
  },
  reclamacoes: {
    ...ativo.reclamacoes,
    sinais: [
      reclamacao(),
      reclamacao({
        id: '88888888-8888-4888-8888-888888888883',
        ligacao: 'possivel',
        texto: null,
        textoApagadoEm: '2026-10-09T03:00:00.000Z',
        uhId: null,
      }),
    ],
  },
};

const encontrados = {
  ativos: [{ id: A, nome: 'Lava-roupa industrial', hotelId: H1, bandeiraId: B }],
  nomes,
};

const fechada: Abertura = {
  config: { aPartirDe: null, diasAposAtivacao: 60, papeis: ['admin_grupo', 'gestor_csc'] },
  abertura: {
    em: '2026-12-09T03:00:00.000Z',
    dia: '2026-12-09',
    origem: 'ativacao',
    primeiraAtivacao: '2026-10-10T03:00:00.000Z',
  },
  abertas: false,
};

describe('telas do Intelligence em todos os idiomas, sem chave crua', () => {
  it.each(IDIOMAS_DO_TESTE)('%s', (idioma) => {
    const html = [
      renderizar(idioma, <TabelaDeInsights lista={{ insights: [base], nomes }} />),
      renderizar(idioma, <ConteudoDoInsight pagina={insightDeAtencao()} aoDecidir={nada} />),
      renderizar(idioma, <ConteudoDoInsight pagina={sistemico} aoDecidir={nada} />),
      renderizar(idioma, <ConteudoDoAtivo pagina={ativo} />),
      renderizar(idioma, <ConteudoDoInsight pagina={dasReclamacoes} aoDecidir={nada} />),
      renderizar(idioma, <ConteudoDoAtivo pagina={ativoComReclamacoes} />),
      renderizar(idioma, <ConteudoDaAbertura abertura={fechada} aoGravar={nada} />),
      renderizar(idioma, <SecaoDaEfetividade efetividade={efetividade} />),
      renderizar(idioma, <SecaoDaEfetividade efetividade={semEfetividade} />),
      renderizar(idioma, <AtivosEncontrados encontrados={encontrados} termo="lava" />),
      renderizar(idioma, <AtivosEncontrados encontrados={{ ativos: [], nomes }} termo="lava" />),
    ].join('');
    expect(html).not.toMatch(/inteligencia\.[a-z_]+\.[a-z_]/);
    expect(html).toContain('Elevador social 2');
  });
});

describe('a lista', () => {
  it('o título do insight de atenção é o ativo; o escopo, o hotel; sem responsável', () => {
    const html = renderizar('pt-BR', <TabelaDeInsights lista={{ insights: [base], nomes }} />);
    expect(html).toContain(`href="/inteligencia/insights/${I1}"`);
    expect(html).toContain('Hotel Batel');
    expect(html).toContain('Sem responsável');
    expect(html).toContain('Alta atenção');
  });

  it('o insight de rede: o escopo pela bandeira e o score em traço', () => {
    const html = renderizar(
      'pt-BR',
      <TabelaDeInsights lista={{ insights: [{ ...sistemico.insight }], nomes }} />,
    );
    expect(html).toContain('2 hotéis da bandeira Aurora');
    expect(html).toContain('Mesmo modelo com muitos chamados');
    expect(html).toContain('—');
  });

  it('o filtro vira query, sem os campos vazios', () => {
    expect(caminhoDaLista({ estado: 'abertos', tipo: '', faixa: 'critico', hotelId: '' })).toBe(
      '/api/v1/inteligencia/insights?estado=abertos&faixa=critico',
    );
  });
});

describe('a página do insight', () => {
  it('atenção: o que pesou, o aviso, o link do ativo e as ações para quem decide', () => {
    const html = renderizar(
      'pt-BR',
      <ConteudoDoInsight pagina={insightDeAtencao()} aoDecidir={nada} />,
    );
    expect(html).toContain('Criticidade 5 de 5');
    expect(html).toContain('O score mostra o que pesou, e não a causa.');
    expect(html).toContain(`href="/inteligencia/ativos/${A}"`);
    expect(html).toContain('Revisar');
    expect(html).toContain('o Admin do grupo, o Gestor CSC e o Gerente que cobrem o Hotel Batel.');
    expect(html).toContain('role="img"');
  });

  it('quem não decide não vê os botões', () => {
    const html = renderizar(
      'pt-BR',
      <ConteudoDoInsight pagina={insightDeAtencao({ podeDecidir: false })} aoDecidir={nada} />,
    );
    expect(html).toContain('Você não decide este insight.');
    expect(html).not.toContain('>Revisar<');
  });

  it('sistêmico: a regra, a evidência, o aviso do sinal e os chamados', () => {
    const html = renderizar('pt-BR', <ConteudoDoInsight pagina={sistemico} aoDecidir={nada} />);
    expect(html).toContain('9 chamados em 4 ativos do mesmo modelo');
    expect(html).toContain('É um sinal, e não uma conclusão');
    expect(html).toContain(`href="/chamados/${C1}"`);
    expect(html).toContain('Porta não fecha');
    expect(html).toContain('insight de rede: só o Admin do grupo e o Gestor CSC');
  });
});

describe('as reclamações de hóspede (C2 do ADR-047)', () => {
  it('o insight das reclamações: a evidência no lugar dos chamados, com o texto e o link da fila', () => {
    const html = renderizar(
      'pt-BR',
      <ConteudoDoInsight pagina={dasReclamacoes} aoDecidir={nada} />,
    );
    expect(html).toContain('Reclamações da evidência');
    expect(html).toContain('As 3 reclamações de hóspede que abriram este insight');
    expect(html).toContain('O elevador parou com hóspedes dentro');
    expect(html).toContain('UH 1204');
    expect(html).toContain('Ligação confirmada');
    expect(html).toContain('href="/inteligencia/sinais"');
    expect(html).not.toContain('Chamados por semana');
    expect(html).not.toContain('Pesa no score');
  });

  it('quem não lê as reclamações do hotel vê só o total', () => {
    const html = renderizar(
      'pt-BR',
      <ConteudoDoInsight
        pagina={{
          ...dasReclamacoes,
          reclamacoes: { ...(dasReclamacoes.reclamacoes as Reclamacoes), sinais: [] },
        }}
        aoDecidir={nada}
      />,
    );
    expect(html).toContain('3 reclamações na evidência. Você não lê as reclamações deste hotel.');
    expect(html).not.toContain('O elevador parou');
  });

  it('o ativo: o score de 100, os componentes gravados e as reclamações que pesam e as que não', () => {
    const html = renderizar('pt-BR', <ConteudoDoAtivo pagina={ativoComReclamacoes} />);
    expect(html).toContain('Pelas reclamações de hóspede.');
    expect(html).toContain('Guest Impact Score: 62 de 100');
    expect(html).toContain('Recorrência depois do reparo');
    expect(html).toContain('Sem dado');
    expect(html).toContain('Reclamações ligadas ao ativo nos últimos 90 dias');
    expect(html).toContain('Pesa no score');
    expect(html).toContain('Não pesa');
    expect(html).toContain('Texto apagado em');
  });

  it('o ativo pelos chamados: a porcentagem, sem componentes, e a lista vazia', () => {
    const html = renderizar('pt-BR', <ConteudoDoAtivo pagina={ativo} />);
    expect(html).toContain('Dos chamados na janela do score.');
    expect(html).not.toContain('Componentes do Guest Impact Score');
    expect(html).toContain(
      'Nenhuma reclamação de hóspede ligada a este ativo nos últimos 90 dias.',
    );
  });
});

describe('o detalhe do ativo', () => {
  it('os indicadores, a composição sem a linha dos UH-dias, o gravado e os insights', () => {
    const html = renderizar('pt-BR', <ConteudoDoAtivo pagina={ativo} />);
    expect(html).toContain('O insight abre a partir de 70.');
    expect(html).toContain('Como o score foi composto');
    expect(html).toContain('Ainda sem dado: UH-dias (peso 0).');
    expect(html).not.toContain('UH-dias indisponíveis');
    expect(html).toContain('Original, do job diário');
    expect(html).toContain('Atenção ao ativo, versão 2');
    expect(html).toContain('1 de 3 dias no limite de 70 ou acima');
    expect(html).toContain(`href="/inteligencia/insights/${I1}"`);
  });

  it('o sinal de substituição: o estado, os critérios com valor e limite, a reposição numa linha discreta e a ressalva', () => {
    const html = renderizar('pt-BR', <ConteudoDoAtivo pagina={ativo} />);
    expect(html).toContain('Sinal de substituição');
    expect(html).toContain('Avaliar substituição');
    expect(html).toContain('4 critérios atingidos de 6 avaliados.');
    expect(html).toContain('Corretivas em 12 meses');
    expect(html).toContain('a partir de 6');
    expect(html).toContain('12 anos');
    expect(html).toContain('49 h');
    // A criticidade em nível: 4 de 5, e o limite é o primeiro nível que atinge.
    expect(html).toContain('4 de 5');
    expect(html).toContain('a partir de 4 de 5');
    expect(html).toContain('Sem dado');
    // O custo sobre a reposição não tem linha na tabela: só a frase discreta.
    expect(html).not.toContain('Custo de 12 meses sobre o valor de reposição</th>');
    expect(html).toContain('Ainda sem dado: o custo de 12 meses sobre o valor de reposição');
    expect(html).toContain('É um sinal para análise, não uma recomendação.');
    expect(html).toContain('com a versão 1 da regra');
    expect(html).not.toContain('revise com o fornecedor');
  });

  it('na garantia, a revisão necessária pede o fornecedor; sem sinal (ativo baixado), a seção não aparece', () => {
    const naGarantia = renderizar(
      'pt-BR',
      <ConteudoDoAtivo
        pagina={{
          ...ativo,
          substituicao: {
            ...(ativo.substituicao as NonNullable<PaginaDoAtivo['substituicao']>),
            sinal: 'revisao_necessaria',
            garantiaVigente: true,
          },
        }}
      />,
    );
    expect(naGarantia).toContain('Revisão necessária');
    expect(naGarantia).toContain('O ativo está na garantia: revise com o fornecedor');
    const baixado = renderizar(
      'pt-BR',
      <ConteudoDoAtivo pagina={{ ...ativo, substituicao: null }} />,
    );
    expect(baixado).not.toContain('Sinal de substituição');
  });

  it('sem resultado gravado, a página diz que o job ainda não calculou', () => {
    const html = renderizar(
      'pt-BR',
      <ConteudoDoAtivo pagina={{ ...ativo, atual: null, serie: [] }} />,
    );
    expect(html).toContain('Ainda não há resultado gravado para Elevador social 2');
  });
});

describe('a efetividade das intervenções (adendo ao ADR-033)', () => {
  it('a seção da lista: o chamado, quem executou, o custo da OS, antes e depois e a ressalva', () => {
    const html = renderizar('pt-BR', <SecaoDaEfetividade efetividade={efetividade} />);
    expect(html).toContain('Efetividade das intervenções');
    expect(html).toContain('Modernização do elevador');
    expect(html).toContain('Executada pelo fornecedor Elevadores Sul');
    expect(html).toContain('Custo da OS:');
    expect(html).toContain(`href="/inteligencia/ativos/${A}"`);
    expect(html).toContain('janela em curso');
    expect(html).toContain('96,5 → 4');
    expect(html).toContain('Janela incompleta');
    expect(html).toContain('Passaram 35 de 90 dias depois da intervenção.');
    expect(html).toContain('não prova que a intervenção foi a causa');
  });

  it('o custo abaixo de 50% em um dos lados: dados insuficientes, com a cobertura', () => {
    const html = renderizar('pt-BR', <SecaoDaEfetividade efetividade={efetividade} />);
    expect(html).toContain('Dados insuficientes');
    expect(html).toContain('Custo informado em 3 de 9 OS antes e em 1 de 1 OS depois.');
  });

  it('o custo suficiente: as duas somas', () => {
    const [linha] = efetividade.intervencoes;
    if (!linha) throw new Error('sem linha');
    const suficiente: Efetividades = {
      ...efetividade,
      intervencoes: [
        {
          ...linha,
          efetividade: {
            ...linha.efetividade,
            custo: { ...linha.efetividade.custo, suficiente: true, variacaoPercentual: -95.8 },
          },
        },
      ],
    };
    const html = renderizar('pt-BR', <SecaoDaEfetividade efetividade={suficiente} />);
    expect(html).not.toContain('Dados insuficientes');
    expect(html).toMatch(/R\$\s?7\.200,00 → R\$\s?300,00/);
  });

  it('sem intervenção: a seção da lista e a do ativo dizem que não há; a do insight não aparece', () => {
    expect(renderizar('pt-BR', <SecaoDaEfetividade efetividade={semEfetividade} />)).toContain(
      'Nenhuma intervenção concluída nos últimos 180 dias',
    );
    expect(
      renderizar('pt-BR', <ConteudoDoAtivo pagina={{ ...ativo, efetividade: semEfetividade }} />),
    ).toContain('Nenhuma intervenção concluída neste ativo nos últimos 180 dias.');
    const html = renderizar('pt-BR', <ConteudoDoInsight pagina={sistemico} aoDecidir={nada} />);
    expect(html).not.toContain('Efetividade da intervenção');
  });

  it('no ativo e no insight, a mesma tabela', () => {
    expect(renderizar('pt-BR', <ConteudoDoAtivo pagina={ativo} />)).toContain(
      'Intervenções neste ativo',
    );
    const html = renderizar(
      'pt-BR',
      <ConteudoDoInsight pagina={insightDeAtencao()} aoDecidir={nada} />,
    );
    expect(html).toContain('Efetividade da intervenção');
    expect(html).toContain('Intervenções concluídas depois da primeira detecção do insight, em');
  });
});

describe('procurar ativo', () => {
  it('cada ativo achado leva à página dele no Intelligence, com o hotel; sem nada, a frase da busca', () => {
    const html = renderizar('pt-BR', <AtivosEncontrados encontrados={encontrados} termo="lava" />);
    expect(html).toContain(`href="/inteligencia/ativos/${A}"`);
    expect(html).toContain('Lava-roupa industrial');
    expect(html).toContain('Hotel Batel');
    expect(
      renderizar('pt-BR', <AtivosEncontrados encontrados={{ ativos: [], nomes }} termo="lava" />),
    ).toContain('Nada encontrado para “lava”.');
  });
});

describe('a abertura das telas', () => {
  it('fechada: a data, de onde vem e os papéis marcados', () => {
    const html = renderizar('pt-BR', <ConteudoDaAbertura abertura={fechada} aoGravar={nada} />);
    expect(html).toContain('Telas ainda fechadas');
    expect(html).toContain('60 dias depois da primeira ativação do módulo');
    expect(html).toContain('Admin do grupo, Gestor CSC');
    expect(html.match(/type="checkbox"[^>]*checked/g)?.length).toBe(2);
  });

  it('pela data e sem contrato para contar', () => {
    const html = renderizar(
      'pt-BR',
      <ConteudoDaAbertura
        abertura={{
          ...fechada,
          config: { ...fechada.config, aPartirDe: '2026-11-01' },
          abertura: null,
        }}
        aoGravar={nada}
      />,
    );
    expect(html).toContain('Sem data');
    expect(html).toContain('value="2026-11-01"');
  });
});
