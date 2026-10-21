// O resumo da tela inicial (1c, seção 4 da paridade): os quatro indicadores do
// topo, cada um com a linha dos últimos 14 dias, e o fluxo de chamados para a
// gestão; os cartões do proprietário para ele. Nos quatro idiomas e no
// pseudo-idioma, renderizado no servidor (react-dom/server), sem rede.
import { IDIOMAS, type IdiomaDeExibicao, PSEUDO_IDIOMA, mensagensDe } from '@hubkeep/i18n';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { IndicadoresNaTela, PainelDeIndicadores } from '../src/cliente/indicadores';
import { OndeMaisQuebra } from '../src/cliente/onde-mais-quebra';
import { ResumoDoInicio, periodosDoResumo } from '../src/cliente/resumo-do-inicio';
import { ProvedorDeIdioma } from '../src/i18n/cliente';

const H1 = '0193a000-0000-4000-8000-000000000001';
const H3 = '0193a000-0000-4000-8000-000000000003';
const CAT = '0193a000-0000-4000-8000-0000000000c1';

const indicadores = (extra: Partial<IndicadoresNaTela> = {}): IndicadoresNaTela => ({
  backlog: 12,
  backlogPorIdade: { ate_2: 5, de_3_a_7: 4, de_8_a_15: 2, de_16_a_30: 1, mais_de_30: 0 },
  backlogPor100Uhs: 6,
  percentualDeSla: 92.5,
  sla: {
    total: 40,
    dentroDoPrazo: 37,
    aindaNoPrazo: 3,
    pausadoSegundos: 7200,
    pausadoMedioSegundos: 180,
  },
  mttrHoras: 30,
  medianaHoras: 20,
  corretivasConcluidas: 40,
  percentualDePreventivaEmDia: 80,
  preventiva: { total: 10, emDia: 8, atrasadas: 2, aindaNoPrazo: 1 },
  preventivasConcluidas: 20,
  preventivasPorCorretiva: 0.5,
  percentualDePreventivas: 33.3,
  abertos: 50,
  chamadosPor100Uhs: 25,
  uhDias: 3.5,
  uhsAtivas: 200,
  hoteis: 1,
  ...extra,
});

/**
 * 30 dias: o backlog sobe de 1 em 1, de 1 a 30; o % de SLA fica sem conta a
 * cada 7 dias; o tempo de reparo existe todo dia; a preventiva, nenhum dia.
 */
const SERIE: PainelDeIndicadores['serie'] = Array.from({ length: 30 }, (_, i) => ({
  dia: `2026-10-${String(i + 1).padStart(2, '0')}`,
  backlog: i + 1,
  abertos: 2,
  encerrados: 1,
  percentualDeSla: i % 7 === 0 ? null : 90,
  mttrHoras: 10 + i,
  percentualDePreventivaEmDia: null,
}));
const mini = (html: string, rotulo: string) =>
  html.match(
    new RegExp(`<svg class="hk-mini-linha"[^>]*aria-label="${rotulo}"[^>]*>(.*?)</svg>`),
  )?.[1];

const DA_GESTAO: PainelDeIndicadores = {
  periodo: { inicio: '2026-10-01', fim: '2026-10-30' },
  rede: indicadores(),
  metaDeSla: 90,
  hoteis: [
    {
      id: H1,
      nome: 'Hotel Centro',
      bandeiraId: null,
      visao: 'completa',
      indicadores: indicadores(),
      metaDeSla: 90,
    },
  ],
  bandeiras: [],
  serie: SERIE,
  produtividade: [],
  ondeMaisQuebra: {
    categorias: [
      { categoriaId: CAT, chamados: 5 },
      { categoriaId: null, chamados: 2 },
    ],
    outras: 3,
  },
};

const DO_PROPRIETARIO: PainelDeIndicadores = {
  ...DA_GESTAO,
  rede: null,
  hoteis: [
    {
      id: H3,
      nome: 'Hotel do Dono',
      bandeiraId: null,
      visao: 'cartoes',
      cartoes: {
        backlog: 3,
        backlogPorIdade: { ate_2: 3, de_3_a_7: 0, de_8_a_15: 0, de_16_a_30: 0, mais_de_30: 0 },
        uhDias: 1.5,
        abertos: 4,
        chamadosPor100Uhs: null,
      },
    },
  ],
  serie: [],
};

const renderizar = (idioma: IdiomaDeExibicao, atual: PainelDeIndicadores) =>
  renderToString(
    <ProvedorDeIdioma idioma={idioma} mensagens={mensagensDe(idioma)} pseudoLiberado>
      <ResumoDoInicio atual={atual} anterior={{ ...atual, rede: indicadores({ backlog: 10 }) }} />
    </ProvedorDeIdioma>,
  );
const pt = mensagensDe('pt-BR');

describe('resumo da tela inicial em cada idioma', () => {
  it.each<IdiomaDeExibicao>([...IDIOMAS, PSEUDO_IDIOMA])(
    '%s: a gestão e o proprietário, sem chave crua nem estilo inline',
    (idioma) => {
      for (const painel of [DA_GESTAO, DO_PROPRIETARIO]) {
        const html = renderizar(idioma, painel);
        expect(html).not.toMatch(/(inicio|indicadores)\.[a-z_.]+/);
        expect(html).not.toContain('style=');
      }
    },
  );
});

describe('resumo da tela inicial', () => {
  it('a gestão: os quatro indicadores, as linhas de 14 dias e só o fluxo', () => {
    const html = renderizar('pt-BR', DA_GESTAO);
    expect(html).toContain('Últimos 30 dias');
    expect(html.match(/class="hk-indicador"/g)).toHaveLength(4);
    expect(html).toContain(pt['indicadores.sla']);
    expect(html).not.toContain(pt['indicadores.uh_dias']);
    expect(html).toContain('aria-label="Backlog no fim de cada dia, nos últimos 14 dias"');
    // A linha curta tem os 14 últimos pontos (backlog de 17 a 30).
    const linha = html.match(/class="hk-mini-linha"[\s\S]*?points="([^"]+)"/);
    expect(linha?.[1]?.split(' ')).toHaveLength(14);
    expect(html).toContain(pt['indicadores.grafico.fluxo.titulo']);
    // O backlog, o % de SLA, o tempo de reparo e o fluxo; a preventiva, sem dia na conta, fica sem linha.
    expect(html.match(/<svg[^>]*role="img"/g)).toHaveLength(4);
    expect(html).toContain('href="/indicadores"');
  });

  it('o proprietário: os cartões dos hotéis dele, sem os indicadores da rede', () => {
    const html = renderizar('pt-BR', DO_PROPRIETARIO);
    expect(html).toContain('Hotel do Dono');
    expect(html).toContain(pt['indicadores.proprietario.titulo']);
    expect(html).not.toContain('Últimos 30 dias');
    expect(html).not.toContain('hk-mini-linha');
  });

  it('os períodos: os 30 dias até hoje e os 30 anteriores, sem buraco', () => {
    expect(periodosDoResumo(new Date(2026, 9, 20, 15))).toEqual({
      atual: { inicio: '2026-09-21', fim: '2026-10-20' },
      anterior: { inicio: '2026-08-22', fim: '2026-09-20' },
    });
  });
});

describe('as linhas dos últimos 14 dias', () => {
  const html = renderizar('pt-BR', DA_GESTAO);

  it('o % de SLA: um vão no dia sem conta, e o último dia sozinho vira um ponto', () => {
    // Dos dias 17 a 30, ficam sem conta os dias 22 e 29 (i = 21 e 28).
    const sla = mini(
      html,
      '% de SLA de cada dia, nos últimos 14 dias; o dia sem prazo vencido fica em branco',
    );
    const trechos = [...(sla ?? '').matchAll(/points="([^"]+)"/g)].map(
      (m) => m[1]?.split(' ').length,
    );
    expect(trechos).toEqual([5, 6, 2]);
  });

  it('o tempo de reparo: uma linha só, com os 14 dias', () => {
    const mttr = mini(
      html,
      'Tempo médio de reparo dos chamados encerrados em cada dia, nos últimos 14 dias; o dia sem encerramento fica em branco',
    );
    expect(mttr?.match(/points="([^"]+)"/)?.[1]?.split(' ')).toHaveLength(14);
  });

  it('a preventiva sem nenhum dia na conta fica sem linha', () => {
    expect(html).not.toContain('% de preventiva em dia pela data prevista');
  });
});

describe('onde mais quebra', () => {
  it('na tela inicial da gestão: as categorias, os sem categoria e as outras', () => {
    const html = renderizar('pt-BR', DA_GESTAO);
    expect(html).toContain('Onde mais quebra');
    // Sem rede no teste, os nomes do grupo não chegam: a categoria fica sem nome.
    expect(html).toContain('Categoria sem nome');
    expect(html).toContain('Sem categoria');
    expect(html).toContain('Outras categorias');
    expect(html.match(/class="hk-barras-item"/g)).toHaveLength(3);
  });

  it('com o nome da categoria, e nada sem nenhum chamado', () => {
    const com = (dados: PainelDeIndicadores['ondeMaisQuebra']) =>
      renderToString(
        <ProvedorDeIdioma idioma="pt-BR" mensagens={mensagensDe('pt-BR')} pseudoLiberado>
          <OndeMaisQuebra dados={dados} nomes={new Map([[CAT, 'Elevadores']])} />
        </ProvedorDeIdioma>,
      );
    expect(com(DA_GESTAO.ondeMaisQuebra)).toContain('Elevadores');
    expect(com({ categorias: [], outras: 0 })).toBe('');
  });
});
