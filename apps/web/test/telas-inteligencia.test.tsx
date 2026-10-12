// Telas do HubKeep Intelligence (proposta das telas do 1.0): a tabela da
// lista, a página do insight (sistêmico e atenção) e o detalhe do ativo,
// renderizadas no servidor (react-dom/server), sem rede, nos quatro idiomas e
// no pseudo-idioma. Nenhuma chave fica sem tradução (a chave crua apareceria
// no HTML), e a decisão só aparece para quem decide.
import { IDIOMAS, type IdiomaDeExibicao, PSEUDO_IDIOMA, mensagensDe } from '@hubkeep/i18n';
import type { ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { Insight, Nomes } from '../src/app/(painel)/inteligencia/comum';
import { ConteudoDoAtivo } from '../src/app/(painel)/inteligencia/ativos/[id]/tela';
import { ConteudoDoInsight } from '../src/app/(painel)/inteligencia/insights/[id]/tela';
import { TabelaDeInsights, caminhoDaLista } from '../src/app/(painel)/inteligencia/insights/tela';
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
  serie,
  nomes,
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
  serie,
  nomes,
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
};

describe('telas do Intelligence em todos os idiomas, sem chave crua', () => {
  it.each(IDIOMAS_DO_TESTE)('%s', (idioma) => {
    const html = [
      renderizar(idioma, <TabelaDeInsights lista={{ insights: [base], nomes }} />),
      renderizar(idioma, <ConteudoDoInsight pagina={insightDeAtencao()} aoDecidir={nada} />),
      renderizar(idioma, <ConteudoDoInsight pagina={sistemico} aoDecidir={nada} />),
      renderizar(idioma, <ConteudoDoAtivo pagina={ativo} />),
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

  it('sem resultado gravado, a página diz que o job ainda não calculou', () => {
    const html = renderizar(
      'pt-BR',
      <ConteudoDoAtivo pagina={{ ...ativo, atual: null, serie: [] }} />,
    );
    expect(html).toContain('Ainda não há resultado gravado para Elevador social 2');
  });
});
