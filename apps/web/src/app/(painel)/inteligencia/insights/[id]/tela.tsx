'use client';
// Página do insight (proposta das telas do 1.0, tela 2): o cabeçalho, "Por
// que estou vendo isso?", os chamados por semana, os chamados da evidência
// (sistêmico) ou o ativo (atenção), e a decisão. No insight sistêmico das
// reclamações, as reclamações da evidência ficam no lugar dos chamados e do
// gráfico deles (C2 do ADR-047, D3). A decisão é o único lugar de decidir no
// painel (decisão 2). Sem linha do tempo no 1.0 (Cesar, 10/10/2026): só as
// datas do próprio registro.
import type { RespostaDoInsight, z } from '@hubkeep/contratos';
import type { Chave } from '@hubkeep/i18n';
import {
  type ConfigAtencao,
  type Explicacao,
  LIMITE_INSIGHT_PADRAO,
  type Score,
  type SinalSistemico,
  explicacaoDoScore,
  explicacaoDoSinal,
} from '@hubkeep/inteligencia';
import {
  AreaDeTexto,
  Botao,
  Campo,
  MensagemVazia,
  Nota,
  Painel,
  Selecao,
  Selo,
  Tabela,
} from '@hubkeep/ui';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { type ErroDaApi, chamarApi } from '../../../../../cliente/api';
import { Aviso, type AvisoDeAcao } from '../../../../../cliente/aviso';
import { useT } from '../../../../../i18n/cliente';
import {
  ChamadosPorSemana,
  type Nomes,
  type Reclamacoes,
  SeloDaFaixa,
  SeloDoEstado,
  TabelaDeEfetividade,
  TabelaDeReclamacoes,
  useDatas,
  useEscopoDoInsight,
  useNomeDaFaixa,
  useTituloDoInsight,
} from '../../comum';

type Pagina = z.infer<typeof RespostaDoInsight>;
type InsightDaPagina = Pagina['insight'];
type Acao = InsightDaPagina['acoes'][number];

const MOTIVOS = ['nao_relevante', 'substituido'] as const;

const ehScore = (d: unknown): d is Score<ConfigAtencao> =>
  typeof d === 'object' && d !== null && Array.isArray((d as Score).componentes);
const ehSinal = (d: unknown): d is SinalSistemico =>
  typeof d === 'object' && d !== null && typeof (d as SinalSistemico).regra === 'string';

export function TelaDoInsight({ id }: { id: string }) {
  const t = useT();
  const [pagina, setPagina] = useState<Pagina | null>(null);
  const [aviso, setAviso] = useState<AvisoDeAcao | null>(null);

  const carregar = useCallback(async () => {
    const r = await chamarApi<Pagina>(`/api/v1/inteligencia/insights/${id}`);
    if (!r.ok) {
      setAviso({ tipo: 'erro', erro: r.erro });
      return;
    }
    setPagina(r.dados);
  }, [id]);
  useEffect(() => {
    void carregar();
  }, [carregar]);

  return (
    <div className="hk-pilha">
      <Link href="/inteligencia/insights" className="hk-voltar">
        {t('inteligencia.voltar')}
      </Link>
      <Aviso aviso={aviso} />
      {pagina === null ? (
        !aviso && <MensagemVazia>{t('comum.carregando')}</MensagemVazia>
      ) : (
        <ConteudoDoInsight
          pagina={pagina}
          aoDecidir={async (resultado) => {
            setAviso(resultado);
            if (resultado.tipo === 'ok') await carregar();
          }}
        />
      )}
    </div>
  );
}

export function ConteudoDoInsight({
  pagina,
  aoDecidir,
}: {
  pagina: Pagina;
  aoDecidir: (resultado: AvisoDeAcao) => Promise<void>;
}) {
  const t = useT();
  const titulo = useTituloDoInsight();
  const escopo = useEscopoDoInsight();
  const { data } = useDatas();
  const { insight, nomes } = pagina;
  const sistemico = insight.tipo === 'sistemico';
  return (
    <>
      <Painel
        titulo={titulo(insight, nomes)}
        dica={t('inteligencia.insight.tipo', { tipo: insight.tipo })}
        acoes={
          <span className="hk-em-linha">
            <SeloDaFaixa faixa={insight.faixa} />
            {insight.valor !== null && (
              <Selo tom="cinza">{t('inteligencia.pagina.score', { valor: insight.valor })}</Selo>
            )}
          </span>
        }
      >
        <p>{escopo(insight, nomes)}</p>
        {insight.hotelId === null && (
          <p className="hk-suave">
            {insight.hotelIds.map((h) => nomes.hoteis[h] ?? t('inteligencia.sem_valor')).join(', ')}
          </p>
        )}
        <p className="hk-suave">
          {[
            t('inteligencia.pagina.datas', {
              aberto: data(insight.primeiraDeteccaoEm),
              ultima: data(insight.ultimaDeteccaoEm),
            }),
            insight.encerradoEm
              ? t('inteligencia.pagina.encerrado', { data: data(insight.encerradoEm) })
              : null,
          ]
            .filter(Boolean)
            .join(' ')}
        </p>
        {insight.substitui && (
          <p className="hk-em-linha">
            <span>{t('inteligencia.pagina.substitui')}</span>
            <Link href={`/inteligencia/insights/${insight.substitui}`}>
              {t('inteligencia.pagina.ver_anterior')}
            </Link>
          </p>
        )}
        {insight.substituidoPor && (
          <p className="hk-em-linha">
            <span>{t('inteligencia.pagina.substituido')}</span>
            <Link href={`/inteligencia/insights/${insight.substituidoPor}`}>
              {t('inteligencia.pagina.ver_novo')}
            </Link>
          </p>
        )}
      </Painel>
      <div className="hk-grade" data-colunas="2-1">
        <div className="hk-pilha">
          <PorQue insight={insight} />
          {pagina.reclamacoes ? (
            <ReclamacoesDoInsight reclamacoes={pagina.reclamacoes} />
          ) : (
            <>
              <Painel
                titulo={t('inteligencia.semanas.titulo')}
                dica={t(
                  sistemico ? 'inteligencia.semanas.dica_sistemico' : 'inteligencia.semanas.dica',
                )}
              >
                <ChamadosPorSemana serie={pagina.serie} />
              </Painel>
              {sistemico ? (
                <ChamadosDoInsight chamados={pagina.chamados} nomes={nomes} />
              ) : (
                <AtivoDoInsight insight={insight} nomes={nomes} />
              )}
            </>
          )}
          {pagina.efetividade.intervencoes.length > 0 && (
            <Painel
              titulo={t('inteligencia.efetividade.insight.titulo')}
              dica={t('inteligencia.efetividade.insight.dica', {
                data: data(insight.primeiraDeteccaoEm),
              })}
            >
              <TabelaDeEfetividade efetividade={pagina.efetividade} />
            </Painel>
          )}
        </div>
        <Decisao insight={insight} nomes={nomes} aoDecidir={aoDecidir} />
      </div>
    </>
  );
}

function ListaDeExplicacoes({ itens }: { itens: readonly Explicacao[] }) {
  const t = useT();
  if (!itens.length) return <p>{t('inteligencia.explicacao.vazia')}</p>;
  return (
    <ul>
      {itens.map((e) => (
        <li key={e.chave}>{t(e.chave as Chave, e.valores)}</li>
      ))}
    </ul>
  );
}

function PorQue({ insight }: { insight: InsightDaPagina }) {
  const t = useT();
  const nomeDaFaixa = useNomeDaFaixa();
  const d = insight.detalhe;
  return (
    <Painel titulo={t('inteligencia.explicacao.titulo')}>
      {ehSinal(d) ? (
        <>
          <p>
            <strong>{t('inteligencia.sistemico.regra', { regra: d.regra })}</strong>
          </p>
          <p>{t(explicacaoDoSinal(d).chave as Chave, explicacaoDoSinal(d).valores)}</p>
          <Nota tom="atencao">{t('inteligencia.aviso.sinal')}</Nota>
        </>
      ) : ehScore(d) ? (
        <>
          <p>
            {t('inteligencia.pagina.atencao_resumo', {
              valor: insight.valor ?? t('inteligencia.sem_valor'),
              faixa: nomeDaFaixa(insight.faixa),
              limite: d.configuracao?.limiteInsight ?? LIMITE_INSIGHT_PADRAO,
            })}
          </p>
          <ListaDeExplicacoes itens={explicacaoDoScore(d)} />
          <Nota tom="atencao">{t('inteligencia.aviso.score')}</Nota>
        </>
      ) : (
        <p>{t('inteligencia.explicacao.vazia')}</p>
      )}
    </Painel>
  );
}

function ChamadosDoInsight({ chamados, nomes }: { chamados: Pagina['chamados']; nomes: Nomes }) {
  const t = useT();
  const { data } = useDatas();
  return (
    <Painel titulo={t('inteligencia.chamados.titulo')} dica={t('inteligencia.chamados.dica')}>
      {chamados.length === 0 ? (
        <MensagemVazia>{t('inteligencia.chamados.vazio')}</MensagemVazia>
      ) : (
        <Tabela legenda={t('inteligencia.chamados.titulo')}>
          <thead>
            <tr>
              <th scope="col">{t('inteligencia.chamados.coluna.chamado')}</th>
              <th scope="col">{t('inteligencia.chamados.coluna.hotel')}</th>
              <th scope="col">{t('inteligencia.chamados.coluna.aberto_em')}</th>
              <th scope="col">{t('inteligencia.chamados.coluna.situacao')}</th>
            </tr>
          </thead>
          <tbody>
            {chamados.map((c) => (
              <tr key={c.id}>
                <td>
                  <Link href={`/chamados/${c.id}`}>{c.descricao}</Link>
                </td>
                <td>{nomes.hoteis[c.hotelId] ?? t('inteligencia.sem_valor')}</td>
                <td>{data(c.abertoEm)}</td>
                <td>{t('auditoria.valor.estado', { valor: c.estado })}</td>
              </tr>
            ))}
          </tbody>
        </Tabela>
      )}
    </Painel>
  );
}

/**
 * As reclamações da evidência, até 50, as mais recentes. Quem lê o insight
 * mas não as reclamações do hotel vê só o total (a RLS filtra).
 */
function ReclamacoesDoInsight({ reclamacoes }: { reclamacoes: Reclamacoes }) {
  const t = useT();
  const total = reclamacoes.total ?? reclamacoes.sinais.length;
  return (
    <Painel
      titulo={t('inteligencia.reclamacoes.insight.titulo')}
      dica={t('inteligencia.reclamacoes.insight.dica', { total })}
      acoes={<Link href="/inteligencia/sinais">{t('inteligencia.reclamacoes.abrir_fila')}</Link>}
    >
      {reclamacoes.sinais.length === 0 ? (
        <MensagemVazia>{t('inteligencia.reclamacoes.insight.sem_acesso', { total })}</MensagemVazia>
      ) : (
        <>
          <TabelaDeReclamacoes
            reclamacoes={reclamacoes}
            legenda={t('inteligencia.reclamacoes.insight.titulo')}
          />
          {reclamacoes.limitada && (
            <Nota>
              {t('inteligencia.reclamacoes.limitada', {
                mostradas: reclamacoes.sinais.length,
              })}
            </Nota>
          )}
        </>
      )}
    </Painel>
  );
}

function AtivoDoInsight({ insight, nomes }: { insight: InsightDaPagina; nomes: Nomes }) {
  const t = useT();
  const ativo = insight.escopo['ativoId'];
  if (!ativo) return null;
  return (
    <Painel titulo={t('inteligencia.pagina.ativo_titulo')}>
      <p>{nomes.ativos[ativo] ?? t('inteligencia.sem_valor')}</p>
      {insight.hotelId && nomes.hoteis[insight.hotelId] && (
        <p className="hk-suave">{nomes.hoteis[insight.hotelId]}</p>
      )}
      <Link href={`/inteligencia/ativos/${ativo}`}>{t('inteligencia.pagina.ver_ativo')}</Link>
    </Painel>
  );
}

function QuemDecide({ insight, nomes }: { insight: InsightDaPagina; nomes: Nomes }) {
  const t = useT();
  if (insight.hotelId)
    return (
      <>{t('inteligencia.quem_decide.hotel', { hotel: nomes.hoteis[insight.hotelId] ?? '' })}</>
    );
  const bandeira = insight.bandeiraId ? nomes.bandeiras[insight.bandeiraId] : undefined;
  return (
    <>
      {bandeira
        ? t('inteligencia.quem_decide.rede_bandeira', {
            quantidade: insight.hotelIds.length,
            bandeira,
          })
        : t('inteligencia.quem_decide.rede_grupo', { quantidade: insight.hotelIds.length })}
    </>
  );
}

function Decisao({
  insight,
  nomes,
  aoDecidir,
}: {
  insight: InsightDaPagina;
  nomes: Nomes;
  aoDecidir: (resultado: AvisoDeAcao) => Promise<void>;
}) {
  const t = useT();
  const { data } = useDatas();
  const [aberta, setAberta] = useState<'resolver' | 'descartar' | null>(null);
  const [motivo, setMotivo] = useState<(typeof MOTIVOS)[number]>('nao_relevante');
  const [nota, setNota] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function decidir(acao: Acao) {
    setEnviando(true);
    const r = await chamarApi<unknown>(`/api/v1/inteligencia/insights/${insight.id}/decisao`, {
      method: 'POST',
      body: JSON.stringify({
        acao,
        versao: insight.versao,
        ...(acao === 'resolver' || acao === 'descartar' ? { nota } : {}),
        ...(acao === 'descartar' ? { motivoDeDescarte: motivo } : {}),
      }),
    });
    setEnviando(false);
    if (r.ok) {
      setAberta(null);
      setNota('');
    }
    await aoDecidir(r.ok ? { tipo: 'ok' } : { tipo: 'erro', erro: r.erro as ErroDaApi });
  }

  return (
    <Painel titulo={t('inteligencia.decisao.titulo')}>
      <div className="hk-pilha">
        <p className="hk-em-linha">
          <SeloDoEstado estado={insight.estado} />
          {insight.motivoDeDescarte && (
            <span className="hk-suave">
              {t('inteligencia.insight.motivo_descarte', { motivo: insight.motivoDeDescarte })}
            </span>
          )}
        </p>
        <p>
          {insight.responsavelId
            ? t('inteligencia.decisao.responsavel', {
                nome: nomes.pessoas[insight.responsavelId] ?? t('inteligencia.sem_valor'),
              })
            : t('inteligencia.sem_responsavel')}
        </p>
        {insight.encerradoEm && (
          <p className="hk-suave">
            {t('inteligencia.decisao.encerrado', { data: data(insight.encerradoEm) })}
          </p>
        )}
        {insight.nota && <p className="hk-suave">{insight.nota}</p>}
        {insight.podeDecidir ? (
          insight.acoes.length > 0 && (
            <div className="hk-linha-de-botoes">
              {insight.acoes.map((acao) => (
                <Botao
                  key={acao}
                  variante={acao === 'descartar' ? 'padrao' : 'primario'}
                  disabled={enviando}
                  aria-pressed={acao === aberta}
                  onClick={() =>
                    acao === 'resolver' || acao === 'descartar'
                      ? setAberta(aberta === acao ? null : acao)
                      : void decidir(acao)
                  }
                >
                  {t('inteligencia.insight.acao', { acao })}
                </Botao>
              ))}
            </div>
          )
        ) : (
          <Nota tom="info">{t('inteligencia.decisao.nao_decide')}</Nota>
        )}
        {aberta && (
          <form
            className="hk-pilha"
            onSubmit={(e) => {
              e.preventDefault();
              void decidir(aberta);
            }}
          >
            {aberta === 'descartar' && (
              <>
                <Campo rotulo={t('inteligencia.decisao.motivo')}>
                  {(p) => (
                    <Selecao
                      {...p}
                      value={motivo}
                      onChange={(e) => setMotivo(e.target.value as (typeof MOTIVOS)[number])}
                    >
                      {MOTIVOS.map((m) => (
                        <option key={m} value={m}>
                          {t('inteligencia.insight.motivo_descarte', { motivo: m })}
                        </option>
                      ))}
                    </Selecao>
                  )}
                </Campo>
                <p className="hk-suave">{t('inteligencia.decisao.silencio')}</p>
              </>
            )}
            <Campo rotulo={t('inteligencia.decisao.nota')}>
              {(p) => (
                <AreaDeTexto
                  {...p}
                  required
                  maxLength={500}
                  value={nota}
                  placeholder={t('inteligencia.decisao.nota_dica', { acao: aberta })}
                  onChange={(e) => setNota(e.target.value)}
                />
              )}
            </Campo>
            <div className="hk-linha-de-botoes">
              <Botao type="submit" variante="primario" disabled={enviando}>
                {t('inteligencia.insight.acao', { acao: aberta })}
              </Botao>
              <Botao type="button" onClick={() => setAberta(null)}>
                {t('inteligencia.decisao.cancelar')}
              </Botao>
            </div>
          </form>
        )}
        <p className="hk-suave hk-em-linha">
          <strong>{t('inteligencia.decisao.quem_decide')}</strong>
          <span>
            <QuemDecide insight={insight} nomes={nomes} />
          </span>
        </p>
      </div>
    </Painel>
  );
}
