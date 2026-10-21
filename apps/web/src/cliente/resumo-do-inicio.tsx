'use client';
// O resumo da tela inicial (1c, seção 4 da paridade): os últimos 30 dias, com a
// variação contra os 30 anteriores, pela mesma API do painel de indicadores.
// A gestão vê os quatro indicadores do topo (backlog, % de SLA, tempo de reparo
// e % de preventiva em dia), o backlog com a linha dos últimos 14 dias e o
// fluxo de chamados e "Onde mais quebra"; o proprietário, os cartões dos hotéis
// dele. O resto fica no painel de indicadores, que o link abre.
import { somarDias } from '@hubkeep/dominio';
import { Painel } from '@hubkeep/ui';
import Link from 'next/link';
import { useT } from '../i18n/cliente';
import {
  CartoesDoPeriodo,
  CartoesDoProprietario,
  ChamadosPorDia,
  type PainelDeIndicadores,
  separarHoteis,
} from './indicadores';
import { OndeMaisQuebra, useNomesDasCategorias } from './onde-mais-quebra';

/** Os dias do resumo, até hoje inclusive. */
export const DIAS_DO_RESUMO = 30;

const dois = (n: number) => String(n).padStart(2, '0');
const dataLocal = (d: Date) => `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}`;

/** Os 30 dias até hoje, no relógio de quem vê, e os 30 anteriores. */
export function periodosDoResumo(agora: Date) {
  const fim = dataLocal(agora);
  const inicio = somarDias(fim, -(DIAS_DO_RESUMO - 1));
  return {
    atual: { inicio, fim },
    anterior: { inicio: somarDias(inicio, -DIAS_DO_RESUMO), fim: somarDias(inicio, -1) },
  };
}

export function ResumoDoInicio({
  atual,
  anterior,
}: {
  atual: PainelDeIndicadores;
  anterior: PainelDeIndicadores | null;
}) {
  const t = useT();
  const { doProprietario } = separarHoteis(atual.hoteis);
  const nomes = useNomesDasCategorias();
  return (
    <>
      {atual.rede ? (
        <Painel
          titulo={t('inicio.resumo.titulo', { dias: DIAS_DO_RESUMO })}
          dica={t('inicio.resumo.dica', { dias: DIAS_DO_RESUMO })}
          acoes={<Link href="/indicadores">{t('inicio.resumo.ver_painel')}</Link>}
        >
          <CartoesDoPeriodo
            atual={atual.rede}
            anterior={anterior?.rede ?? null}
            meta={atual.metaDeSla}
            resumo={{ serie: atual.serie }}
          />
          <ChamadosPorDia serie={atual.serie} soFluxo />
          <OndeMaisQuebra dados={atual.ondeMaisQuebra} nomes={nomes} />
        </Painel>
      ) : null}
      <CartoesDoProprietario hoteis={doProprietario} />
    </>
  );
}
