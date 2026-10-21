// O quadro "Situação por hotel" da tela inicial (1c, seção 4 da paridade;
// glossário de métricas, versão 4), nos quatro idiomas e no pseudo-idioma,
// renderizado no servidor (react-dom/server), com dados prontos, sem rede. E o
// filtro de hotel que a lista de chamados lê da URL, para o link do quadro.
import { IDIOMAS, type IdiomaDeExibicao, PSEUDO_IDIOMA, mensagensDe } from '@hubkeep/i18n';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { FILTRO_VAZIO, filtroDaUrl } from '../src/cliente/corretiva';
import type { IndicadoresNaTela, PainelDeIndicadores } from '../src/cliente/indicadores';
import {
  QuadroDeSituacao,
  type SituacaoNaTela,
  intensidade,
} from '../src/cliente/situacao-por-hotel';
import { ProvedorDeIdioma } from '../src/i18n/cliente';

const H1 = '0193a000-0000-4000-8000-000000000001';
const H2 = '0193a000-0000-4000-8000-000000000002';

const linha = (extra: Partial<SituacaoNaTela>): SituacaoNaTela => ({
  hotelId: H1,
  hotelNome: 'Hotel Centro',
  situacao: 'ok',
  vencemEmBreve: 0,
  foraDoPrazo: 0,
  criticos: 0,
  preventivasAtrasadas: 0,
  abertosPorDia: Array.from({ length: 14 }, (_, i) => i % 3),
  ...extra,
});

const LINHAS: SituacaoNaTela[] = [
  linha({
    hotelId: H2,
    hotelNome: 'Hotel Praia',
    situacao: 'critico',
    foraDoPrazo: 4,
    criticos: 1,
  }),
  linha({ situacao: 'atencao', vencemEmBreve: 2, foraDoPrazo: 1, preventivasAtrasadas: 2 }),
];

const indicadores = (backlog: number, percentualDeSla: number | null) =>
  ({
    backlog,
    percentualDeSla,
  }) as unknown as IndicadoresNaTela;

const HOTEIS: PainelDeIndicadores['hoteis'] = [
  {
    id: H1,
    nome: 'Hotel Centro',
    bandeiraId: null,
    visao: 'completa',
    indicadores: indicadores(7, 92.5),
    metaDeSla: 90,
  },
];

const renderizar = (
  idioma: IdiomaDeExibicao,
  linhas: readonly SituacaoNaTela[] = LINHAS,
  hoteis = HOTEIS,
) =>
  renderToString(
    <ProvedorDeIdioma idioma={idioma} mensagens={mensagensDe(idioma)} pseudoLiberado>
      <QuadroDeSituacao linhas={linhas} indicadores={hoteis} />
    </ProvedorDeIdioma>,
  );

describe('situação por hotel em cada idioma', () => {
  it.each<IdiomaDeExibicao>([...IDIOMAS, PSEUDO_IDIOMA])(
    '%s: o quadro e o vazio, sem chave crua nem estilo inline',
    (idioma) => {
      for (const html of [renderizar(idioma), renderizar(idioma, [])]) {
        expect(html).not.toMatch(/(inicio|indicadores)\.[a-z_.]+/);
        expect(html).not.toContain('style=');
      }
    },
  );
});

describe('situação por hotel', () => {
  const html = renderizar('pt-BR');

  it('as linhas na ordem da API, com o selo da situação e o link para a fila do hotel', () => {
    expect([...html.matchAll(/data-situacao="([a-z]+)"/g)].map((m) => m[1])).toEqual([
      'critico',
      'atencao',
    ]);
    expect(html).toContain('Crítico');
    expect(html).toContain('Atenção');
    expect(html).toContain(`href="/chamados?hotelId=${H2}"`);
  });

  it('o backlog e o % de SLA do painel; sem a linha do painel, "sem dado"', () => {
    expect(html).toContain('92,5% (meta 90%)');
    const praia = html.match(new RegExp(`data-hotel="${H2}"[\\s\\S]*?</tr>`))?.[0] ?? '';
    expect(praia.match(/sem dado/g)).toHaveLength(2);
  });

  it('a cor da célula pelo maior da coluna, e a linha dos abertos por dia de cada hotel', () => {
    expect(html).toMatch(/data-intensidade="3"[^>]*>4</);
    expect(html).toMatch(/data-intensidade="1"[^>]*>1</);
    expect(html.match(/class="hk-mini-linha"/g)).toHaveLength(2);
    expect(html).toContain(
      'aria-label="Chamados abertos por dia em Hotel Praia, nos últimos 14 dias"',
    );
  });

  it('sem hotel na gestão, a mensagem do vazio', () => {
    expect(renderizar('pt-BR', [])).toContain('Nenhum hotel na sua gestão.');
  });

  it('a intensidade: 0 sem ocorrência, de 1 a 3 pela fração do maior', () => {
    expect([intensidade(0, 5), intensidade(1, 5), intensidade(3, 5), intensidade(5, 5)]).toEqual([
      0, 1, 2, 3,
    ]);
    expect(intensidade(0, 0)).toBe(0);
  });
});

describe('o filtro da lista de chamados pela URL', () => {
  it('o hotel do link do quadro; sem nada, o filtro vazio', () => {
    expect(filtroDaUrl(`?hotelId=${H1}`)).toEqual({ ...FILTRO_VAZIO, hotelId: H1 });
    expect(filtroDaUrl('')).toEqual(FILTRO_VAZIO);
  });
});
