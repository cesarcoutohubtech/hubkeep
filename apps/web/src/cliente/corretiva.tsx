'use client';
// Telas do CSC e do hotel para a corretiva (fase 1a, C7): filtros das listas,
// itens de chamado e de OS, as OS do chamado com o aceite e a reabertura (C6)
// e a linha do tempo. Só apresentação: as páginas carregam os dados pela API,
// que devolve o escopo de cada papel (RLS) e decide quem aceita ou reabre (o
// erro volta como código e é traduzido aqui). Tela funcional, sem acabamento;
// o layout definitivo vem do protótipo.
import type {
  ChamadoResumidoApi,
  EventoDaLinhaDoTempoApi,
  OsResumidaApi,
  RespostaDeChamado,
  RespostaDeSituacoesEPrioridades,
  z,
} from '@hubkeep/contratos';
import { type Chave, resolverNome } from '@hubkeep/i18n';
import { type FormEvent, useMemo, useState } from 'react';
import { useIntl } from 'react-intl';
import { type ErroDaApi, chamarApi } from './api';
import { HistoricoDoRegistro } from './HistoricoDoRegistro';
import { useIdioma, useMensagemDeErro, useT } from '../i18n/cliente';

export type ChamadoResumido = z.infer<typeof ChamadoResumidoApi>;
export type OsResumida = z.infer<typeof OsResumidaApi>;
export type EventoDaLinhaDoTempo = z.infer<typeof EventoDaLinhaDoTempoApi>;
export type DetalheDoChamado = z.infer<typeof RespostaDeChamado>;
export type OsDoChamado = DetalheDoChamado['os'][number];
export type SituacoesEPrioridades = z.infer<typeof RespostaDeSituacoesEPrioridades>;

/** Hotéis visíveis (GET /api/v1/hoteis) e as situações e prioridades do tenant. */
export interface Referencias {
  hoteis: { id: string; nome: string }[];
  corretiva: SituacoesEPrioridades;
}

/** Carrega as referências das telas; a que falhar fica vazia (os nomes caem para o catálogo). */
export async function carregarReferencias(): Promise<Referencias> {
  const [h, c] = await Promise.all([
    chamarApi<{ hoteis: { id: string; nome: string }[] }>('/api/v1/hoteis'),
    chamarApi<SituacoesEPrioridades>('/api/v1/situacoes-e-prioridades'),
  ]);
  return {
    hoteis: h.ok ? h.dados.hoteis : [],
    corretiva: c.ok ? c.dados : { idiomaPadrao: 'pt-BR', situacoes: [], prioridades: [] },
  };
}

/** O filtro como a tela o guarda: datas do calendário (AAAA-MM-DD), vazio = sem filtro. */
export interface FiltroDaTela {
  hotelId: string;
  situacaoId: string;
  prioridadeId: string;
  de: string;
  ate: string;
}

export const FILTRO_VAZIO: FiltroDaTela = {
  hotelId: '',
  situacaoId: '',
  prioridadeId: '',
  de: '',
  ate: '',
};

/** Meia-noite local da data do calendário, em ISO 8601. */
const inicioDoDia = (data: string, diasDepois = 0): string => {
  const [a, m, d] = data.split('-').map(Number);
  return new Date(a ?? 0, (m ?? 1) - 1, (d ?? 1) + diasDepois).toISOString();
};

/**
 * Caminho da lista com o filtro na query string. As datas são dias no fuso de
 * quem vê: "de" desde a meia-noite, "até" inclusive (a API recebe a meia-noite
 * do dia seguinte, exclusive).
 */
export function caminhoDaLista(
  caminho: string,
  filtro: FiltroDaTela,
  depoisDe: string | null = null,
): string {
  const q = new URLSearchParams();
  if (filtro.hotelId) q.set('hotelId', filtro.hotelId);
  if (filtro.situacaoId) q.set('situacaoId', filtro.situacaoId);
  if (filtro.prioridadeId) q.set('prioridadeId', filtro.prioridadeId);
  if (filtro.de) q.set('de', inicioDoDia(filtro.de));
  if (filtro.ate) q.set('ate', inicioDoDia(filtro.ate, 1));
  if (depoisDe) q.set('depoisDe', depoisDe);
  const texto = q.toString();
  return texto ? `${caminho}?${texto}` : caminho;
}

const CHAVES_PADRAO_DE_SITUACAO = new Set([
  'chamado_aberto',
  'chamado_em_triagem',
  'chamado_em_execucao',
  'chamado_aguardando_aceite',
  'chamado_concluido',
  'chamado_cancelado',
  'os_atribuida',
  'os_em_execucao',
  'os_pausada',
  'os_concluida',
  'os_aceita',
  'os_cancelada',
]);
const CHAVES_PADRAO_DE_PRIORIDADE = new Set(['urgente', 'alta', 'media', 'baixa']);

/** Nomes de exibição: situação e prioridade pela volta do ADR-027; o que falta, pelo catálogo. */
export function useNomes(refs: Referencias | null) {
  const t = useT();
  const { idioma } = useIdioma();
  return useMemo(() => {
    const semNome = t('corretiva.sem_nome');
    const idiomaPadrao = refs?.corretiva.idiomaPadrao ?? 'pt-BR';
    const situacao = (id: string | null) => {
      const s = refs?.corretiva.situacoes.find((x) => x.id === id);
      if (!s) return semNome;
      const doCatalogo =
        s.chavePadrao && CHAVES_PADRAO_DE_SITUACAO.has(s.chavePadrao)
          ? t(`situacao.padrao.${s.chavePadrao}` as Chave)
          : null;
      return resolverNome(s.nomes, idioma, { doCatalogo, idiomaPadrao }) ?? semNome;
    };
    const prioridade = (id: string | null) => {
      const p = refs?.corretiva.prioridades.find((x) => x.id === id);
      if (!p) return semNome;
      const doCatalogo =
        p.chavePadrao && CHAVES_PADRAO_DE_PRIORIDADE.has(p.chavePadrao)
          ? t(`prioridade.padrao.${p.chavePadrao}` as Chave)
          : null;
      return resolverNome(p.nomes, idioma, { doCatalogo, idiomaPadrao }) ?? semNome;
    };
    const nome = (n: string | null | undefined) => n ?? semNome;
    return { situacao, prioridade, nome };
  }, [refs, idioma, t]);
}

export function FiltrosDaLista(props: {
  entidade: 'chamado' | 'os';
  refs: Referencias | null;
  aoFiltrar: (filtro: FiltroDaTela) => void;
}) {
  const t = useT();
  const nomes = useNomes(props.refs);
  const [f, setF] = useState<FiltroDaTela>(FILTRO_VAZIO);
  const mudar = (campo: keyof FiltroDaTela) => (valor: string) =>
    setF((atual) => ({ ...atual, [campo]: valor }));

  function enviar(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    props.aoFiltrar(f);
  }

  const situacoes = (props.refs?.corretiva.situacoes ?? []).filter(
    (s) => s.entidade === props.entidade,
  );
  return (
    <form onSubmit={enviar} style={{ display: 'grid', gap: 8 }}>
      <label style={{ display: 'grid' }}>
        {t('corretiva.filtros.hotel')}
        <select value={f.hotelId} onChange={(e) => mudar('hotelId')(e.target.value)}>
          <option value="">{t('corretiva.filtros.todos')}</option>
          {(props.refs?.hoteis ?? []).map((h) => (
            <option key={h.id} value={h.id}>
              {h.nome}
            </option>
          ))}
        </select>
      </label>
      <label style={{ display: 'grid' }}>
        {t('corretiva.filtros.situacao')}
        <select value={f.situacaoId} onChange={(e) => mudar('situacaoId')(e.target.value)}>
          <option value="">{t('corretiva.filtros.todas')}</option>
          {situacoes.map((s) => (
            <option key={s.id} value={s.id}>
              {nomes.situacao(s.id)}
            </option>
          ))}
        </select>
      </label>
      <label style={{ display: 'grid' }}>
        {t('corretiva.filtros.prioridade')}
        <select value={f.prioridadeId} onChange={(e) => mudar('prioridadeId')(e.target.value)}>
          <option value="">{t('corretiva.filtros.todas')}</option>
          {(props.refs?.corretiva.prioridades ?? []).map((p) => (
            <option key={p.id} value={p.id}>
              {nomes.prioridade(p.id)}
            </option>
          ))}
        </select>
      </label>
      <span style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <label style={{ display: 'grid' }}>
          {t('corretiva.filtros.de')}
          <input type="date" value={f.de} onChange={(e) => mudar('de')(e.target.value)} />
        </label>
        <label style={{ display: 'grid' }}>
          {t('corretiva.filtros.ate')}
          <input type="date" value={f.ate} onChange={(e) => mudar('ate')(e.target.value)} />
        </label>
      </span>
      <span style={{ display: 'flex', gap: 8 }}>
        <button type="submit">{t('corretiva.filtros.aplicar')}</button>
        <button
          type="button"
          onClick={() => {
            setF(FILTRO_VAZIO);
            props.aoFiltrar(FILTRO_VAZIO);
          }}
        >
          {t('corretiva.filtros.limpar')}
        </button>
      </span>
    </form>
  );
}

const dataCurta = { dateStyle: 'short', timeStyle: 'short' } as const;

export function ItemDeChamado({ c, refs }: { c: ChamadoResumido; refs: Referencias | null }) {
  const t = useT();
  const intl = useIntl();
  const nomes = useNomes(refs);
  return (
    <li style={{ display: 'grid', gap: 2 }}>
      <a href={`/chamados/${c.id}`}>{c.descricao}</a>
      <small>
        {t('corretiva.onde', { hotel: nomes.nome(c.hotelNome), local: nomes.nome(c.localNome) })}
      </small>
      <small>
        {t('corretiva.resumo', {
          situacao: nomes.situacao(c.situacaoId),
          prioridade: nomes.prioridade(c.prioridadeId),
          data: intl.formatDate(c.criadoEm, dataCurta),
        })}
      </small>
    </li>
  );
}

export function ItemDeOs({ o, refs }: { o: OsResumida; refs: Referencias | null }) {
  const t = useT();
  const intl = useIntl();
  const nomes = useNomes(refs);
  return (
    <li style={{ display: 'grid', gap: 2 }}>
      <a href={`/chamados/${o.chamadoId}`}>{o.descricao ?? t('corretiva.os.sem_descricao')}</a>
      <small>
        {t('corretiva.onde', { hotel: nomes.nome(o.hotelNome), local: nomes.nome(o.localNome) })}
      </small>
      <small>
        {t('corretiva.resumo', {
          situacao: nomes.situacao(o.situacaoId),
          prioridade: nomes.prioridade(o.prioridadeId),
          data: intl.formatDate(o.criadoEm, dataCurta),
        })}
      </small>
      <small>{t('corretiva.os.responsavel', { nome: nomes.nome(o.responsavelNome) })}</small>
    </li>
  );
}

/** O que a tela manda na reabertura: motivo e, se o equipamento está parado, desde quando (ISO). */
export interface PedidoDeReabertura {
  motivo: string;
  paradoDesde: string | null;
}

/** Data e hora locais no formato do campo datetime-local (AAAA-MM-DDTHH:MM). */
export const agoraNoCampo = (agora = new Date()): string => {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${agora.getFullYear()}-${p(agora.getMonth() + 1)}-${p(agora.getDate())}T${p(agora.getHours())}:${p(agora.getMinutes())}`;
};

function Reabertura(props: { temAtivo: boolean; aoReabrir: (p: PedidoDeReabertura) => void }) {
  const t = useT();
  const [motivo, setMotivo] = useState('');
  const [parado, setParado] = useState(false);
  const [desde, setDesde] = useState(() => agoraNoCampo());

  function enviar(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    props.aoReabrir({
      motivo,
      paradoDesde: props.temAtivo && parado ? new Date(desde).toISOString() : null,
    });
  }

  return (
    <form onSubmit={enviar} style={{ display: 'grid', gap: 6 }}>
      <label style={{ display: 'grid' }}>
        {t('corretiva.reabertura.motivo')}
        <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3} />
      </label>
      {props.temAtivo && (
        <label style={{ display: 'flex', gap: 6 }}>
          <input type="checkbox" checked={parado} onChange={(e) => setParado(e.target.checked)} />
          {t('corretiva.reabertura.parado')}
        </label>
      )}
      {props.temAtivo && parado && (
        <label style={{ display: 'grid' }}>
          {t('corretiva.reabertura.parado_desde')}
          <input type="datetime-local" value={desde} onChange={(e) => setDesde(e.target.value)} />
        </label>
      )}
      <button type="submit">{t('corretiva.reabertura.reabrir')}</button>
    </form>
  );
}

export function ChamadoEmDetalhe(props: {
  detalhe: DetalheDoChamado;
  refs: Referencias | null;
  aoAceitar: (os: OsDoChamado) => void;
  aoReabrir: (os: OsDoChamado, p: PedidoDeReabertura) => void;
}) {
  const t = useT();
  const intl = useIntl();
  const nomes = useNomes(props.refs);
  const { chamado, os, nomes: n } = props.detalhe;
  const responsavel = (o: OsDoChamado) =>
    nomes.nome(
      o.responsavel.tipo === 'tecnico'
        ? n.pessoas[o.responsavel.usuarioId]
        : n.equipes[o.responsavel.equipeId],
    );
  return (
    <section style={{ display: 'grid', gap: 12 }}>
      <p style={{ whiteSpace: 'pre-wrap' }}>{chamado.descricao}</p>
      <small>
        {t('corretiva.onde', { hotel: nomes.nome(n.hotel), local: nomes.nome(n.local) })}
      </small>
      {chamado.ativoId && (
        <small>{t('corretiva.chamado.ativo', { ativo: nomes.nome(n.ativo) })}</small>
      )}
      <small>
        {t('corretiva.resumo', {
          situacao: nomes.situacao(chamado.situacaoId),
          prioridade: nomes.prioridade(chamado.prioridadeId),
          data: intl.formatDate(chamado.criadoEm, dataCurta),
        })}
      </small>
      <small>
        {t('corretiva.chamado.aberto_por', { nome: nomes.nome(n.pessoas[chamado.abertoPor]) })}
      </small>
      {chamado.motivoCancelamento && (
        <small>{t('corretiva.motivo_cancelamento', { motivo: chamado.motivoCancelamento })}</small>
      )}
      <h2>{t('corretiva.chamado.os')}</h2>
      {os.length === 0 ? (
        <p>{t('corretiva.chamado.sem_os')}</p>
      ) : (
        <ul style={{ display: 'grid', gap: 12 }}>
          {os.map((o) => (
            <li key={o.id} id={`os-${o.id}`} style={{ display: 'grid', gap: 4 }}>
              <span>
                {t('corretiva.os.situacao', {
                  situacao: nomes.situacao(o.situacaoId),
                  data: intl.formatDate(o.criadoEm, dataCurta),
                })}
              </span>
              <small>{t('corretiva.os.responsavel', { nome: responsavel(o) })}</small>
              {o.motivoReabertura && (
                <small>{t('corretiva.os.motivo_reabertura', { motivo: o.motivoReabertura })}</small>
              )}
              {o.motivoCancelamento && (
                <small>
                  {t('corretiva.motivo_cancelamento', { motivo: o.motivoCancelamento })}
                </small>
              )}
              {o.estado === 'concluida' && (
                <div style={{ display: 'grid', gap: 6, borderLeft: '3px solid', paddingLeft: 8 }}>
                  <strong>{t('corretiva.aceite.titulo')}</strong>
                  <small>{t('corretiva.aceite.descricao')}</small>
                  <button type="button" onClick={() => props.aoAceitar(o)}>
                    {t('corretiva.aceite.aceitar')}
                  </button>
                  <Reabertura
                    temAtivo={chamado.ativoId !== null}
                    aoReabrir={(p) => props.aoReabrir(o, p)}
                  />
                </div>
              )}
              <HistoricoDoRegistro key={`${o.id}-${o.versao}`} entidade="os" registroId={o.id} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const ROTULO_DA_ENTIDADE = {
  chamado: 'corretiva.linha_do_tempo.chamado',
  os: 'corretiva.linha_do_tempo.os',
  parada_ativo: 'corretiva.linha_do_tempo.parada_ativo',
} as const satisfies Record<EventoDaLinhaDoTempo['entidade'], Chave>;

export function LinhaDoTempo({ eventos }: { eventos: EventoDaLinhaDoTempo[] }) {
  const t = useT();
  const intl = useIntl();
  return (
    <section style={{ display: 'grid', gap: 8 }}>
      <h2>{t('corretiva.linha_do_tempo.titulo')}</h2>
      {eventos.length === 0 ? (
        <p>{t('corretiva.linha_do_tempo.vazia')}</p>
      ) : (
        <ol style={{ display: 'grid', gap: 6 }}>
          {eventos.map((e) => (
            <li key={e.id} style={{ display: 'grid' }}>
              <span>
                {t('corretiva.linha_do_tempo.evento', {
                  data: intl.formatDate(e.em, dataCurta),
                  acao: t(ROTULO_DA_ENTIDADE[e.entidade], { acao: e.acao }),
                })}
              </span>
              {e.usuarioNome && (
                <small>{t('corretiva.linha_do_tempo.por', { nome: e.usuarioNome })}</small>
              )}
              {e.motivo && (
                <small>{t('corretiva.linha_do_tempo.motivo', { motivo: e.motivo })}</small>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/** Aviso de resultado das ações: feito, ou o erro da API traduzido. */
export function Aviso({
  aviso,
}: {
  aviso: { tipo: 'ok' } | { tipo: 'erro'; erro: ErroDaApi } | null;
}) {
  const t = useT();
  const mensagemDeErro = useMensagemDeErro();
  if (!aviso) return null;
  return aviso.tipo === 'ok' ? (
    <p role="status">{t('comum.feito')}</p>
  ) : (
    <p role="alert">{mensagemDeErro(aviso.erro)}</p>
  );
}
