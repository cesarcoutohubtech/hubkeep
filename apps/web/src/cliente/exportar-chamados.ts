'use client';
// O CSV da lista de chamados (fase 1c, item 9): os mesmos filtros da tela, em
// páginas de 1.000 (exportacao=1), juntadas no navegador até 50 mil linhas,
// com o BOM e o separador do formato regional de quem exporta (decisão 7). O
// escopo é o da RLS: sai só o que o perfil de quem exporta enxerga, e o aviso
// diz quantas linhas saíram e em que arquivo.
import { LIMITES_DA_EXPORTACAO_DA_LISTA } from '@hubkeep/dominio';
import { separadorDeCsv } from '@hubkeep/i18n';
import { useState } from 'react';
import { useIntl } from 'react-intl';
import { type ErroDaApi, type RespostaDaApi, chamarApi } from './api';
import {
  type ChamadoResumido,
  type FiltroDaTela,
  type Referencias,
  caminhoDaLista,
  useNomes,
} from './corretiva';
import { arquivoCsv, baixarCsv } from './csv';
import { useT } from '../i18n/cliente';

interface Pagina {
  chamados: ChamadoResumido[];
  proximo: string | null;
}

const dataEHora = { dateStyle: 'short', timeStyle: 'short' } as const;

type Nomes = ReturnType<typeof useNomes>;

/** O cabeçalho e as linhas do CSV, na ordem da lista (do mais novo para o mais antigo). */
export function tabelaDeChamados(
  chamados: readonly ChamadoResumido[],
  t: ReturnType<typeof useT>,
  data: (iso: string) => string,
  nomes: Nomes,
): string[][] {
  return [
    [
      t('corretiva.coluna.aberto_em'),
      t('corretiva.chamados.csv.hotel'),
      t('corretiva.chamados.csv.local'),
      t('corretiva.chamados.csv.ativo'),
      t('corretiva.chamados.csv.descricao'),
      t('corretiva.coluna.situacao'),
      t('corretiva.coluna.prioridade'),
      t('corretiva.chamados.csv.id'),
    ],
    ...chamados.map((c) => [
      data(c.criadoEm),
      nomes.nome(c.hotelNome),
      nomes.nome(c.localNome),
      c.ativoNome ?? '',
      c.descricao,
      nomes.situacao(c.situacaoId),
      nomes.prioridade(c.prioridadeId),
      c.id,
    ]),
  ];
}

export type EstadoDaExportacao =
  | { tipo: 'lendo'; linhas: number }
  | { tipo: 'feita'; texto: string }
  | { tipo: 'grande'; texto: string }
  | { tipo: 'erro'; erro: ErroDaApi };

export function useExportarChamados(refs: Referencias | null) {
  const t = useT();
  const intl = useIntl();
  const nomes = useNomes(refs);
  const [estado, setEstado] = useState<EstadoDaExportacao | null>(null);

  async function exportar(filtro: FiltroDaTela) {
    setEstado({ tipo: 'lendo', linhas: 0 });
    const preferencias = await chamarApi<{ formatoRegional: string }>('/api/v1/preferencias');
    const separador = separadorDeCsv(
      preferencias.ok ? preferencias.dados.formatoRegional : intl.locale,
    );
    const chamados: ChamadoResumido[] = [];
    let depoisDe: string | null = null;
    do {
      const r: RespostaDaApi<Pagina> = await chamarApi<Pagina>(
        caminhoDaLista('/api/v1/chamados', filtro, depoisDe, true),
      );
      if (!r.ok) return setEstado({ tipo: 'erro', erro: r.erro });
      chamados.push(...r.dados.chamados);
      depoisDe = r.dados.proximo;
      if (chamados.length > LIMITES_DA_EXPORTACAO_DA_LISTA.linhasNoCsv) {
        return setEstado({
          tipo: 'grande',
          texto: t('corretiva.chamados.exportacao_grande', {
            limite: LIMITES_DA_EXPORTACAO_DA_LISTA.linhasNoCsv,
          }),
        });
      }
      setEstado({ tipo: 'lendo', linhas: chamados.length });
    } while (depoisDe);
    const conteudo = arquivoCsv(
      tabelaDeChamados(chamados, t, (iso) => intl.formatDate(iso, dataEHora), nomes),
      separador,
    );
    const hoje = new Date();
    const dois = (n: number) => String(n).padStart(2, '0');
    const arquivo = t('corretiva.chamados.arquivo', {
      data: `${hoje.getFullYear()}-${dois(hoje.getMonth() + 1)}-${dois(hoje.getDate())}`,
    });
    baixarCsv(conteudo, arquivo);
    setEstado({
      tipo: 'feita',
      texto: t('comum.csv_exportado', { n: chamados.length, arquivo }),
    });
  }

  return { estado, exportar };
}
