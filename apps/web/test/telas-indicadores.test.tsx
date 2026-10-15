// Painel de indicadores (1c, item 8): os cartões com a variação, o backlog por
// idade, a comparação na bandeira com o melhor de cada coluna em destaque, a
// produtividade e os cartões do proprietário, nos quatro idiomas e no
// pseudo-idioma, renderizados no servidor (react-dom/server), sem rede.
import { IDIOMAS, type IdiomaDeExibicao, PSEUDO_IDIOMA, mensagensDe } from '@hubkeep/i18n';
import type { ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import PainelDosIndicadores from '../src/app/(painel)/indicadores/page';
import {
  BacklogPorIdade,
  CartoesDoPeriodo,
  CartoesDoProprietario,
  ComparacaoNaBandeira,
  type IndicadoresNaTela,
  type PainelDeIndicadores,
  Produtividade,
  melhoresDaColuna,
  separarHoteis,
} from '../src/cliente/indicadores';
import { ProvedorDeIdioma } from '../src/i18n/cliente';

const B = '0193a000-0000-4000-8000-0000000000b1';
const H1 = '0193a000-0000-4000-8000-000000000001';
const H2 = '0193a000-0000-4000-8000-000000000002';
const H3 = '0193a000-0000-4000-8000-000000000003';

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
  hoteis: 2,
  ...extra,
});

const hoteis: PainelDeIndicadores['hoteis'] = [
  {
    id: H1,
    nome: 'Hotel Centro',
    bandeiraId: B,
    visao: 'completa',
    indicadores: indicadores({ percentualDeSla: 95, mttrHoras: 40, uhsAtivas: 120 }),
    metaDeSla: 90,
  },
  {
    id: H2,
    nome: 'Hotel Praia',
    bandeiraId: B,
    visao: 'completa',
    indicadores: indicadores({ percentualDeSla: 80, mttrHoras: 10, uhsAtivas: 80 }),
    metaDeSla: 90,
  },
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
];

const renderizar = (idioma: IdiomaDeExibicao, tela: ReactNode) =>
  renderToString(
    <ProvedorDeIdioma idioma={idioma} mensagens={mensagensDe(idioma)} pseudoLiberado>
      {tela}
    </ProvedorDeIdioma>,
  );

describe('painel de indicadores em cada idioma', () => {
  const { completos, doProprietario } = separarHoteis(hoteis);
  const bandeira = { id: B, nome: 'Bandeira Sul', indicadores: indicadores() };

  it.each<IdiomaDeExibicao>([...IDIOMAS, PSEUDO_IDIOMA])(
    '%s: as peças da tela, sem chave crua',
    (idioma) => {
      const html = renderizar(
        idioma,
        <>
          <CartoesDoPeriodo
            atual={indicadores()}
            anterior={indicadores({ backlog: 10 })}
            meta={90}
          />
          <BacklogPorIdade faixas={indicadores().backlogPorIdade} />
          <ComparacaoNaBandeira bandeira={bandeira} hoteis={completos} />
          <Produtividade
            linhas={[
              {
                hotelId: H1,
                equipeId: null,
                equipeNome: null,
                osConcluidas: 3,
                segundosApontados: 5400,
              },
            ]}
            nomeDoHotel={() => 'Hotel Centro'}
          />
          <CartoesDoProprietario hoteis={doProprietario} />
        </>,
      );
      expect(html).not.toMatch(/indicadores\.[a-z_.]+/);
      expect(html.match(/class="hk-indicador"/g)?.length).toBe(7 + 3);
      expect(html.match(/data-faixa=/g)).toHaveLength(5);
      expect(html).toContain('Hotel Praia');
      expect(html).toContain('Hotel do Dono');
    },
  );

  it('pt-BR: a variação, o MTTR em dias acima de 24 h e as faixas', () => {
    const html = renderizar(
      'pt-BR',
      <>
        <CartoesDoPeriodo atual={indicadores()} anterior={indicadores({ backlog: 10 })} meta={90} />
        <BacklogPorIdade faixas={indicadores().backlogPorIdade} />
      </>,
    );
    expect(html).toContain('+2 vs. período anterior');
    expect(html).toContain('1,3 d');
    expect(html).toContain('Mediana 20 h');
    expect(html).toContain('Até 2 dias');
    expect(html).toContain('Mais de 30 dias');
  });

  it('a comparação destaca o melhor de cada coluna, maior ou menor', () => {
    expect(melhoresDaColuna(completos)).toEqual([95, 10, 6, 80, 3.5, 25]);
    const html = renderizar(
      'pt-BR',
      <ComparacaoNaBandeira bandeira={bandeira} hoteis={completos} />,
    );
    expect(html).toContain('<strong>95%</strong>');
    expect(html).toContain('<strong>10 h</strong>');
    expect(html).toContain('(melhor da bandeira)');
    expect(html).toContain('Bandeira inteira');
  });

  it('a página abre carregando, sem estilo inline nem h1 próprio', () => {
    const html = renderizar('pt-BR', <PainelDosIndicadores />);
    expect(html).toContain(mensagensDe('pt-BR')['comum.carregando']);
    expect(html).not.toContain('style=');
    expect(html).not.toContain('<h1');
  });
});
