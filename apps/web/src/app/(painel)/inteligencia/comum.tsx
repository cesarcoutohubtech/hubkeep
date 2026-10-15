'use client';
// Peças comuns das telas do HubKeep Intelligence (proposta das telas do 1.0):
// os selos de faixa e de estado, o título e o escopo do insight, as datas e
// os dois gráficos em SVG (chamados por semana e atenção nos últimos 90
// dias), sempre com os números também em texto, para o leitor de tela e o
// celular (decisão 6). As cores seguem o mock oficial.
import type { InsightApi, NomesDoPainelApi, RespostaDasEfetividades, z } from '@hubkeep/contratos';
import type { Chave } from '@hubkeep/i18n';
import { MensagemVazia, Selo, Tabela, type TomDeSelo } from '@hubkeep/ui';
import Link from 'next/link';
import { useIntl } from 'react-intl';
import { useT } from '../../../i18n/cliente';

export type Insight = z.infer<typeof InsightApi>;
export type Nomes = z.infer<typeof NomesDoPainelApi>;
export type Efetividades = z.infer<typeof RespostaDasEfetividades>;

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** As faixas que têm nome no catálogo (FAIXAS_PADRAO e o sem dado). */
const FAIXAS = ['normal', 'observar', 'atencao', 'alta_atencao', 'critico', 'dados_insuficientes'];
const TOM_DA_FAIXA: Readonly<Record<string, TomDeSelo>> = {
  critico: 'vermelho',
  alta_atencao: 'ambar',
  atencao: 'ambar',
  observar: 'azul',
};
const TOM_DO_ESTADO: Readonly<Record<string, TomDeSelo>> = {
  novo: 'ambar',
  em_revisao: 'azul',
  aceito: 'azul',
  em_acao: 'azul',
  monitorando: 'verde',
};

export function useNomeDaFaixa() {
  const t = useT();
  return (faixa: string) =>
    t(`inteligencia.faixa.${FAIXAS.includes(faixa) ? faixa : 'dados_insuficientes'}` as Chave);
}

export function SeloDaFaixa({ faixa }: { faixa: string }) {
  const nome = useNomeDaFaixa();
  return <Selo tom={TOM_DA_FAIXA[faixa] ?? 'cinza'}>{nome(faixa)}</Selo>;
}

export function SeloDoEstado({ estado }: { estado: string }) {
  const t = useT();
  return (
    <Selo tom={TOM_DO_ESTADO[estado] ?? 'cinza'}>
      {t('inteligencia.insight.estado', { estado })}
    </Selo>
  );
}

/** O título do insight: o nome do ativo, ou o nome da regra sistêmica. */
export function useTituloDoInsight() {
  const t = useT();
  return (i: Pick<Insight, 'tipo' | 'escopo'>, nomes: Nomes) => {
    if (i.tipo === 'sistemico')
      return t('inteligencia.sistemico.regra', { regra: i.escopo['regra'] ?? '' });
    const ativo = i.escopo['ativoId'];
    return (ativo && nomes.ativos[ativo]) || t('inteligencia.insight.tipo', { tipo: i.tipo });
  };
}

/** O escopo: o hotel, ou "3 hotéis da bandeira Aurora" / "do grupo" no insight de rede. */
export function useEscopoDoInsight() {
  const t = useT();
  return (i: Pick<Insight, 'hotelId' | 'hotelIds' | 'bandeiraId'>, nomes: Nomes) => {
    if (i.hotelId) return nomes.hoteis[i.hotelId] ?? '';
    const bandeira = i.bandeiraId ? nomes.bandeiras[i.bandeiraId] : undefined;
    return bandeira
      ? t('inteligencia.escopo.rede_bandeira', { quantidade: i.hotelIds.length, bandeira })
      : t('inteligencia.escopo.rede_grupo', { quantidade: i.hotelIds.length });
  };
}

export function useDatas() {
  const intl = useIntl();
  return {
    data: (iso: string) => intl.formatDate(new Date(iso), { dateStyle: 'short' }),
    dataHora: (iso: string) =>
      intl.formatDate(new Date(iso), { dateStyle: 'short', timeStyle: 'short' }),
    /** AAAA-MM-DD, sem fuso: o dia como o job gravou. */
    dia: (dia: string) =>
      intl.formatDate(new Date(`${dia}T12:00:00Z`), {
        day: '2-digit',
        month: '2-digit',
        timeZone: 'UTC',
      }),
    numero: (n: number, maximo = 1) => intl.formatNumber(n, { maximumFractionDigits: maximo }),
    percentual: (n: number) => intl.formatNumber(n, { style: 'percent', maximumFractionDigits: 0 }),
  };
}

/** Chamados por semana: barras, com os números da semana também em texto. */
export function ChamadosPorSemana({
  serie,
}: {
  serie: readonly { inicio: string; quantidade: number }[];
}) {
  const t = useT();
  const intl = useIntl();
  const rotulo = (iso: string) =>
    intl.formatDate(new Date(iso), { day: '2-digit', month: '2-digit' });
  const valores = serie
    .map((s) =>
      t('inteligencia.semanas.item', { inicio: rotulo(s.inicio), quantidade: s.quantidade }),
    )
    .join('; ');
  const maximo = Math.max(1, ...serie.map((s) => s.quantidade));
  const largura = 600 / Math.max(1, serie.length);
  return (
    <div className="hk-pilha">
      <svg
        className="hk-grafico"
        role="img"
        aria-label={t('inteligencia.semanas.grafico', { valores })}
        viewBox="0 0 600 138"
        width="100%"
      >
        {serie.map((s, i) => {
          const altura = (s.quantidade / maximo) * 100;
          return (
            <g key={s.inicio}>
              <rect
                x={i * largura + 6}
                y={110 - altura}
                width={largura - 12}
                height={Math.max(altura, 1)}
                rx={3}
                fill="var(--hk-ambar)"
              />
              <text
                x={i * largura + largura / 2}
                y={130}
                textAnchor="middle"
                fontSize={11}
                fill="var(--hk-texto-suave)"
              >
                {rotulo(s.inicio)}
              </text>
            </g>
          );
        })}
      </svg>
      <p className="hk-suave">{t('inteligencia.semanas.numeros', { valores })}</p>
    </div>
  );
}

const FUNDO_DAS_FAIXAS: readonly { desde: number; ate: number; cor: string; opacidade: number }[] =
  [
    { desde: 30, ate: 50, cor: 'var(--hk-petroleo-3)', opacidade: 0.08 },
    { desde: 50, ate: 70, cor: 'var(--hk-ambar)', opacidade: 0.1 },
    { desde: 70, ate: 85, cor: 'var(--hk-ambar)', opacidade: 0.18 },
    { desde: 85, ate: 100, cor: 'var(--hk-vermelho)', opacidade: 0.16 },
  ];

/**
 * A atenção de cada dia gravado, sobre as faixas, com a linha tracejada do
 * limite do insight. O dia sem dado quebra a linha. Os números vão em texto
 * logo abaixo (o resumo e, num details, dia a dia).
 */
export function AtencaoNosDias({
  serie,
  limite,
}: {
  serie: readonly { dia: string; atencao: number | null }[];
  limite: number;
}) {
  const t = useT();
  const { dia } = useDatas();
  const y = (v: number) => 160 - (v / 100) * 160;
  const x = (i: number) => (serie.length > 1 ? (i / (serie.length - 1)) * 600 : 300);
  const trechos: string[][] = [[]];
  serie.forEach((d, i) => {
    if (d.atencao === null) trechos.push([]);
    else trechos[trechos.length - 1]?.push(`${x(i)},${y(d.atencao)}`);
  });
  const comValor = serie.filter((d): d is { dia: string; atencao: number } => d.atencao !== null);
  const ultimo = serie.at(-1);
  const minimo = comValor.reduce<(typeof comValor)[number] | null>(
    (m, d) => (m === null || d.atencao < m.atencao ? d : m),
    null,
  );
  const maximo = comValor.reduce<(typeof comValor)[number] | null>(
    (m, d) => (m === null || d.atencao > m.atencao ? d : m),
    null,
  );
  const semValor = t('inteligencia.sem_valor');
  const resumo =
    ultimo && minimo && maximo
      ? t('inteligencia.serie90.resumo', {
          ultimo: ultimo.atencao ?? semValor,
          minimo: minimo.atencao,
          diaMinimo: dia(minimo.dia),
          maximo: maximo.atencao,
          diaMaximo: dia(maximo.dia),
          acima: comValor.filter((d) => d.atencao >= limite).length,
          total: serie.length,
          limite,
        })
      : t('inteligencia.serie90.sem_valor');
  return (
    <div className="hk-pilha">
      <svg
        className="hk-grafico"
        role="img"
        aria-label={t('inteligencia.serie90.grafico', { resumo })}
        viewBox="0 0 600 160"
        preserveAspectRatio="none"
        width="100%"
        height="160"
      >
        {FUNDO_DAS_FAIXAS.map((f) => (
          <rect
            key={f.desde}
            x={0}
            y={y(f.ate)}
            width={600}
            height={y(f.desde) - y(f.ate)}
            fill={f.cor}
            fillOpacity={f.opacidade}
          />
        ))}
        <line
          x1={0}
          x2={600}
          y1={y(limite)}
          y2={y(limite)}
          stroke="var(--hk-ambar)"
          strokeDasharray="6 4"
          vectorEffect="non-scaling-stroke"
        />
        {trechos
          .filter((p) => p.length > 0)
          .map((p) => (
            <polyline
              key={p[0]}
              points={p.join(' ')}
              fill="none"
              stroke="var(--hk-titulo)"
              strokeWidth={2}
              vectorEffect="non-scaling-stroke"
            />
          ))}
      </svg>
      {serie.length > 0 && (
        <div className="hk-em-linha hk-suave">
          <span>{dia(serie[0]?.dia ?? '')}</span>
          <span>{dia(ultimo?.dia ?? '')}</span>
        </div>
      )}
      <p className="hk-suave">{resumo}</p>
      {serie.length > 0 && (
        <details>
          <summary>{t('inteligencia.serie90.ver', { total: serie.length })}</summary>
          <p className="hk-suave">
            {serie
              .map((d) =>
                t('inteligencia.serie90.item', { dia: dia(d.dia), valor: d.atencao ?? semValor }),
              )
              .join('; ')}
          </p>
        </details>
      )}
    </div>
  );
}

const TOM_DO_RESULTADO: Readonly<Record<string, TomDeSelo>> = {
  reducao_observada: 'verde',
  reducao_parcial: 'azul',
  aumento_observado: 'vermelho',
  janela_incompleta: 'ambar',
};

/**
 * A efetividade das intervenções (adendo ao ADR-033 de 15/10/2026), na lista,
 * no detalhe do ativo e na página do insight, com as colunas do mock: a
 * intervenção (o chamado, quem executou e o custo da OS), o ativo, quando, os
 * chamados e o tempo parado antes e depois, o custo das corretivas com a
 * cobertura de cada lado e a variação observada. A ressalva fica no rodapé.
 */
export function TabelaDeEfetividade({
  efetividade,
  vazio,
}: {
  efetividade: Efetividades;
  /** O texto sem intervenção; a página do insight não mostra a seção vazia. */
  vazio?: string;
}) {
  const t = useT();
  const intl = useIntl();
  const { data, numero } = useDatas();
  const reais = (n: number) => intl.formatNumber(n, { style: 'currency', currency: 'BRL' });
  const { intervencoes, nomes } = efetividade;
  const semValor = t('inteligencia.sem_valor');
  if (!intervencoes.length) return vazio ? <MensagemVazia>{vazio}</MensagemVazia> : null;
  return (
    <>
      <Tabela legenda={t('inteligencia.efetividade.titulo')}>
        <thead>
          <tr>
            <th scope="col">{t('inteligencia.efetividade.coluna.intervencao')}</th>
            <th scope="col">{t('inteligencia.efetividade.coluna.ativo')}</th>
            <th scope="col">{t('inteligencia.efetividade.coluna.quando')}</th>
            <th scope="col" className="hk-num">
              {t('inteligencia.efetividade.coluna.chamados_antes')}
            </th>
            <th scope="col" className="hk-num">
              {t('inteligencia.efetividade.coluna.chamados_depois')}
            </th>
            <th scope="col" className="hk-num">
              {t('inteligencia.efetividade.metrica', { metrica: 'horas_paradas' })}
            </th>
            <th scope="col">{t('inteligencia.efetividade.coluna.custo')}</th>
            <th scope="col">{t('inteligencia.efetividade.coluna.variacao')}</th>
          </tr>
        </thead>
        <tbody>
          {intervencoes.map(({ intervencao: i, efetividade: e }) => {
            const metrica = (chave: string) => e.metricas.find((m) => m.chave === chave);
            const chamados = metrica('chamados');
            const horas = metrica('horas_paradas');
            const c = e.configuracao;
            const emCurso = e.diasDecorridos < c.janelaDias;
            return (
              <tr key={i.chamadoId}>
                <td>
                  {i.descricao ?? t('inteligencia.efetividade.sem_descricao')}
                  <br />
                  <span className="hk-suave">
                    {i.executadoPor === 'fornecedor'
                      ? i.fornecedorNome
                        ? t('inteligencia.efetividade.executado.fornecedor', {
                            nome: i.fornecedorNome,
                          })
                        : t('inteligencia.efetividade.executado.fornecedor_sem_nome')
                      : t('inteligencia.efetividade.executado.interno')}
                  </span>
                  {i.custoInformado !== null && (
                    <>
                      <br />
                      <span className="hk-suave">
                        {t('inteligencia.efetividade.custo_da_os', {
                          valor: reais(i.custoInformado),
                        })}
                      </span>
                    </>
                  )}
                </td>
                <td>
                  <Link href={`/inteligencia/ativos/${i.ativoId}`}>
                    {nomes.ativos[i.ativoId] ?? semValor}
                  </Link>
                  <br />
                  <span className="hk-suave">{nomes.hoteis[i.hotelId] ?? semValor}</span>
                </td>
                <td>{data(i.em)}</td>
                <td className="hk-num">{chamados ? numero(chamados.antes) : semValor}</td>
                <td className="hk-num">
                  {chamados ? numero(chamados.depois) : semValor}
                  {emCurso && (
                    <>
                      <br />
                      <span className="hk-suave">
                        {t('inteligencia.efetividade.janela_em_curso')}
                      </span>
                    </>
                  )}
                </td>
                <td className="hk-num">
                  {horas
                    ? t('inteligencia.efetividade.antes_depois', {
                        antes: numero(horas.antes),
                        depois: numero(horas.depois),
                      })
                    : semValor}
                </td>
                <td>
                  {e.custo.suficiente
                    ? t('inteligencia.efetividade.antes_depois', {
                        antes: reais(e.custo.antes.soma),
                        depois: reais(e.custo.depois.soma),
                      })
                    : t('inteligencia.efetividade.custo.insuficiente')}
                  <br />
                  <span className="hk-suave">
                    {t('inteligencia.efetividade.custo.cobertura', {
                      informadasAntes: e.custo.antes.informadas,
                      aceitasAntes: e.custo.antes.aceitas,
                      informadasDepois: e.custo.depois.informadas,
                      aceitasDepois: e.custo.depois.aceitas,
                    })}
                  </span>
                </td>
                <td>
                  <Selo tom={TOM_DO_RESULTADO[e.resultado] ?? 'cinza'}>
                    {t('inteligencia.efetividade.resultado', { resultado: e.resultado })}
                  </Selo>
                  <br />
                  <span className="hk-suave">
                    {t('inteligencia.efetividade.explicacao', {
                      resultado: e.resultado,
                      janelaDias: c.janelaDias,
                      reducaoObservada: c.reducaoObservadaPercentual,
                      reducaoParcial: c.reducaoParcialPercentual,
                      aumento: c.aumentoObservadoPercentual,
                      minChamadosAntes: c.minChamadosAntes,
                      diasDecorridos: e.diasDecorridos,
                    })}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </Tabela>
      <p className="hk-suave">{t('inteligencia.efetividade.ressalva')}</p>
    </>
  );
}
