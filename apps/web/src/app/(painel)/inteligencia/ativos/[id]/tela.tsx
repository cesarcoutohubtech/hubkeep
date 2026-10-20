'use client';
// Detalhe do ativo no Intelligence (proposta das telas do 1.0, tela 3): os
// indicadores, os três fatores que mais pesaram, a atenção dos últimos 90 dias
// (o resultado original de cada dia), a composição do score, como o resultado
// foi gravado (a condição do Cesar no ADR-036), os insights do ativo, o sinal
// de substituição (proposta de 16/10/2026, Cesar e Kaio), o impacto no hóspede
// com as reclamações ligadas ao ativo (C2 do ADR-047, 17/10/2026) e as
// intervenções nele, com o antes e depois (adendo ao ADR-033, 15/10/2026). A página não decide
// nada: a decisão é só na página do insight (decisão 2), e a de reparar ou
// substituir é da equipe.
import type { RespostaDoAtivoNoIntelligence, z } from '@hubkeep/contratos';
import type { Chave } from '@hubkeep/i18n';
import {
  type ConfigAtencao,
  LIMITE_INSIGHT_PADRAO,
  type Score,
  chaveDoNomeDoComponente,
  detalhamentoDoScore,
  explicacaoDoScore,
} from '@hubkeep/inteligencia';
import {
  Botao,
  Dados,
  Indicador,
  Indicadores,
  MensagemVazia,
  Nota,
  Painel,
  Selo,
  Tabela,
  type TomDeSelo,
} from '@hubkeep/ui';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { type ErroDaApi, chamarApi } from '../../../../../cliente/api';
import { Aviso } from '../../../../../cliente/aviso';
import { useT } from '../../../../../i18n/cliente';
import {
  AtencaoNosDias,
  type Reclamacoes,
  SeloDaFaixa,
  SeloDoEstado,
  TabelaDeEfetividade,
  TabelaDeReclamacoes,
  useDatas,
  useNomeDaFaixa,
  useNumeroDoInsight,
} from '../../comum';

type Pagina = z.infer<typeof RespostaDoAtivoNoIntelligence>;

const ehScore = (d: unknown): d is Score<ConfigAtencao> =>
  typeof d === 'object' && d !== null && Array.isArray((d as Score).componentes);

/** O número de um campo da evidência de um componente do score, se houver. */
function evidenciaDe(score: Score, componente: string, campo: string): number | null {
  const v = score.componentes.find((c) => c.chave === componente)?.evidencia[campo];
  return typeof v === 'number' ? v : null;
}

/** A fonte do impacto no hóspede gravada na atenção 7 (D1 do ADR-047); null nas versões antes dela. */
function fonteDoImpacto(score: Score | null): 'reclamacoes' | 'chamados' | null {
  const v = score?.componentes.find((c) => c.chave === 'impacto_hospede')?.evidencia['fonte'];
  return v === 'reclamacoes' || v === 'chamados' ? v : null;
}

/** Os componentes do Guest Impact Score, na ordem do PRD. */
const COMPONENTES_DO_IMPACTO = [
  'volume',
  'severidade',
  'recorrencia',
  'amplitude',
  'operacional',
] as const;

export function TelaDoAtivo({ id }: { id: string }) {
  const t = useT();
  const [pagina, setPagina] = useState<Pagina | null>(null);
  const [erro, setErro] = useState<ErroDaApi | null>(null);

  const carregar = useCallback(async () => {
    const r = await chamarApi<Pagina>(`/api/v1/inteligencia/ativos/${id}`);
    if (!r.ok) {
      setErro(r.erro);
      return;
    }
    setErro(null);
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
      <Aviso aviso={erro && { tipo: 'erro', erro }} />
      {pagina === null ? (
        !erro && <MensagemVazia>{t('comum.carregando')}</MensagemVazia>
      ) : (
        <ConteudoDoAtivo pagina={pagina} />
      )}
    </div>
  );
}

export function ConteudoDoAtivo({ pagina }: { pagina: Pagina }) {
  const t = useT();
  const nomeDaFaixa = useNomeDaFaixa();
  const { numero } = useDatas();
  const { ativo, atual, nomes } = pagina;
  const score = atual && ehScore(atual.detalheAtencao) ? atual.detalheAtencao : null;
  const limite = score?.configuracao?.limiteInsight ?? LIMITE_INSIGHT_PADRAO;
  const horas = score && evidenciaDe(score, 'parada', 'horas');
  const impacto = score && evidenciaDe(score, 'impacto_hospede', 'score');
  const pelasReclamacoes = fonteDoImpacto(score) === 'reclamacoes';
  const semValor = t('inteligencia.sem_valor');
  return (
    <>
      <Painel
        titulo={ativo.nome}
        dica={t('inteligencia.ativo.titulo')}
        acoes={atual ? <SeloDaFaixa faixa={atual.faixa} /> : undefined}
      >
        <p>{nomes.hoteis[ativo.hotelId] ?? semValor}</p>
      </Painel>
      {atual === null ? (
        <>
          <MensagemVazia>
            {t('inteligencia.ativo.sem_resultado', { ativo: ativo.nome })}
          </MensagemVazia>
          <ImpactoNoHospede score={null} reclamacoes={pagina.reclamacoes} />
        </>
      ) : (
        <>
          <Indicadores rotulo={t('inteligencia.ativo.indicadores')}>
            <Indicador
              rotulo={t('inteligencia.ativo.atencao')}
              valor={atual.atencao ?? semValor}
              unidade={t('inteligencia.ativo.de_100')}
              detalhe={t('inteligencia.ativo.atencao_detalhe', {
                faixa: nomeDaFaixa(atual.faixa),
                limite,
              })}
              tom={atual.atencao !== null && atual.atencao >= limite ? 'atencao' : 'neutro'}
            />
            <Indicador
              rotulo={t('inteligencia.componente.atencao_ativo.criticidade')}
              valor={ativo.criticidade ?? semValor}
              unidade={t('inteligencia.ativo.de_5')}
            />
            <Indicador
              rotulo={t('inteligencia.componente.atencao_ativo.parada')}
              valor={horas === null ? semValor : numero(horas)}
              unidade={t('inteligencia.ativo.horas')}
              detalhe={t('inteligencia.ativo.na_janela')}
            />
            {pelasReclamacoes ? (
              <Indicador
                rotulo={t('inteligencia.componente.atencao_ativo.impacto_hospede')}
                valor={impacto ?? semValor}
                unidade={t('inteligencia.ativo.de_100')}
                detalhe={t('inteligencia.ativo.pelas_reclamacoes')}
              />
            ) : (
              <Indicador
                rotulo={t('inteligencia.componente.atencao_ativo.impacto_hospede')}
                valor={
                  impacto === null
                    ? semValor
                    : t('inteligencia.ativo.percentual', { valor: impacto })
                }
                detalhe={t('inteligencia.ativo.dos_chamados')}
              />
            )}
          </Indicadores>
          <div className="hk-grade" data-colunas="2-1">
            <div className="hk-pilha">
              <Painel titulo={t('inteligencia.explicacao.titulo')}>
                {score && explicacaoDoScore(score).length > 0 ? (
                  <ul>
                    {explicacaoDoScore(score).map((e) => (
                      <li key={e.chave}>{t(e.chave as Chave, e.valores)}</li>
                    ))}
                  </ul>
                ) : (
                  <p>{t('inteligencia.explicacao.vazia')}</p>
                )}
                <Nota tom="atencao">{t('inteligencia.aviso.score_ativo')}</Nota>
              </Painel>
              <ImpactoNoHospede score={score} reclamacoes={pagina.reclamacoes} />
              <Painel
                titulo={t('inteligencia.serie90.titulo')}
                dica={t('inteligencia.serie90.dica', { limite })}
              >
                <AtencaoNosDias serie={pagina.serie} limite={limite} />
              </Painel>
              {score && <Composicao score={score} atencao={atual.atencao} />}
            </div>
            <div className="hk-pilha">
              <Gravado atual={atual} recalculos={pagina.recalculos} limite={limite} />
              <InsightsDoAtivo pagina={pagina} />
            </div>
          </div>
        </>
      )}
      {pagina.substituicao && <SinalDeSubstituicao substituicao={pagina.substituicao} />}
      <Painel
        titulo={t('inteligencia.efetividade.ativo.titulo')}
        dica={t('inteligencia.efetividade.dica')}
      >
        <TabelaDeEfetividade
          efetividade={pagina.efetividade}
          vazio={t('inteligencia.efetividade.ativo.vazio')}
        />
      </Painel>
    </>
  );
}

/**
 * O impacto no hóspede (C2 do ADR-047): a fonte e, pelas reclamações, os
 * componentes do Guest Impact Score como o job gravou; depois, as reclamações
 * ligadas ao ativo na janela da política, as confirmadas (que pesam) e as
 * possíveis (que não pesam, D2).
 */
function ImpactoNoHospede({
  score,
  reclamacoes,
}: {
  score: Score | null;
  reclamacoes: Reclamacoes;
}) {
  const t = useT();
  const { numero, percentual } = useDatas();
  const fonte = fonteDoImpacto(score);
  const valor = score && evidenciaDe(score, 'impacto_hospede', 'score');
  const dias = reclamacoes.janelaDias ?? 0;
  const semValor = t('inteligencia.sem_valor');
  const componente = (chave: string) => {
    const campo = (prefixo: string) =>
      score &&
      evidenciaDe(
        score,
        'impacto_hospede',
        `${prefixo}${chave.charAt(0).toUpperCase()}${chave.slice(1)}`,
      );
    return { valor: campo('valor'), peso: campo('peso'), pontos: campo('pontos') };
  };
  const comComponentes = COMPONENTES_DO_IMPACTO.some((c) => componente(c).peso !== null);
  return (
    <Painel
      titulo={t('inteligencia.impacto.titulo')}
      dica={t('inteligencia.impacto.dica', { dias })}
    >
      {fonte !== null && valor !== null && (
        <p>{t('inteligencia.impacto.resumo', { fonte, valor })}</p>
      )}
      {fonte === 'reclamacoes' &&
        (comComponentes ? (
          <Tabela legenda={t('inteligencia.impacto.componentes')}>
            <thead>
              <tr>
                <th scope="col">{t('inteligencia.impacto.coluna.componente')}</th>
                <th scope="col" className="hk-num">
                  {t('inteligencia.impacto.coluna.valor')}
                </th>
                <th scope="col" className="hk-num">
                  {t('inteligencia.impacto.coluna.peso')}
                </th>
                <th scope="col" className="hk-num">
                  {t('inteligencia.impacto.coluna.pontos')}
                </th>
              </tr>
            </thead>
            <tbody>
              {COMPONENTES_DO_IMPACTO.map((chave) => {
                const c = componente(chave);
                return (
                  <tr key={chave}>
                    <td>{t('inteligencia.impacto.componente', { componente: chave })}</td>
                    <td className="hk-num">
                      {c.valor === null ? t('inteligencia.impacto.sem_dado') : percentual(c.valor)}
                    </td>
                    <td className="hk-num">{c.peso === null ? semValor : percentual(c.peso)}</td>
                    <td className="hk-num">{c.pontos === null ? semValor : numero(c.pontos)}</td>
                  </tr>
                );
              })}
            </tbody>
          </Tabela>
        ) : (
          <Nota>{t('inteligencia.impacto.sem_componentes')}</Nota>
        ))}
      {reclamacoes.sinais.length === 0 ? (
        <MensagemVazia>{t('inteligencia.reclamacoes.ativo.vazio', { dias })}</MensagemVazia>
      ) : (
        <>
          <TabelaDeReclamacoes
            reclamacoes={reclamacoes}
            legenda={t('inteligencia.reclamacoes.ativo.titulo', { dias })}
            comPeso
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

/** A composição do score; os UH-dias numa linha discreta no fim (decisão 5). */
function Composicao({ score, atencao }: { score: Score; atencao: number | null }) {
  const t = useT();
  const { numero, percentual } = useDatas();
  const d = detalhamentoDoScore(score);
  const semValor = t('inteligencia.sem_valor');
  const linhas = d.linhas.filter((l) => l.componente !== 'uh_dias');
  return (
    <Painel titulo={t('inteligencia.composicao.titulo')}>
      <Tabela legenda={t('inteligencia.composicao.titulo')}>
        <thead>
          <tr>
            <th scope="col">{t('inteligencia.composicao.coluna.componente')}</th>
            <th scope="col" className="hk-num">
              {t('inteligencia.composicao.coluna.valor')}
            </th>
            <th scope="col" className="hk-num">
              {t('inteligencia.composicao.coluna.peso')}
            </th>
            <th scope="col" className="hk-num">
              {t('inteligencia.composicao.coluna.peso_usado')}
            </th>
            <th scope="col" className="hk-num">
              {t('inteligencia.composicao.coluna.pontos')}
            </th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => (
            <tr key={l.componente}>
              <td>
                {t(l.chaveDoNome as Chave)}
                {l.nota && (
                  <>
                    <br />
                    <span className="hk-suave">{t(l.nota.chave as Chave, l.nota.valores)}</span>
                  </>
                )}
              </td>
              <td className="hk-num">{l.valor === null ? semValor : percentual(l.valor)}</td>
              <td className="hk-num">{percentual(l.peso)}</td>
              <td className="hk-num">{l.semDado ? semValor : percentual(l.pesoUsado)}</td>
              <td className="hk-num">
                <strong>{numero(l.pontos)}</strong>
              </td>
            </tr>
          ))}
          <tr>
            <td colSpan={4}>
              <strong>{t('inteligencia.composicao.total')}</strong>
            </td>
            <td className="hk-num">
              <strong>{atencao ?? semValor}</strong>
            </td>
          </tr>
        </tbody>
      </Tabela>
      {d.chaveDoAviso && (
        <p className="hk-suave">
          {t(d.chaveDoAviso as Chave, {
            componentes: d.semDadoComPeso
              .map((c) => t(chaveDoNomeDoComponente(score, c) as Chave))
              .join(', '),
            ...d.valoresDoAviso,
          })}
        </p>
      )}
      <p className="hk-suave">{t('inteligencia.composicao.uh_dias')}</p>
    </Painel>
  );
}

type Substituicao = NonNullable<Pagina['substituicao']>;
type Criterio = Substituicao['criterios'][number];

const TOM_DO_SINAL: Readonly<Record<Substituicao['sinal'], TomDeSelo>> = {
  sem_sinal: 'cinza',
  observar: 'azul',
  avaliar_substituicao: 'ambar',
  revisao_necessaria: 'ambar',
};

/**
 * O número do critério como a tela mostra: a criticidade em nível de 1 a 5 (o
 * limite, o primeiro nível que atinge) e o custo sobre a reposição em
 * porcentagem; os outros, como vêm.
 */
function naTela(chave: Criterio['chave'], n: number, limite = false): number {
  if (chave === 'criticidade') return limite ? Math.ceil(n * 5 - 1e-9) : Math.round(n * 5);
  if (chave === 'custoSobreReposicao') return Math.round(n * 100);
  return n;
}

/**
 * O sinal de substituição: o estado, os critérios com o valor e o limite, e a
 * ressalva. É sinal para análise; o custo sobre a reposição, sem dado no 1.0,
 * fica numa linha discreta.
 */
function SinalDeSubstituicao({ substituicao: s }: { substituicao: Substituicao }) {
  const t = useT();
  const { dataHora } = useDatas();
  const semValor = t('inteligencia.sem_valor');
  const semReposicao = s.criterios.some(
    (c) => c.chave === 'custoSobreReposicao' && c.atingido === null,
  );
  const linhas = s.criterios.filter(
    (c) => !(c.chave === 'custoSobreReposicao' && c.atingido === null),
  );
  const resultado = (c: Criterio) =>
    c.atingido === null ? 'sem_dado' : c.atingido ? 'atingido' : 'nao_atingido';
  return (
    <Painel
      titulo={t('inteligencia.substituicao.titulo')}
      dica={t('inteligencia.substituicao.dica')}
      acoes={
        <Selo tom={TOM_DO_SINAL[s.sinal]}>
          {t('inteligencia.substituicao.sinal', { sinal: s.sinal })}
        </Selo>
      }
    >
      <p>
        {t('inteligencia.substituicao.resumo', {
          atingidos: s.atingidos,
          avaliados: s.avaliados,
        })}
      </p>
      {s.sinal === 'revisao_necessaria' && (
        <Nota tom="atencao">{t('inteligencia.substituicao.garantia')}</Nota>
      )}
      <Tabela legenda={t('inteligencia.substituicao.titulo')}>
        <thead>
          <tr>
            <th scope="col">{t('inteligencia.substituicao.coluna.criterio')}</th>
            <th scope="col" className="hk-num">
              {t('inteligencia.substituicao.coluna.valor')}
            </th>
            <th scope="col" className="hk-num">
              {t('inteligencia.substituicao.coluna.limite')}
            </th>
            <th scope="col">{t('inteligencia.substituicao.coluna.resultado')}</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((c) => (
            <tr key={c.chave}>
              <th scope="row">{t('inteligencia.substituicao.criterio', { chave: c.chave })}</th>
              <td className="hk-num">
                {c.valor === null
                  ? semValor
                  : t('inteligencia.substituicao.valor', {
                      chave: c.chave,
                      valor: naTela(c.chave, c.valor),
                    })}
              </td>
              <td className="hk-num">
                {t('inteligencia.substituicao.limite', {
                  limite: t('inteligencia.substituicao.valor', {
                    chave: c.chave,
                    valor: naTela(c.chave, c.limite, true),
                  }),
                })}
              </td>
              <td>{t('inteligencia.substituicao.resultado', { resultado: resultado(c) })}</td>
            </tr>
          ))}
        </tbody>
      </Tabela>
      {semReposicao && <p className="hk-suave">{t('inteligencia.substituicao.sem_reposicao')}</p>}
      <Nota tom="info">{t('inteligencia.substituicao.ressalva')}</Nota>
      <p className="hk-suave">
        {t('inteligencia.substituicao.calculado', {
          quando: dataHora(s.calculadoEm),
          versao: s.versao,
        })}
      </p>
    </Painel>
  );
}

function Gravado({
  atual,
  recalculos,
  limite,
}: {
  atual: NonNullable<Pagina['atual']>;
  recalculos: Pagina['recalculos'];
  limite: number;
}) {
  const t = useT();
  const { dataHora } = useDatas();
  // Os recálculos aparecem só a pedido (ADR-036); o painel segue no resultado de cima.
  const [verRecalculos, setVerRecalculos] = useState(false);
  return (
    <Painel titulo={t('inteligencia.gravado.titulo')}>
      <Dados
        itens={[
          { rotulo: t('inteligencia.gravado.calculado_em'), valor: dataHora(atual.calculadoEm) },
          {
            rotulo: t('inteligencia.gravado.calculo'),
            valor: t('inteligencia.gravado.calculo_valor', {
              recalculo: String(atual.recalculo),
              calculo: atual.calculo,
            }),
          },
          {
            rotulo: t('inteligencia.gravado.formula'),
            valor: t('inteligencia.gravado.formula_valor', { versao: atual.versaoFormulaAtencao }),
          },
          {
            rotulo: t('inteligencia.gravado.politica'),
            valor: t('inteligencia.gravado.politica_valor', {
              versao: atual.versaoPolitica,
              limite,
            }),
          },
        ]}
      />
      <p className="hk-suave">{t('inteligencia.gravado.nota')}</p>
      {!verRecalculos ? (
        <div className="hk-linha-de-botoes">
          <Botao onClick={() => setVerRecalculos(true)}>
            {t('inteligencia.gravado.ver_recalculos')}
          </Botao>
        </div>
      ) : recalculos.length === 0 ? (
        <MensagemVazia>{t('inteligencia.gravado.recalculos_vazio')}</MensagemVazia>
      ) : (
        <Recalculos recalculos={recalculos} />
      )}
    </Painel>
  );
}

export function Recalculos({ recalculos }: { recalculos: Pagina['recalculos'] }) {
  const t = useT();
  const { dataHora } = useDatas();
  const nomeDaFaixa = useNomeDaFaixa();
  return (
    <>
      <Tabela legenda={t('inteligencia.gravado.recalculos')}>
        <thead>
          <tr>
            <th scope="col">{t('inteligencia.gravado.calculo')}</th>
            <th scope="col">{t('inteligencia.gravado.calculado_em')}</th>
            <th scope="col" className="hk-num">
              {t('inteligencia.gravado.coluna.atencao')}
            </th>
            <th scope="col" className="hk-num">
              {t('inteligencia.gravado.coluna.reincidencia')}
            </th>
            <th scope="col">{t('inteligencia.gravado.coluna.versoes')}</th>
          </tr>
        </thead>
        <tbody>
          {recalculos.map((r) => (
            <tr key={r.calculo}>
              <td>
                <Selo>
                  {t('inteligencia.gravado.calculo_valor', {
                    recalculo: 'true',
                    calculo: r.calculo,
                  })}
                </Selo>
              </td>
              <td>{dataHora(r.calculadoEm)}</td>
              <td className="hk-num">
                {r.atencao === null
                  ? t('inteligencia.gravado.sem_valor')
                  : t('inteligencia.gravado.atencao_valor', {
                      valor: r.atencao,
                      faixa: nomeDaFaixa(r.faixa),
                    })}
              </td>
              <td className="hk-num">
                {r.reincidencia === null ? t('inteligencia.gravado.sem_valor') : r.reincidencia}
              </td>
              <td>
                {t('inteligencia.gravado.versoes_valor', {
                  atencao: r.versaoFormulaAtencao,
                  reincidencia: r.versaoFormulaReincidencia,
                  politica: r.versaoPolitica,
                })}
              </td>
            </tr>
          ))}
        </tbody>
      </Tabela>
      <p className="hk-suave">{t('inteligencia.gravado.recalculos_nota')}</p>
    </>
  );
}

function InsightsDoAtivo({ pagina }: { pagina: Pagina }) {
  const t = useT();
  const numero = useNumeroDoInsight();
  const { data } = useDatas();
  return (
    <Painel titulo={t('inteligencia.ativo.insights')}>
      {pagina.insights.length === 0 ? (
        <MensagemVazia>{t('inteligencia.ativo.insights_vazio')}</MensagemVazia>
      ) : (
        <ul className="hk-lista">
          {pagina.insights.map((i) => (
            <li key={i.id}>
              <span className="hk-em-linha">
                <Link href={`/inteligencia/insights/${i.id}`}>
                  {t('inteligencia.insight.numero_e_tipo', {
                    numero: numero(i.numero),
                    tipo: t('inteligencia.insight.tipo', { tipo: i.tipo }),
                  })}
                </Link>
                <SeloDoEstado estado={i.estado} />
              </span>
              <br />
              <span className="hk-suave">
                {t('inteligencia.ativo.insight_datas', {
                  aberto: data(i.primeiraDeteccaoEm),
                  ultima: data(i.ultimaDeteccaoEm),
                })}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Painel>
  );
}
