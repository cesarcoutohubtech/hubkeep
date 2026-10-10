'use client';
// Lista de insights do HubKeep Intelligence (proposta das telas do 1.0, tela
// 1): os quatro indicadores, os filtros (estado, tipo, faixa e hotel) e a
// tabela dos insights que quem vê decide (a API recorta pela RLS). Sem o
// módulo ou sem papel que decide, a API responde 404 inteligencia_indisponivel.
import type {
  RespostaDeHoteis,
  RespostaDeInsights,
  RespostaDoResumoDoIntelligence,
  z,
} from '@hubkeep/contratos';
import {
  Campo,
  Indicador,
  Indicadores,
  MensagemVazia,
  Nota,
  Painel,
  Selecao,
  Tabela,
} from '@hubkeep/ui';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { type ErroDaApi, chamarApi } from '../../../../cliente/api';
import { Aviso } from '../../../../cliente/aviso';
import { useT } from '../../../../i18n/cliente';
import {
  SeloDaFaixa,
  SeloDoEstado,
  useDatas,
  useEscopoDoInsight,
  useTituloDoInsight,
} from '../comum';

type Lista = z.infer<typeof RespostaDeInsights>;
type Resumo = z.infer<typeof RespostaDoResumoDoIntelligence>;
type Hoteis = z.infer<typeof RespostaDeHoteis>;

const ESTADOS = [
  'abertos',
  'encerrados',
  'novo',
  'em_revisao',
  'aceito',
  'em_acao',
  'monitorando',
  'resolvido',
  'descartado',
] as const;
const TIPOS = ['atencao_ativo', 'sistemico'] as const;
const FAIXAS = ['critico', 'alta_atencao', 'atencao'] as const;

interface Filtro {
  estado: string;
  tipo: string;
  faixa: string;
  hotelId: string;
}

export function caminhoDaLista(f: Filtro): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) if (v) q.set(k, v);
  const texto = q.toString();
  return `/api/v1/inteligencia/insights${texto ? `?${texto}` : ''}`;
}

export function TelaDeInsights() {
  const t = useT();
  const [filtro, setFiltro] = useState<Filtro>({
    estado: 'abertos',
    tipo: '',
    faixa: '',
    hotelId: '',
  });
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [hoteis, setHoteis] = useState<Hoteis['hoteis']>([]);
  const [lista, setLista] = useState<Lista | null>(null);
  const [erro, setErro] = useState<ErroDaApi | null>(null);

  useEffect(() => {
    void chamarApi<Resumo>('/api/v1/inteligencia/resumo').then((r) =>
      r.ok ? setResumo(r.dados) : setErro(r.erro),
    );
    void chamarApi<Hoteis>('/api/v1/hoteis').then((r) => r.ok && setHoteis(r.dados.hoteis));
  }, []);

  const carregar = useCallback(async (f: Filtro) => {
    const r = await chamarApi<Lista>(caminhoDaLista(f));
    if (!r.ok) {
      setErro(r.erro);
      return;
    }
    setErro(null);
    setLista(r.dados);
  }, []);
  useEffect(() => {
    void carregar(filtro);
  }, [carregar, filtro]);

  const mudar = (campo: keyof Filtro) => (e: { target: { value: string } }) =>
    setFiltro((f) => ({ ...f, [campo]: e.target.value }));

  return (
    <div className="hk-pilha">
      <Nota tom="info">{t('inteligencia.lista.modulo')}</Nota>
      <Aviso aviso={erro && { tipo: 'erro', erro }} />
      {resumo && (
        <Indicadores rotulo={t('inteligencia.indicadores.rotulo')}>
          <Indicador
            rotulo={t('inteligencia.indicador.abertos')}
            valor={resumo.abertos}
            detalhe={t('inteligencia.indicador.abertos_detalhe')}
          />
          <Indicador
            rotulo={t('inteligencia.indicador.alta')}
            valor={resumo.altaAtencaoOuCritico}
            detalhe={t('inteligencia.indicador.alta_detalhe')}
            tom={resumo.altaAtencaoOuCritico > 0 ? 'atencao' : 'neutro'}
          />
          <Indicador
            rotulo={t('inteligencia.indicador.sistemicos')}
            valor={resumo.sistemicos}
            detalhe={t('inteligencia.indicador.sistemicos_detalhe')}
          />
          <Indicador
            rotulo={t('inteligencia.indicador.sem_responsavel')}
            valor={resumo.semResponsavel}
            detalhe={t('inteligencia.indicador.sem_responsavel_detalhe')}
            tom={resumo.semResponsavel > 0 ? 'atencao' : 'neutro'}
          />
        </Indicadores>
      )}
      <Painel titulo={t('inteligencia.lista.titulo')}>
        <form className="hk-filtros" onSubmit={(e) => e.preventDefault()}>
          <Campo rotulo={t('inteligencia.filtro.estado')}>
            {(p) => (
              <Selecao {...p} value={filtro.estado} onChange={mudar('estado')}>
                {ESTADOS.map((e) => (
                  <option key={e} value={e}>
                    {e === 'abertos' || e === 'encerrados'
                      ? t(`inteligencia.filtro.estado.${e}`)
                      : t('inteligencia.insight.estado', { estado: e })}
                  </option>
                ))}
              </Selecao>
            )}
          </Campo>
          <Campo rotulo={t('inteligencia.filtro.tipo')}>
            {(p) => (
              <Selecao {...p} value={filtro.tipo} onChange={mudar('tipo')}>
                <option value="">{t('inteligencia.filtro.tipo.todos')}</option>
                {TIPOS.map((tipo) => (
                  <option key={tipo} value={tipo}>
                    {t('inteligencia.insight.tipo', { tipo })}
                  </option>
                ))}
              </Selecao>
            )}
          </Campo>
          <Campo rotulo={t('inteligencia.filtro.faixa')}>
            {(p) => (
              <Selecao {...p} value={filtro.faixa} onChange={mudar('faixa')}>
                <option value="">{t('inteligencia.filtro.faixa.todas')}</option>
                {FAIXAS.map((faixa) => (
                  <option key={faixa} value={faixa}>
                    {t(`inteligencia.faixa.${faixa}`)}
                  </option>
                ))}
              </Selecao>
            )}
          </Campo>
          {hoteis.length > 1 && (
            <Campo rotulo={t('inteligencia.filtro.hotel')}>
              {(p) => (
                <Selecao {...p} value={filtro.hotelId} onChange={mudar('hotelId')}>
                  <option value="">{t('inteligencia.filtro.hotel.todos')}</option>
                  {hoteis.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.nome}
                    </option>
                  ))}
                </Selecao>
              )}
            </Campo>
          )}
        </form>
        {lista === null ? (
          !erro && <MensagemVazia>{t('comum.carregando')}</MensagemVazia>
        ) : lista.insights.length === 0 ? (
          <MensagemVazia>{t('inteligencia.lista.vazio')}</MensagemVazia>
        ) : (
          <TabelaDeInsights lista={lista} />
        )}
        <p className="hk-suave">{t('inteligencia.lista.rodape')}</p>
      </Painel>
    </div>
  );
}

export function TabelaDeInsights({ lista }: { lista: Lista }) {
  const t = useT();
  const titulo = useTituloDoInsight();
  const escopo = useEscopoDoInsight();
  const { data } = useDatas();
  return (
    <Tabela legenda={t('inteligencia.lista.titulo')}>
      <thead>
        <tr>
          <th scope="col">{t('inteligencia.coluna.faixa')}</th>
          <th scope="col">{t('inteligencia.coluna.o_que_e')}</th>
          <th scope="col">{t('inteligencia.coluna.escopo')}</th>
          <th scope="col" className="hk-num">
            {t('inteligencia.coluna.score')}
          </th>
          <th scope="col">{t('inteligencia.coluna.estado')}</th>
          <th scope="col">{t('inteligencia.coluna.responsavel')}</th>
          <th scope="col">{t('inteligencia.coluna.ultima_deteccao')}</th>
        </tr>
      </thead>
      <tbody>
        {lista.insights.map((i) => (
          <tr key={i.id}>
            <td>
              <SeloDaFaixa faixa={i.faixa} />
            </td>
            <td>
              <span className="hk-suave">{t('inteligencia.insight.tipo', { tipo: i.tipo })}</span>
              <br />
              <Link href={`/inteligencia/insights/${i.id}`}>{titulo(i, lista.nomes)}</Link>
              {i.substitui && (
                <>
                  <br />
                  <Link className="hk-suave" href={`/inteligencia/insights/${i.substitui}`}>
                    {t('inteligencia.insight.substitui_outro')}
                  </Link>
                </>
              )}
              {i.substituidoPor && (
                <>
                  <br />
                  <Link className="hk-suave" href={`/inteligencia/insights/${i.substituidoPor}`}>
                    {t('inteligencia.insight.substituido_por_outro')}
                  </Link>
                </>
              )}
            </td>
            <td>{escopo(i, lista.nomes)}</td>
            <td className="hk-num">{i.valor ?? t('inteligencia.sem_valor')}</td>
            <td>
              <SeloDoEstado estado={i.estado} />
              {i.motivoDeDescarte && (
                <>
                  <br />
                  <span className="hk-suave">
                    {t('inteligencia.insight.motivo_descarte', { motivo: i.motivoDeDescarte })}
                  </span>
                </>
              )}
            </td>
            <td>
              {i.responsavelId
                ? (lista.nomes.pessoas[i.responsavelId] ?? t('inteligencia.sem_valor'))
                : t('inteligencia.sem_responsavel')}
            </td>
            <td>{data(i.ultimaDeteccaoEm)}</td>
          </tr>
        ))}
      </tbody>
    </Tabela>
  );
}
