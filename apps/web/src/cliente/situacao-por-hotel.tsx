'use client';
// O quadro "Situação por hotel" da tela inicial (1c, seção 4 da paridade;
// glossário de métricas, versão 4; o nome é decisão do Cesar de 20/10/2026).
// As contagens, os abertos por dia e a situação vêm da GET
// /api/v1/inicio/situacao-por-hotel; o backlog ("Em aberto") e o % de SLA dos
// 30 dias, do painel de indicadores que o resumo já leu, para os números serem
// os mesmos do painel. É da gestão: quem não é recebe 403, e o quadro não
// aparece. Lido ao abrir e a cada 60 segundos, como os próximos prazos.
import type { RespostaDaSituacaoPorHotel, z } from '@hubkeep/contratos';
import { MensagemVazia, MiniLinha, Painel, Selo, Tabela, type TomDeSelo } from '@hubkeep/ui';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useIntl } from 'react-intl';
import { useT } from '../i18n/cliente';
import { chamarApi } from './api';
import type { PainelDeIndicadores } from './indicadores';
import { INTERVALO_MS } from './prazos-e-eventos';
import { DIAS_DO_RESUMO } from './resumo-do-inicio';

export type SituacaoNaTela = z.infer<typeof RespostaDaSituacaoPorHotel>['hoteis'][number];

/** Os dias da coluna dos abertos por dia (o contrato fixa 14). */
const DIAS_DOS_ABERTOS = 14;

const TOM_DA_SITUACAO: Readonly<Record<SituacaoNaTela['situacao'], TomDeSelo>> = {
  critico: 'vermelho',
  atencao: 'ambar',
  ok: 'verde',
};

/** As colunas de contagem que ganham cor: mais forte com mais ocorrências. */
const COLUNAS_COM_COR = [
  'vencemEmBreve',
  'foraDoPrazo',
  'criticos',
  'preventivasAtrasadas',
] as const;
type ColunaComCor = (typeof COLUNAS_COM_COR)[number];

const CHAVE_DA_COLUNA = {
  vencemEmBreve: 'inicio.situacao.coluna.vencem_em_breve',
  foraDoPrazo: 'inicio.situacao.coluna.fora_do_prazo',
  criticos: 'inicio.situacao.coluna.criticos',
  preventivasAtrasadas: 'inicio.situacao.coluna.preventivas_atrasadas',
} as const satisfies Record<ColunaComCor, string>;

/** A intensidade da célula, de 0 a 3, pelo valor contra o maior da coluna. */
export const intensidade = (valor: number, maior: number): number =>
  valor <= 0 || maior <= 0 ? 0 : Math.ceil((valor / maior) * 3);

export function QuadroDeSituacao({
  linhas,
  indicadores,
}: {
  linhas: readonly SituacaoNaTela[];
  /** Os hotéis do painel de indicadores dos últimos 30 dias, para o backlog e o % de SLA. */
  indicadores: PainelDeIndicadores['hoteis'];
}) {
  const t = useT();
  const intl = useIntl();
  const semDado = t('indicadores.sem_dado');
  const maior = Object.fromEntries(
    COLUNAS_COM_COR.map((c) => [c, Math.max(0, ...linhas.map((l) => l[c]))]),
  ) as Record<ColunaComCor, number>;
  const completo = (id: string) => {
    const h = indicadores.find((x) => x.id === id);
    return h?.visao === 'completa' ? h : null;
  };
  return (
    <Painel titulo={t('inicio.situacao.titulo')} dica={t('inicio.situacao.dica')}>
      {linhas.length === 0 ? (
        <MensagemVazia>{t('inicio.situacao.vazio')}</MensagemVazia>
      ) : (
        <Tabela legenda={t('inicio.situacao.titulo')}>
          <thead>
            <tr>
              <th scope="col">{t('inicio.situacao.coluna.hotel')}</th>
              <th scope="col">{t('inicio.situacao.coluna.situacao')}</th>
              <th scope="col" className="hk-num">
                {t('inicio.situacao.coluna.em_aberto')}
              </th>
              {COLUNAS_COM_COR.map((c) => (
                <th key={c} scope="col" className="hk-num">
                  {t(CHAVE_DA_COLUNA[c])}
                </th>
              ))}
              <th scope="col" className="hk-num">
                {t('inicio.situacao.coluna.sla', { dias: DIAS_DO_RESUMO })}
              </th>
              <th scope="col">
                {t('inicio.situacao.coluna.abertos_por_dia', { dias: DIAS_DOS_ABERTOS })}
              </th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => {
              const h = completo(l.hotelId);
              const sla = h?.indicadores.percentualDeSla ?? null;
              return (
                <tr key={l.hotelId} data-hotel={l.hotelId} data-situacao={l.situacao}>
                  <th scope="row">
                    <Link href={`/chamados?hotelId=${l.hotelId}`}>{l.hotelNome}</Link>
                  </th>
                  <td>
                    <Selo tom={TOM_DA_SITUACAO[l.situacao]}>
                      {t('inicio.situacao.situacao', { situacao: l.situacao })}
                    </Selo>
                  </td>
                  <td className="hk-num">
                    {h ? intl.formatNumber(h.indicadores.backlog) : semDado}
                  </td>
                  {COLUNAS_COM_COR.map((c) => (
                    <td
                      key={c}
                      className="hk-num hk-celula-com-cor"
                      data-intensidade={intensidade(l[c], maior[c])}
                    >
                      {intl.formatNumber(l[c])}
                    </td>
                  ))}
                  <td className="hk-num">
                    {h && sla !== null
                      ? t('inicio.situacao.sla', {
                          valor: intl.formatNumber(sla, { maximumFractionDigits: 1 }),
                          meta: h.metaDeSla,
                        })
                      : semDado}
                  </td>
                  <td>
                    <MiniLinha
                      rotulo={t('inicio.situacao.abertos_por_dia', {
                        hotel: l.hotelNome,
                        dias: DIAS_DOS_ABERTOS,
                      })}
                      valores={l.abertosPorDia}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </Tabela>
      )}
    </Painel>
  );
}

/** Lê o quadro ao abrir e a cada 60 segundos; sem permissão (403) ou com erro, não aparece. */
export function SituacaoPorHotel({ indicadores }: { indicadores: PainelDeIndicadores['hoteis'] }) {
  const [linhas, setLinhas] = useState<SituacaoNaTela[] | null>(null);

  useEffect(() => {
    let vale = true;
    const ler = () =>
      void chamarApi<z.infer<typeof RespostaDaSituacaoPorHotel>>(
        '/api/v1/inicio/situacao-por-hotel',
      ).then((r) => {
        if (vale) setLinhas(r.ok ? r.dados.hoteis : null);
      });
    ler();
    const id = setInterval(ler, INTERVALO_MS);
    return () => {
      vale = false;
      clearInterval(id);
    };
  }, []);

  return linhas === null ? null : <QuadroDeSituacao linhas={linhas} indicadores={indicadores} />;
}
