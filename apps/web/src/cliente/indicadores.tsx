'use client';
// Painel de indicadores (1c, item 8; glossário único de métricas, versão 3):
// os cartões do período com a variação contra o período anterior, o backlog
// por idade, os gráficos dos chamados por dia (decisão 6), a comparação na bandeira com o melhor de
// cada coluna em destaque e a produtividade por equipe e hotel. O proprietário
// vê só os cartões dos hotéis dele. Os números chegam calculados da API; aqui
// só se formatam, no idioma de quem vê. A tela inicial (1c, seção 4 da
// paridade) usa os mesmos cartões, no resumo: os quatro primeiros e a linha do
// backlog dos últimos 14 dias; e só o gráfico do fluxo.
import type { RespostaDosIndicadores, z } from '@hubkeep/contratos';
import { FAIXAS_DE_IDADE_API } from '@hubkeep/contratos';
import { amostraSuficiente } from '@hubkeep/dominio';
import {
  GraficoDeLinhas,
  Indicador,
  Indicadores,
  MensagemVazia,
  MiniLinha,
  Painel,
  Tabela,
} from '@hubkeep/ui';
import { useIntl } from 'react-intl';
import { useT } from '../i18n/cliente';

export type PainelDeIndicadores = z.infer<typeof RespostaDosIndicadores>;
export type IndicadoresNaTela = NonNullable<PainelDeIndicadores['rede']>;
type HotelNaTela = PainelDeIndicadores['hoteis'][number];
type HotelCompleto = Extract<HotelNaTela, { visao: 'completa' }>;
type HotelDoProprietario = Extract<HotelNaTela, { visao: 'cartoes' }>;

const HORA = 3600;
/** Os dias da linha do backlog no resumo da tela inicial. */
export const DIAS_DA_TENDENCIA = 14;

function useFormatos() {
  const t = useT();
  const intl = useIntl();
  const numero = (n: number, casas = 1) =>
    intl.formatNumber(n, { maximumFractionDigits: casas, minimumFractionDigits: 0 });
  const semDado = t('indicadores.sem_dado');
  return {
    numero,
    percentual: (n: number | null) => (n === null ? semDado : `${numero(n)}%`),
    /** O tempo de reparo: em horas abaixo de 24, em dias acima (como no mock). */
    tempo: (horas: number | null) =>
      horas === null
        ? semDado
        : horas < 24
          ? t('indicadores.horas', { n: numero(horas) })
          : t('indicadores.dias', { n: numero(horas / 24) }),
    horas: (segundos: number) => t('indicadores.horas', { n: numero(segundos / HORA) }),
    opcional: (n: number | null, casas = 1) => (n === null ? semDado : numero(n, casas)),
    semDado,
  };
}

/** A variação contra o período anterior: em pontos percentuais nos percentuais. */
function useVariacao() {
  const t = useT();
  const intl = useIntl();
  return (atual: number | null, anterior: number | null | undefined, emPontos = false) => {
    if (atual === null || anterior === null || anterior === undefined) return undefined;
    const valor = intl.formatNumber(atual - anterior, {
      maximumFractionDigits: 1,
      signDisplay: 'exceptZero',
    });
    return t(emPontos ? 'indicadores.variacao_pp' : 'indicadores.variacao', { valor });
  };
}

export function CartoesDoPeriodo({
  atual,
  anterior,
  meta,
  resumo,
}: {
  atual: IndicadoresNaTela;
  anterior: IndicadoresNaTela | null;
  meta: number;
  /** Na tela inicial: só os quatro primeiros, e o backlog com a linha dos últimos dias. */
  resumo?: { serie: PainelDeIndicadores['serie'] };
}) {
  const t = useT();
  const f = useFormatos();
  const variacao = useVariacao();
  const juntar = (...partes: (string | undefined)[]) => partes.filter(Boolean).join(' · ');
  const tomDoSla =
    atual.percentualDeSla === null ? 'neutro' : atual.percentualDeSla >= meta ? 'bom' : 'atencao';
  return (
    <Indicadores rotulo={t('indicadores.rede.titulo')}>
      <Indicador
        rotulo={t('indicadores.backlog')}
        valor={f.numero(atual.backlog)}
        detalhe={variacao(atual.backlog, anterior?.backlog)}
        tendencia={
          resumo ? (
            <MiniLinha
              rotulo={t('indicadores.backlog.tendencia', { dias: DIAS_DA_TENDENCIA })}
              valores={resumo.serie.slice(-DIAS_DA_TENDENCIA).map((d) => d.backlog)}
            />
          ) : undefined
        }
      />
      <Indicador
        rotulo={t('indicadores.sla')}
        valor={f.percentual(atual.percentualDeSla)}
        tom={tomDoSla}
        detalhe={juntar(
          t('indicadores.sla.detalhe', {
            meta,
            dentro: atual.sla.dentroDoPrazo,
            total: atual.sla.total,
            ainda: atual.sla.aindaNoPrazo,
          }),
          atual.sla.pausadoMedioSegundos === null
            ? undefined
            : t('indicadores.sla.pausado', {
                soma: f.horas(atual.sla.pausadoSegundos),
                media: f.horas(atual.sla.pausadoMedioSegundos),
              }),
          variacao(atual.percentualDeSla, anterior?.percentualDeSla, true),
        )}
      />
      <Indicador
        rotulo={t('indicadores.mttr')}
        valor={f.tempo(atual.mttrHoras)}
        detalhe={juntar(
          t('indicadores.mttr.detalhe', {
            mediana: f.tempo(atual.medianaHoras),
            n: atual.corretivasConcluidas,
          }),
          variacao(atual.mttrHoras, anterior?.mttrHoras),
        )}
      />
      <Indicador
        rotulo={t('indicadores.preventiva')}
        valor={f.percentual(atual.percentualDePreventivaEmDia)}
        detalhe={juntar(
          t('indicadores.preventiva.detalhe', {
            emDia: atual.preventiva.emDia,
            total: atual.preventiva.total,
            atrasadas: atual.preventiva.atrasadas,
            ainda: atual.preventiva.aindaNoPrazo,
          }),
          variacao(atual.percentualDePreventivaEmDia, anterior?.percentualDePreventivaEmDia, true),
        )}
      />
      {resumo ? null : <CartoesDoRestoDoPeriodo atual={atual} anterior={anterior} />}
    </Indicadores>
  );
}

/** Os cartões que só o painel de indicadores mostra, depois dos quatro do resumo. */
function CartoesDoRestoDoPeriodo({
  atual,
  anterior,
}: {
  atual: IndicadoresNaTela;
  anterior: IndicadoresNaTela | null;
}) {
  const t = useT();
  const f = useFormatos();
  const variacao = useVariacao();
  const juntar = (...partes: (string | undefined)[]) => partes.filter(Boolean).join(' · ');
  return (
    <>
      <Indicador
        rotulo={t('indicadores.razao')}
        valor={f.opcional(atual.preventivasPorCorretiva, 2)}
        detalhe={juntar(
          t('indicadores.razao.detalhe', {
            preventivas: atual.preventivasConcluidas,
            corretivas: atual.corretivasConcluidas,
            percentual: f.percentual(atual.percentualDePreventivas),
          }),
          variacao(atual.preventivasPorCorretiva, anterior?.preventivasPorCorretiva),
        )}
      />
      <Indicador
        rotulo={t('indicadores.uh_dias')}
        valor={f.numero(atual.uhDias)}
        detalhe={variacao(atual.uhDias, anterior?.uhDias)}
      />
      <Indicador
        rotulo={t('indicadores.chamados_100_uhs')}
        valor={f.opcional(atual.chamadosPor100Uhs)}
        detalhe={juntar(
          t('indicadores.chamados_100_uhs.detalhe', {
            abertos: atual.abertos,
            uhs: atual.uhsAtivas,
          }),
          variacao(atual.chamadosPor100Uhs, anterior?.chamadosPor100Uhs),
        )}
      />
    </>
  );
}

export function BacklogPorIdade({ faixas }: { faixas: IndicadoresNaTela['backlogPorIdade'] }) {
  const t = useT();
  const f = useFormatos();
  return (
    <Painel titulo={t('indicadores.idade.titulo')} nivel={3}>
      <Tabela legenda={t('indicadores.idade.titulo')}>
        <thead>
          <tr>
            <th scope="col">{t('indicadores.idade.coluna.faixa')}</th>
            <th scope="col" className="hk-num">
              {t('indicadores.idade.coluna.chamados')}
            </th>
          </tr>
        </thead>
        <tbody>
          {FAIXAS_DE_IDADE_API.map((faixa) => (
            <tr key={faixa} data-faixa={faixa}>
              <td>{t('indicadores.idade.faixa', { faixa })}</td>
              <td className="hk-num">{f.numero(faixas[faixa])}</td>
            </tr>
          ))}
        </tbody>
      </Tabela>
    </Painel>
  );
}

/**
 * Os chamados por dia em dois gráficos, porque as escalas não se misturam: o
 * fluxo (abertos e concluídos no dia) e o backlog no fim do dia. A tabela com
 * os números fica abaixo do primeiro.
 */
export function ChamadosPorDia({
  serie,
  soFluxo = false,
}: {
  serie: PainelDeIndicadores['serie'];
  /** Na tela inicial: só o fluxo de chamados, sem o backlog. */
  soFluxo?: boolean;
}) {
  const t = useT();
  const intl = useIntl();
  const f = useFormatos();
  if (serie.length === 0) return null;
  const dia = (d: string) =>
    intl.formatDate(`${d}T12:00:00Z`, { dateStyle: 'short', timeZone: 'UTC' });
  const eixoX = serie.map((d) => dia(d.dia));
  const formatar = (n: number) => f.numero(n, 0);
  const tabela = (
    <Tabela legenda={t('indicadores.serie.titulo')}>
      <thead>
        <tr>
          <th scope="col">{t('indicadores.serie.coluna.dia')}</th>
          <th scope="col" className="hk-num">
            {t('indicadores.serie.coluna.abertos')}
          </th>
          <th scope="col" className="hk-num">
            {t('indicadores.serie.coluna.encerrados')}
          </th>
          <th scope="col" className="hk-num">
            {t('indicadores.serie.coluna.backlog')}
          </th>
        </tr>
      </thead>
      <tbody>
        {serie.map((d) => (
          <tr key={d.dia}>
            <td>{dia(d.dia)}</td>
            <td className="hk-num">{f.numero(d.abertos)}</td>
            <td className="hk-num">{f.numero(d.encerrados)}</td>
            <td className="hk-num">{f.numero(d.backlog)}</td>
          </tr>
        ))}
      </tbody>
    </Tabela>
  );
  return (
    <>
      <Painel titulo={t('indicadores.grafico.fluxo.titulo')} nivel={3}>
        <GraficoDeLinhas
          rotulo={t('indicadores.grafico.fluxo.titulo')}
          eixoX={eixoX}
          formatar={formatar}
          series={[
            {
              chave: 'abertos',
              rotulo: t('indicadores.serie.coluna.abertos'),
              valores: serie.map((d) => d.abertos),
            },
            {
              chave: 'encerrados',
              rotulo: t('indicadores.serie.coluna.encerrados'),
              valores: serie.map((d) => d.encerrados),
            },
          ]}
          tabela={tabela}
          verTabela={t('indicadores.grafico.ver_tabela')}
        />
      </Painel>
      {soFluxo ? null : (
        <Painel titulo={t('indicadores.serie.coluna.backlog')} nivel={3}>
          <GraficoDeLinhas
            rotulo={t('indicadores.serie.coluna.backlog')}
            eixoX={eixoX}
            formatar={formatar}
            series={[
              {
                chave: 'backlog',
                rotulo: t('indicadores.serie.coluna.backlog'),
                valores: serie.map((d) => d.backlog),
              },
            ]}
          />
        </Painel>
      )}
    </>
  );
}

/**
 * As colunas da comparação e o sentido do melhor: maior ou menor. As de
 * percentual dizem quantos itens entram na conta: o número aparece ao lado, e
 * abaixo do mínimo o hotel não concorre ao destaque (amostra pequena).
 */
const COLUNAS: readonly {
  chave: 'sla' | 'mttr' | 'backlog_100' | 'preventiva' | 'uh_dias' | 'chamados_100';
  valor: (i: IndicadoresNaTela) => number | null;
  melhor: 'maior' | 'menor';
  itens?: (i: IndicadoresNaTela) => number;
}[] = [
  {
    chave: 'sla',
    valor: (i) => i.percentualDeSla,
    melhor: 'maior',
    itens: (i) => i.sla.total,
  },
  { chave: 'mttr', valor: (i: IndicadoresNaTela) => i.mttrHoras, melhor: 'menor' },
  { chave: 'backlog_100', valor: (i: IndicadoresNaTela) => i.backlogPor100Uhs, melhor: 'menor' },
  {
    chave: 'preventiva',
    valor: (i) => i.percentualDePreventivaEmDia,
    melhor: 'maior',
    itens: (i) => i.preventiva.total,
  },
  { chave: 'uh_dias', valor: (i: IndicadoresNaTela) => i.uhDias, melhor: 'menor' },
  { chave: 'chamados_100', valor: (i: IndicadoresNaTela) => i.chamadosPor100Uhs, melhor: 'menor' },
];

/** O valor concorre ao destaque? Nas colunas de percentual, só com a amostra mínima. */
const concorre = (c: (typeof COLUNAS)[number], i: IndicadoresNaTela) =>
  c.valor(i) !== null && (c.itens === undefined || amostraSuficiente(c.itens(i)));

/** O melhor valor de cada coluna entre os hotéis que concorrem; null sem nenhum. */
export function melhoresDaColuna(hoteis: readonly HotelCompleto[]): (number | null)[] {
  return COLUNAS.map((c) => {
    const valores = hoteis
      .filter((h) => concorre(c, h.indicadores))
      .map((h) => c.valor(h.indicadores))
      .filter((v): v is number => v !== null);
    if (valores.length === 0) return null;
    return c.melhor === 'maior' ? Math.max(...valores) : Math.min(...valores);
  });
}

export function ComparacaoNaBandeira({
  bandeira,
  hoteis,
}: {
  bandeira: PainelDeIndicadores['bandeiras'][number];
  hoteis: readonly HotelCompleto[];
}) {
  const t = useT();
  const f = useFormatos();
  const daBandeira = hoteis.filter((h) => h.bandeiraId === bandeira.id);
  const melhores = melhoresDaColuna(daBandeira);
  const celula = (i: IndicadoresNaTela, n: number, destaque: boolean) => {
    const coluna = COLUNAS[n] as (typeof COLUNAS)[number];
    const v = coluna.valor(i);
    const itens = coluna.itens?.(i);
    const texto =
      coluna.chave === 'mttr'
        ? f.tempo(v)
        : itens === undefined
          ? f.opcional(v)
          : amostraSuficiente(itens)
            ? t('indicadores.comparacao.percentual', { valor: f.percentual(v), n: itens })
            : t('indicadores.comparacao.amostra_pequena', { n: itens });
    const melhor = destaque && concorre(coluna, i) && v === melhores[n];
    return (
      <td key={coluna.chave} className="hk-num" data-melhor={melhor ? '' : undefined}>
        {melhor ? <strong>{texto}</strong> : texto}
        {melhor ? (
          <span className="hk-so-leitor"> {t('indicadores.comparacao.melhor')}</span>
        ) : null}
      </td>
    );
  };
  return (
    <Tabela legenda={t('indicadores.comparacao.legenda', { bandeira: bandeira.nome })}>
      <thead>
        <tr>
          <th scope="col">{t('indicadores.comparacao.coluna.hotel')}</th>
          {COLUNAS.map((c) => (
            <th key={c.chave} scope="col" className="hk-num">
              {t('indicadores.comparacao.coluna', { coluna: c.chave })}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {daBandeira.map((h) => (
          <tr key={h.id}>
            <th scope="row">
              <div>{h.nome}</div>
              <small>{t('indicadores.comparacao.uhs', { n: h.indicadores.uhsAtivas })}</small>
            </th>
            {COLUNAS.map((_, n) => celula(h.indicadores, n, daBandeira.length > 1))}
          </tr>
        ))}
        <tr>
          <th scope="row">{t('indicadores.comparacao.total')}</th>
          {COLUNAS.map((_, n) => celula(bandeira.indicadores, n, false))}
        </tr>
      </tbody>
    </Tabela>
  );
}

export function Produtividade({
  linhas,
  nomeDoHotel,
}: {
  linhas: PainelDeIndicadores['produtividade'];
  nomeDoHotel: (id: string) => string;
}) {
  const t = useT();
  const f = useFormatos();
  return (
    <Painel titulo={t('indicadores.produtividade.titulo')} nivel={3}>
      {linhas.length === 0 ? (
        <MensagemVazia>{t('indicadores.produtividade.vazia')}</MensagemVazia>
      ) : (
        <Tabela legenda={t('indicadores.produtividade.titulo')}>
          <thead>
            <tr>
              <th scope="col">{t('indicadores.produtividade.coluna.hotel')}</th>
              <th scope="col">{t('indicadores.produtividade.coluna.equipe')}</th>
              <th scope="col" className="hk-num">
                {t('indicadores.produtividade.coluna.os')}
              </th>
              <th scope="col" className="hk-num">
                {t('indicadores.produtividade.coluna.horas')}
              </th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={`${l.hotelId}|${l.equipeId ?? ''}`}>
                <td>{nomeDoHotel(l.hotelId)}</td>
                <td>{l.equipeNome ?? t('indicadores.produtividade.sem_equipe')}</td>
                <td className="hk-num">{f.numero(l.osConcluidas)}</td>
                <td className="hk-num">{f.horas(l.segundosApontados)}</td>
              </tr>
            ))}
          </tbody>
        </Tabela>
      )}
    </Painel>
  );
}

export function CartoesDoProprietario({ hoteis }: { hoteis: readonly HotelDoProprietario[] }) {
  const t = useT();
  const f = useFormatos();
  if (hoteis.length === 0) return null;
  return (
    <Painel titulo={t('indicadores.proprietario.titulo')} dica={t('indicadores.proprietario.dica')}>
      {hoteis.map((h) => (
        <Indicadores key={h.id} rotulo={h.nome}>
          <Indicador
            rotulo={t('indicadores.backlog')}
            valor={f.numero(h.cartoes.backlog)}
            detalhe={h.nome}
          />
          <Indicador rotulo={t('indicadores.uh_dias')} valor={f.numero(h.cartoes.uhDias)} />
          <Indicador
            rotulo={t('indicadores.abertos')}
            valor={f.numero(h.cartoes.abertos)}
            detalhe={t('indicadores.chamados_100_uhs.curto', {
              n: f.opcional(h.cartoes.chamadosPor100Uhs),
            })}
          />
        </Indicadores>
      ))}
    </Painel>
  );
}

/** Os hotéis da visão completa e os do proprietário, separados. */
export const separarHoteis = (hoteis: readonly HotelNaTela[]) => ({
  completos: hoteis.filter((h): h is HotelCompleto => h.visao === 'completa'),
  doProprietario: hoteis.filter((h): h is HotelDoProprietario => h.visao === 'cartoes'),
});
