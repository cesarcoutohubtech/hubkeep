'use client';
// "Onde mais quebra" (1c, decisão 6 e seção 4 da paridade; glossário de
// métricas, versão 4): os chamados abertos no período por categoria, as 8 com
// mais chamados e o resto em "Outras categorias", em barras horizontais. As
// contagens vêm do painel de indicadores (a rede, só a gestão); o nome da
// categoria, das categorias de ativo do grupo, no idioma de quem vê.
import type { Idioma } from '@hubkeep/i18n';
import { BarrasHorizontais, type ItemDasBarras, Painel } from '@hubkeep/ui';
import { useEffect, useState } from 'react';
import { useIntl } from 'react-intl';
import { useIdioma, useT } from '../i18n/cliente';
import { chamarApi } from './api';
import type { PainelDeIndicadores } from './indicadores';
import { type CategoriaDoGrupo, categoriasParaEscolha } from './triagem';

/** O nome de cada categoria do grupo, no idioma de quem vê; vazio enquanto lê ou com erro. */
export function useNomesDasCategorias(): ReadonlyMap<string, string> {
  const { idioma } = useIdioma();
  const [nomes, setNomes] = useState<ReadonlyMap<string, string>>(new Map());
  useEffect(() => {
    let vale = true;
    void chamarApi<{ idiomaPadrao: Idioma; categorias: CategoriaDoGrupo[] }>(
      '/api/v1/categorias-de-ativo',
    ).then((r) => {
      if (vale && r.ok) {
        setNomes(new Map(categoriasParaEscolha(r.dados, idioma).map((c) => [c.id, c.nome])));
      }
    });
    return () => {
      vale = false;
    };
  }, [idioma]);
  return nomes;
}

export function OndeMaisQuebra({
  dados,
  nomes,
}: {
  dados: PainelDeIndicadores['ondeMaisQuebra'];
  nomes: ReadonlyMap<string, string>;
}) {
  const t = useT();
  const intl = useIntl();
  if (dados.categorias.length === 0) return null;
  const itens: ItemDasBarras[] = dados.categorias.map((c) => ({
    chave: c.categoriaId ?? 'sem_categoria',
    rotulo:
      c.categoriaId === null
        ? t('indicadores.grafico.quebra.sem_categoria')
        : (nomes.get(c.categoriaId) ?? t('indicadores.grafico.quebra.categoria')),
    valor: c.chamados,
    texto: intl.formatNumber(c.chamados),
  }));
  if (dados.outras > 0) {
    itens.push({
      chave: 'outras',
      rotulo: t('indicadores.grafico.quebra.outras'),
      valor: dados.outras,
      texto: intl.formatNumber(dados.outras),
    });
  }
  return (
    <Painel
      titulo={t('indicadores.grafico.quebra.titulo')}
      dica={t('indicadores.grafico.quebra.dica')}
      nivel={3}
    >
      <BarrasHorizontais rotulo={t('indicadores.grafico.quebra.titulo')} itens={itens} />
    </Painel>
  );
}
