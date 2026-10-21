// O CSV do painel de indicadores (1c, item 9): o cabeçalho e uma linha por
// hotel, com o total do escopo no fim, nos quatro idiomas e no pseudo-idioma;
// o hotel que o proprietário só vê pelos cartões leva só as colunas dos
// cartões; e o botão no painel. Renderizado no servidor, sem rede.
import { IDIOMAS, type IdiomaDeExibicao, PSEUDO_IDIOMA, mensagensDe } from '@hubkeep/i18n';
import type { ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import PainelDosIndicadores from '../src/app/(painel)/indicadores/page';
import { BOM, arquivoCsv } from '../src/cliente/csv';
import { COLUNAS_DO_CSV, tabelaDosIndicadores } from '../src/cliente/exportar-indicadores';
import type { IndicadoresNaTela, PainelDeIndicadores } from '../src/cliente/indicadores';
import { ProvedorDeIdioma, useT } from '../src/i18n/cliente';

const B = '0193a000-0000-4000-8000-0000000000b1';

const indicadores = (extra: Partial<IndicadoresNaTela> = {}): IndicadoresNaTela => ({
  backlog: 12,
  backlogPorIdade: { ate_2: 5, de_3_a_7: 4, de_8_a_15: 2, de_16_a_30: 1, mais_de_30: 0 },
  backlogPor100Uhs: 6,
  percentualDeSla: 92.5,
  sla: {
    total: 40,
    dentroDoPrazo: 37,
    aindaNoPrazo: 3,
    pausadoSegundos: 0,
    pausadoMedioSegundos: null,
  },
  mttrHoras: 30.25,
  medianaHoras: 20,
  corretivasConcluidas: 40,
  percentualDePreventivaEmDia: 80,
  preventiva: { total: 10, emDia: 8, atrasadas: 2, aindaNoPrazo: 1 },
  preventivasConcluidas: 20,
  preventivasPorCorretiva: 0.5,
  percentualDePreventivas: 33.3,
  abertos: 50,
  chamadosPor100Uhs: null,
  uhDias: 3.5,
  uhsAtivas: 1200,
  hoteis: 2,
  ...extra,
});

const PAINEL: PainelDeIndicadores = {
  periodo: { inicio: '2026-09-21', fim: '2026-10-20' },
  rede: indicadores({ backlog: 15 }),
  metaDeSla: 90,
  hoteis: [
    {
      id: '0193a000-0000-4000-8000-000000000001',
      nome: '=Hotel Centro',
      bandeiraId: B,
      visao: 'completa',
      indicadores: indicadores(),
      metaDeSla: 90,
    },
    {
      id: '0193a000-0000-4000-8000-000000000003',
      nome: 'Hotel do Dono',
      bandeiraId: null,
      visao: 'cartoes',
      cartoes: {
        backlog: 3,
        backlogPorIdade: { ate_2: 3, de_3_a_7: 0, de_8_a_15: 0, de_16_a_30: 0, mais_de_30: 0 },
        uhDias: 1.5,
        abertos: 4,
        chamadosPor100Uhs: 2,
      },
    },
  ],
  bandeiras: [{ id: B, nome: 'Bandeira Sul', indicadores: indicadores() }],
  serie: [],
  produtividade: [],
  ondeMaisQuebra: { categorias: [], outras: 0 },
};

const decimalComVirgula = (n: number) =>
  new Intl.NumberFormat('pt-BR', { useGrouping: false, maximumFractionDigits: 2 }).format(n);

function Csv({ painel = PAINEL }: { painel?: PainelDeIndicadores }) {
  const t = useT();
  return <pre>{arquivoCsv(tabelaDosIndicadores(painel, t, decimalComVirgula), ';')}</pre>;
}

const renderizar = (idioma: IdiomaDeExibicao, tela: ReactNode) =>
  renderToString(
    <ProvedorDeIdioma idioma={idioma} mensagens={mensagensDe(idioma)} pseudoLiberado>
      {tela}
    </ProvedorDeIdioma>,
  );

const linhas = (html: string) =>
  html
    .replace(/^.*<pre>/s, '')
    .replace(/<\/pre>.*$/s, '')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .split('\r\n')
    .filter(Boolean);

describe('o CSV do painel de indicadores', () => {
  it.each<IdiomaDeExibicao>([...IDIOMAS, PSEUDO_IDIOMA])('%s: sem chave crua', (idioma) => {
    const html = renderizar(idioma, <Csv />);
    expect(html).not.toMatch(/indicadores\.[a-z_.]+/);
    expect(html).toContain(BOM);
    // O cabeçalho, os dois hotéis e o total, todos com as mesmas colunas.
    const l = linhas(html);
    expect(l).toHaveLength(4);
    for (const linha of l) expect(linha.split(';')).toHaveLength(COLUNAS_DO_CSV.length);
  });

  it('pt-BR: o cabeçalho, os números sem milhar e com a vírgula, e o nome protegido', () => {
    const [cabecalho, centro, dono, total] = linhas(renderizar('pt-BR', <Csv />));
    expect(cabecalho).toBe(
      `${BOM}Hotel;Bandeira;` +
        'UHs ativas;Backlog;% de SLA;Chamados na conta do SLA;MTTR (horas);' +
        'Mediana do reparo (horas);% de preventiva em dia;Preventivas na conta;' +
        'Preventivas por corretiva;UH-dias perdidos;Chamados abertos;Chamados por 100 UHs',
    );
    // O nome que começa com = ganha o apóstrofo; o dado que falta fica vazio.
    expect(centro).toBe("'=Hotel Centro;Bandeira Sul;1200;12;92,5;40;30,25;20;80;10;0,5;3,5;50;");
    // O hotel do proprietário: só as colunas dos cartões.
    expect(dono).toBe('Hotel do Dono;;;3;;;;;;;;1,5;4;2');
    expect(total).toBe('Total do seu escopo;;1200;15;92,5;40;30,25;20;80;10;0,5;3,5;50;');
  });

  it('o proprietário, sem a visão da rede, não tem a linha do total', () => {
    const painel: PainelDeIndicadores = {
      ...PAINEL,
      rede: null,
      hoteis: PAINEL.hoteis.filter((h) => h.visao === 'cartoes'),
      bandeiras: [],
    };
    expect(linhas(renderizar('pt-BR', <Csv painel={painel} />))).toHaveLength(2);
  });

  it('o painel tem o botão de exportar', () => {
    expect(renderizar('pt-BR', <PainelDosIndicadores />)).toContain('Exportar CSV');
  });
});
