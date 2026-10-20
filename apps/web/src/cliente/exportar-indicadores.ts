'use client';
// O CSV do painel de indicadores (fase 1c, item 9): uma linha por hotel do
// período, com a bandeira e as UHs, e a do total do escopo no fim. Sai o que a
// tela já recebeu da API, então o escopo é o mesmo: o hotel que o proprietário
// só vê pelos cartões leva só o backlog, os UH-dias perdidos e os chamados
// abertos, e as outras colunas ficam vazias. Os números vão sem separador de
// milhar e com a vírgula ou o ponto decimal do formato regional de quem
// exporta, o mesmo que escolhe o separador do CSV (decisão 7); o tempo de
// reparo vai em horas, para a planilha somar. Sem dado, a célula fica vazia.
import { separadorDeCsv } from '@hubkeep/i18n';
import { useState } from 'react';
import { useIntl } from 'react-intl';
import { arquivoCsv, baixarCsv, formatoDeQuemExporta } from './csv';
import type { IndicadoresNaTela, PainelDeIndicadores } from './indicadores';
import { useT } from '../i18n/cliente';

/** As colunas do CSV, na ordem do arquivo; o rótulo sai de indicadores.csv.coluna. */
export const COLUNAS_DO_CSV = [
  'hotel',
  'bandeira',
  'uhs',
  'backlog',
  'sla',
  'sla_itens',
  'mttr_horas',
  'mediana_horas',
  'preventiva',
  'preventiva_itens',
  'razao',
  'uh_dias',
  'abertos',
  'chamados_100',
] as const;

type Coluna = (typeof COLUNAS_DO_CSV)[number];
type Valores = Partial<Record<Coluna, number | null>>;

const dosIndicadores = (i: IndicadoresNaTela): Valores => ({
  uhs: i.uhsAtivas,
  backlog: i.backlog,
  sla: i.percentualDeSla,
  sla_itens: i.sla.total,
  mttr_horas: i.mttrHoras,
  mediana_horas: i.medianaHoras,
  preventiva: i.percentualDePreventivaEmDia,
  preventiva_itens: i.preventiva.total,
  razao: i.preventivasPorCorretiva,
  uh_dias: i.uhDias,
  abertos: i.abertos,
  chamados_100: i.chamadosPor100Uhs,
});

/** O cabeçalho, os hotéis na ordem da API e o total do escopo, quando há. */
export function tabelaDosIndicadores(
  painel: PainelDeIndicadores,
  t: ReturnType<typeof useT>,
  numero: (n: number) => string,
): string[][] {
  const bandeira = (id: string | null) => painel.bandeiras.find((b) => b.id === id)?.nome ?? '';
  const linha = (hotel: string, nomeDaBandeira: string, v: Valores) =>
    COLUNAS_DO_CSV.map((c) => {
      if (c === 'hotel') return hotel;
      if (c === 'bandeira') return nomeDaBandeira;
      const n = v[c];
      return n === null || n === undefined ? '' : numero(n);
    });
  return [
    COLUNAS_DO_CSV.map((coluna) => t('indicadores.csv.coluna', { coluna })),
    ...painel.hoteis.map((h) =>
      linha(
        h.nome,
        bandeira(h.bandeiraId),
        h.visao === 'completa'
          ? dosIndicadores(h.indicadores)
          : {
              backlog: h.cartoes.backlog,
              uh_dias: h.cartoes.uhDias,
              abertos: h.cartoes.abertos,
              chamados_100: h.cartoes.chamadosPor100Uhs,
            },
      ),
    ),
    ...(painel.rede ? [linha(t('indicadores.csv.total'), '', dosIndicadores(painel.rede))] : []),
  ];
}

export function useExportarIndicadores() {
  const t = useT();
  const intl = useIntl();
  const [exportado, setExportado] = useState<string | null>(null);

  async function exportar(painel: PainelDeIndicadores) {
    setExportado(null);
    const formato = await formatoDeQuemExporta(intl.locale);
    const numeros = new Intl.NumberFormat(formato, {
      useGrouping: false,
      maximumFractionDigits: 2,
    });
    const tabela = tabelaDosIndicadores(painel, t, (n) => numeros.format(n));
    const arquivo = t('indicadores.csv.arquivo', {
      inicio: painel.periodo.inicio,
      fim: painel.periodo.fim,
    });
    baixarCsv(arquivoCsv(tabela, separadorDeCsv(formato)), arquivo);
    setExportado(t('comum.csv_exportado', { n: tabela.length - 1, arquivo }));
  }

  return { exportado, exportar };
}
