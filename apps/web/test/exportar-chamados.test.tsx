// O CSV da lista de chamados (1c, item 9): o caminho da página da exportação,
// o cabeçalho e as linhas nos quatro idiomas e no pseudo-idioma, com o BOM e o
// separador, e o botão na lista. Renderizado no servidor, sem rede.
import { IDIOMAS, type IdiomaDeExibicao, PSEUDO_IDIOMA, mensagensDe } from '@hubkeep/i18n';
import type { ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import { useIntl } from 'react-intl';
import { describe, expect, it } from 'vitest';
import Chamados from '../src/app/(painel)/chamados/page';
import {
  type ChamadoResumido,
  FILTRO_VAZIO,
  caminhoDaLista,
  useNomes,
} from '../src/cliente/corretiva';
import { BOM, arquivoCsv } from '../src/cliente/csv';
import { tabelaDeChamados } from '../src/cliente/exportar-chamados';
import { ProvedorDeIdioma, useT } from '../src/i18n/cliente';

const CHAMADO: ChamadoResumido = {
  id: '0193a000-0000-4000-8000-000000000001',
  hotelId: '0193a000-0000-4000-8000-0000000000a1',
  hotelNome: 'Hotel Centro',
  localId: '0193a000-0000-4000-8000-0000000000c1',
  localNome: 'UH 101',
  ativoId: null,
  ativoNome: null,
  descricao: '=Vazamento; no banheiro',
  estado: 'aberto',
  situacaoId: '0193a000-0000-4000-8000-0000000000d1',
  prioridadeId: '0193a000-0000-4000-8000-0000000000e1',
  criadoEm: '2026-10-19T12:00:00.000Z',
};

function Csv({ separador }: { separador: ';' | ',' }) {
  const t = useT();
  const intl = useIntl();
  const nomes = useNomes(null);
  const tabela = tabelaDeChamados([CHAMADO], t, (iso) => intl.formatDate(iso), nomes);
  return <pre>{arquivoCsv(tabela, separador)}</pre>;
}

const renderizar = (idioma: IdiomaDeExibicao, tela: ReactNode) =>
  renderToString(
    <ProvedorDeIdioma idioma={idioma} mensagens={mensagensDe(idioma)} pseudoLiberado>
      {tela}
    </ProvedorDeIdioma>,
  );

describe('o CSV da lista de chamados', () => {
  it('a página da exportação vai na query, com os filtros', () => {
    const url = new URL(
      caminhoDaLista('/api/v1/chamados', { ...FILTRO_VAZIO, hotelId: CHAMADO.hotelId }, null, true),
      'http://x',
    );
    expect(Object.fromEntries(url.searchParams)).toEqual({
      hotelId: CHAMADO.hotelId,
      exportacao: '1',
    });
  });

  it.each<IdiomaDeExibicao>([...IDIOMAS, PSEUDO_IDIOMA])('%s: sem chave crua', (idioma) => {
    const html = renderizar(idioma, <Csv separador=";" />);
    expect(html).not.toMatch(/corretiva\.[a-z_.]+/);
    expect(html).toContain(BOM);
    expect(html).toContain(CHAMADO.id);
  });

  it('pt-BR: o cabeçalho, a descrição protegida e o separador', () => {
    const html = renderizar('pt-BR', <Csv separador=";" />);
    expect(html).toContain(
      'Aberto em;Hotel;Local;Ativo;Descrição;Situação;Prioridade;Identificador',
    );
    // Com o separador e o sinal de fórmula: entre aspas, com o apóstrofo.
    expect(html).toContain('&quot;&#x27;=Vazamento; no banheiro&quot;');
    expect(html).toContain('Hotel Centro;UH 101;;');
  });

  it('a lista tem o botão de exportar', () => {
    expect(renderizar('pt-BR', <Chamados />)).toContain('Exportar CSV');
  });
});
