'use client';
// Telas do CSC e do hotel para a corretiva (fase 1a, C7; visual na U4): filtros
// das listas, linhas de chamado e de OS, as OS do chamado com o aceite e a
// reabertura (C6) e a linha do tempo. Só apresentação: as páginas carregam os
// dados pela API, que devolve o escopo de cada papel (RLS) e decide quem aceita
// ou reabre (o erro volta como código e é traduzido aqui). Na I4, o detalhe
// mostra se afeta hóspede, quem executa cada OS e o custo informado, e o
// aceite leva o custo, opcional, em reais. Na I6, a OS mostra os códigos de
// falha, causa e solução, e o aceite traz os três, já com a sugestão do
// técnico, para quem aceita confirmar ou corrigir; a lista de cada um vem da
// API (os que servem para a OS). Com a política os.codigos_obrigatorios ligada
// no hotel, a API recusa o aceite sem os três, e a recusa aparece traduzida.
// Na I8, com a política os.assinatura_no_aceite ligada no hotel, o aceite traz
// o quadro da assinatura (assinatura.tsx); a OS aceita com assinatura mostra o
// botão para vê-la, e as fotos da OS aparecem com o momento (antes ou depois).
// Na PV1, cada OS mostra o checklist aplicado, com as respostas do técnico, e
// quem tria aplica ou troca o modelo (checklist-da-os.tsx).
import type {
  ChamadoResumidoApi,
  EventoDaLinhaDoTempoApi,
  OsDaPaginaApi,
  OsResumidaApi,
  RespostaDeChamado,
  RespostaDeSituacoesEPrioridades,
  z,
} from '@hubkeep/contratos';
import { type Chave, resolverNome } from '@hubkeep/i18n';
import {
  AreaDeTexto,
  Botao,
  Campo,
  Entrada,
  MensagemVazia,
  type NivelDePrioridade,
  Painel,
  Selecao,
  Selo,
  SeloDePrioridade,
  type TomDeSelo,
} from '@hubkeep/ui';
import Link from 'next/link';
import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { useIntl } from 'react-intl';
import { AnexosDoRegistro } from './AnexosDoRegistro';
import { chamarApi } from './api';
import { AssinaturaDoAceite, QuadroDeAssinatura, type Traco } from './assinatura';
import { ChecklistDaOs } from './checklist-da-os';
import {
  type CodigoNaTela,
  type CodigosDoTenant,
  TIPOS_DE_CODIGO,
  type TipoDeCodigo,
  useNomeDoCodigo,
} from './codigos-manutencao';
import { HistoricoDoRegistro } from './HistoricoDoRegistro';
import { useIdioma, useT } from '../i18n/cliente';

/** O aviso de resultado das ações mora em ./aviso; as telas da operação o pegam daqui. */
export { Aviso } from './aviso';

export type ChamadoResumido = z.infer<typeof ChamadoResumidoApi>;
export type OsResumida = z.infer<typeof OsResumidaApi>;
export type EventoDaLinhaDoTempo = z.infer<typeof EventoDaLinhaDoTempoApi>;
export type DetalheDoChamado = z.infer<typeof RespostaDeChamado>;
export type OsDoChamado = DetalheDoChamado['os'][number];
/** A OS da página da OS (PV3c): a corretiva ou a preventiva, sem chamado. */
export type OsDaPagina = z.infer<typeof OsDaPaginaApi>;
/** Os três códigos da OS (I6); null em cada um: não informado. */
export type CodigosDaOsNaTela = OsDoChamado['codigos'];
export type SituacoesEPrioridades = z.infer<typeof RespostaDeSituacoesEPrioridades>;

/** Hotéis visíveis (GET /api/v1/hoteis) e as situações e prioridades do tenant. */
export interface Referencias {
  hoteis: { id: string; nome: string }[];
  corretiva: SituacoesEPrioridades;
}

/** Situações e prioridades quando a leitura falha: os nomes caem para o catálogo. */
export const CORRETIVA_VAZIA: SituacoesEPrioridades = {
  idiomaPadrao: 'pt-BR',
  situacoes: [],
  prioridades: [],
};

/** Carrega as referências das telas; a que falhar fica vazia (os nomes caem para o catálogo). */
export async function carregarReferencias(): Promise<Referencias> {
  const [h, c] = await Promise.all([
    chamarApi<{ hoteis: { id: string; nome: string }[] }>('/api/v1/hoteis'),
    chamarApi<SituacoesEPrioridades>('/api/v1/situacoes-e-prioridades'),
  ]);
  return {
    hoteis: h.ok ? h.dados.hoteis : [],
    corretiva: c.ok ? c.dados : CORRETIVA_VAZIA,
  };
}

/** O filtro como a tela o guarda: datas do calendário (AAAA-MM-DD), vazio = sem filtro. */
export interface FiltroDaTela {
  hotelId: string;
  situacaoId: string;
  prioridadeId: string;
  de: string;
  ate: string;
  /** '1': só as OS do locador no hotel arrendado (1c, ADR-045); só a lista de OS tem. */
  doLocador: string;
}

export const FILTRO_VAZIO: FiltroDaTela = {
  hotelId: '',
  situacaoId: '',
  prioridadeId: '',
  de: '',
  ate: '',
  doLocador: '',
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
  /** A página da exportação, de 1.000 (só a lista de chamados; 1c, item 9). */
  exportacao = false,
): string {
  const q = new URLSearchParams();
  if (filtro.hotelId) q.set('hotelId', filtro.hotelId);
  if (filtro.situacaoId) q.set('situacaoId', filtro.situacaoId);
  if (filtro.prioridadeId) q.set('prioridadeId', filtro.prioridadeId);
  if (filtro.de) q.set('de', inicioDoDia(filtro.de));
  if (filtro.ate) q.set('ate', inicioDoDia(filtro.ate, 1));
  if (filtro.doLocador) q.set('doLocador', '1');
  if (depoisDe) q.set('depoisDe', depoisDe);
  if (exportacao) q.set('exportacao', '1');
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

const NIVEL_DA_PRIORIDADE_PADRAO: Readonly<Record<string, NivelDePrioridade>> = {
  urgente: 'critica',
  alta: 'alta',
  media: 'media',
  baixa: 'baixa',
};

/**
 * Nível visual da prioridade (cor do selo). A padrão vai pela chave; a criada
 * pelo tenant, pela posição do peso entre as ativas (a de maior peso é crítica).
 */
export function nivelDaPrioridade(
  prioridades: SituacoesEPrioridades['prioridades'],
  id: string | null,
): NivelDePrioridade {
  const p = prioridades.find((x) => x.id === id);
  if (!p) return 'baixa';
  const padrao = p.chavePadrao ? NIVEL_DA_PRIORIDADE_PADRAO[p.chavePadrao] : undefined;
  if (padrao) return padrao;
  const pesos = prioridades.filter((x) => x.ativa || x.id === id).sort((a, b) => b.peso - a.peso);
  const posicao = pesos.findIndex((x) => x.id === id) / Math.max(pesos.length - 1, 1);
  return posicao < 0.25 ? 'critica' : posicao < 0.5 ? 'alta' : posicao < 0.75 ? 'media' : 'baixa';
}

/** Cor do selo pelo estado canônico: âmbar espera alguém, azul anda, verde fechou. */
const TOM_DO_ESTADO: Readonly<Record<string, TomDeSelo>> = {
  aberto: 'ambar',
  em_triagem: 'ambar',
  em_execucao: 'azul',
  aguardando_aceite: 'azul',
  concluido: 'verde',
  cancelado: 'cinza',
  atribuida: 'cinza',
  pausada: 'ambar',
  concluida: 'azul',
  aceita: 'verde',
  cancelada: 'cinza',
};
export const tomDoEstado = (estado: string): TomDeSelo => TOM_DO_ESTADO[estado] ?? 'cinza';

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
    const nivel = (id: string | null) => nivelDaPrioridade(refs?.corretiva.prioridades ?? [], id);
    return { situacao, prioridade, nome, nivel };
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
    <form onSubmit={enviar} className="hk-filtros">
      <Campo rotulo={t('corretiva.filtros.hotel')}>
        {(p) => (
          <Selecao {...p} value={f.hotelId} onChange={(e) => mudar('hotelId')(e.target.value)}>
            <option value="">{t('corretiva.filtros.todos')}</option>
            {(props.refs?.hoteis ?? []).map((h) => (
              <option key={h.id} value={h.id}>
                {h.nome}
              </option>
            ))}
          </Selecao>
        )}
      </Campo>
      <Campo rotulo={t('corretiva.filtros.situacao')}>
        {(p) => (
          <Selecao
            {...p}
            value={f.situacaoId}
            onChange={(e) => mudar('situacaoId')(e.target.value)}
          >
            <option value="">{t('corretiva.filtros.todas')}</option>
            {situacoes.map((s) => (
              <option key={s.id} value={s.id}>
                {nomes.situacao(s.id)}
              </option>
            ))}
          </Selecao>
        )}
      </Campo>
      <Campo rotulo={t('corretiva.filtros.prioridade')}>
        {(p) => (
          <Selecao
            {...p}
            value={f.prioridadeId}
            onChange={(e) => mudar('prioridadeId')(e.target.value)}
          >
            <option value="">{t('corretiva.filtros.todas')}</option>
            {(props.refs?.corretiva.prioridades ?? []).map((pr) => (
              <option key={pr.id} value={pr.id}>
                {nomes.prioridade(pr.id)}
              </option>
            ))}
          </Selecao>
        )}
      </Campo>
      <Campo rotulo={t('corretiva.filtros.de')}>
        {(p) => (
          <Entrada {...p} type="date" value={f.de} onChange={(e) => mudar('de')(e.target.value)} />
        )}
      </Campo>
      <Campo rotulo={t('corretiva.filtros.ate')}>
        {(p) => (
          <Entrada
            {...p}
            type="date"
            value={f.ate}
            onChange={(e) => mudar('ate')(e.target.value)}
          />
        )}
      </Campo>
      {props.entidade === 'os' && (
        <Campo rotulo={t('corretiva.filtros.arrendamento')}>
          {(p) => (
            <Selecao
              {...p}
              value={f.doLocador}
              onChange={(e) => mudar('doLocador')(e.target.value)}
            >
              <option value="">{t('corretiva.filtros.todas')}</option>
              <option value="1">{t('corretiva.filtros.do_locador')}</option>
            </Selecao>
          )}
        </Campo>
      )}
      <div className="hk-linha-de-botoes">
        <Botao type="submit" variante="primario">
          {t('corretiva.filtros.aplicar')}
        </Botao>
        <Botao
          onClick={() => {
            setF(FILTRO_VAZIO);
            props.aoFiltrar(FILTRO_VAZIO);
          }}
        >
          {t('corretiva.filtros.limpar')}
        </Botao>
      </div>
    </form>
  );
}

const dataCurta = { dateStyle: 'short', timeStyle: 'short' } as const;

/** Cabeçalho da tabela de chamados (LinhaDeChamado). */
export function ColunasDeChamado() {
  const t = useT();
  return (
    <thead>
      <tr>
        <th scope="col">{t('corretiva.coluna.chamado')}</th>
        <th scope="col">{t('corretiva.coluna.onde')}</th>
        <th scope="col">{t('corretiva.coluna.situacao')}</th>
        <th scope="col">{t('corretiva.coluna.prioridade')}</th>
        <th scope="col">{t('corretiva.coluna.aberto_em')}</th>
      </tr>
    </thead>
  );
}

export function LinhaDeChamado({ c, refs }: { c: ChamadoResumido; refs: Referencias | null }) {
  const t = useT();
  const intl = useIntl();
  const nomes = useNomes(refs);
  return (
    <tr>
      <td>
        <Link href={`/chamados/${c.id}`}>{c.descricao}</Link>
      </td>
      <td>
        {t('corretiva.onde', { hotel: nomes.nome(c.hotelNome), local: nomes.nome(c.localNome) })}
      </td>
      <td>
        <Selo tom={tomDoEstado(c.estado)}>{nomes.situacao(c.situacaoId)}</Selo>
      </td>
      <td>
        <SeloDePrioridade nivel={nomes.nivel(c.prioridadeId)}>
          {nomes.prioridade(c.prioridadeId)}
        </SeloDePrioridade>
      </td>
      <td className="hk-tnum">
        {t('comum.data_hora', { data: intl.formatDate(c.criadoEm, dataCurta) })}
      </td>
    </tr>
  );
}

/** Cabeçalho da tabela de OS (LinhaDeOs). */
export function ColunasDeOs() {
  const t = useT();
  return (
    <thead>
      <tr>
        <th scope="col">{t('corretiva.coluna.os')}</th>
        <th scope="col">{t('corretiva.coluna.onde')}</th>
        <th scope="col">{t('corretiva.coluna.situacao')}</th>
        <th scope="col">{t('corretiva.coluna.prioridade')}</th>
        <th scope="col">{t('corretiva.coluna.responsavel')}</th>
        <th scope="col">{t('corretiva.coluna.criada_em')}</th>
      </tr>
    </thead>
  );
}

export function LinhaDeOs({ o, refs }: { o: OsResumida; refs: Referencias | null }) {
  const t = useT();
  const intl = useIntl();
  const nomes = useNomes(refs);
  return (
    <tr>
      <td>
        {o.preventiva ? (
          // A preventiva (PV3c) não tem chamado: abre a página da OS.
          <Link href={`/os/${o.id}`}>
            {t('corretiva.os.preventiva', {
              plano: o.preventiva.planoNome,
              ativo: nomes.nome(o.preventiva.ativoNome),
              data: intl.formatDate(new Date(`${o.preventiva.dataPrevista}T12:00:00Z`), {
                dateStyle: 'short',
                timeZone: 'UTC',
              }),
            })}
          </Link>
        ) : (
          <Link href={`/chamados/${o.chamadoId}`}>
            {o.descricao ?? t('corretiva.os.sem_descricao')}
          </Link>
        )}
      </td>
      <td>
        {t('corretiva.onde', { hotel: nomes.nome(o.hotelNome), local: nomes.nome(o.localNome) })}
      </td>
      <td>
        <Selo tom={tomDoEstado(o.estado)}>{nomes.situacao(o.situacaoId)}</Selo>
      </td>
      <td>
        {o.preventiva ? (
          <Selo tom="azul">{t('corretiva.os.selo_preventiva')}</Selo>
        ) : (
          <SeloDePrioridade nivel={nomes.nivel(o.prioridadeId)}>
            {nomes.prioridade(o.prioridadeId)}
          </SeloDePrioridade>
        )}
      </td>
      <td>
        {nomes.nome(o.responsavelNome)}
        {o.responsavelArrendamento === 'locador' && (
          <>
            {' '}
            <Selo tom="ambar">{t('corretiva.os.do_locador')}</Selo>
          </>
        )}
      </td>
      <td className="hk-tnum">
        {t('comum.data_hora', { data: intl.formatDate(o.criadoEm, dataCurta) })}
      </td>
    </tr>
  );
}

/** O que a tela manda na reabertura: motivo e, se o equipamento está parado, desde quando (ISO). */
export interface PedidoDeReabertura {
  motivo: string;
  paradoDesde: string | null;
}

/**
 * Custo do campo do aceite (I4): vazio é não informado; o resto vai como
 * número, e o servidor confere (não negativo, dois decimais).
 */
export function custoDoCampo(valor: string): number | null {
  const limpo = valor.trim().replace(',', '.');
  return limpo === '' ? null : Number(limpo);
}

/** O impacto no hóspede como o catálogo o nomeia (I4). */
export const chaveDoImpacto = (impacto: boolean | null): 'sim' | 'nao' | 'nao_informado' =>
  impacto === null ? 'nao_informado' : impacto ? 'sim' : 'nao';

const CAMPO_DO_TIPO: Record<TipoDeCodigo, keyof CodigosDaOsNaTela> = {
  falha: 'falhaId',
  causa: 'causaId',
  solucao: 'solucaoId',
};

/**
 * Os códigos que servem para a OS (GET /api/v1/os/{id}/codigos), por tipo; null
 * enquanto carrega ou se a leitura falhar (o aceite segue sem os campos).
 */
function useCodigosDaOs(osId: string, ligado: boolean) {
  const [porTipo, setPorTipo] = useState<Record<TipoDeCodigo, string[]> | null>(null);
  useEffect(() => {
    if (!ligado) return;
    let vivo = true;
    void chamarApi<Record<TipoDeCodigo, string[]>>(`/api/v1/os/${osId}/codigos`).then((r) => {
      if (vivo && r.ok) setPorTipo(r.dados);
    });
    return () => {
      vivo = false;
    };
  }, [osId, ligado]);
  return porTipo;
}

function Aceite(props: {
  os: OsNoBloco;
  codigos: CodigosDoTenant | null;
  /** A política do hotel (I8): o aceite traz o quadro da assinatura. */
  assinaturaNoAceite: boolean;
  aoAceitar: (
    custoInformado: number | null,
    codigos: CodigosDaOsNaTela | undefined,
    assinatura: Traco[] | null,
  ) => void;
}) {
  const t = useT();
  const nomeDoCodigo = useNomeDoCodigo(props.codigos);
  const porTipo = useCodigosDaOs(props.os.id, props.codigos !== null);
  const [custo, setCusto] = useState('');
  const [escolhidos, setEscolhidos] = useState<CodigosDaOsNaTela | null>(null);
  const [tracos, setTracos] = useState<Traco[]>([]);
  const porId = new Map((props.codigos?.codigos ?? []).map((c) => [c.id, c]));
  /** O valor do campo: o escolhido, senão a sugestão do técnico, se ela ainda serve. */
  const valor = (tipo: TipoDeCodigo): string => {
    const campo = CAMPO_DO_TIPO[tipo];
    if (escolhidos) return escolhidos[campo] ?? '';
    const sugerido = props.os.codigos[campo];
    return sugerido && porTipo?.[tipo].includes(sugerido) ? sugerido : '';
  };
  const atuais = (): CodigosDaOsNaTela => ({
    falhaId: valor('falha') || null,
    causaId: valor('causa') || null,
    solucaoId: valor('solucao') || null,
  });
  function enviar(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    props.aoAceitar(
      custoDoCampo(custo),
      porTipo ? atuais() : undefined,
      props.assinaturaNoAceite && tracos.length > 0 ? tracos : null,
    );
  }
  return (
    <form onSubmit={enviar}>
      {porTipo &&
        TIPOS_DE_CODIGO.map((tipo) => (
          <Campo key={tipo} rotulo={t('corretiva.aceite.codigo', { tipo })}>
            {(p) => (
              <Selecao
                {...p}
                name={CAMPO_DO_TIPO[tipo]}
                value={valor(tipo)}
                onChange={(e) =>
                  setEscolhidos({ ...atuais(), [CAMPO_DO_TIPO[tipo]]: e.target.value || null })
                }
              >
                <option value="">{t('corretiva.aceite.codigo_nao_informado')}</option>
                {porTipo[tipo].map((id) => {
                  const c: CodigoNaTela | undefined = porId.get(id);
                  return (
                    <option key={id} value={id}>
                      {c ? nomeDoCodigo(c) : id}
                    </option>
                  );
                })}
              </Selecao>
            )}
          </Campo>
        ))}
      <Campo rotulo={t('corretiva.aceite.custo')} ajuda={t('corretiva.aceite.custo_dica')}>
        {(p) => (
          <Entrada
            {...p}
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={custo}
            onChange={(e) => setCusto(e.target.value)}
          />
        )}
      </Campo>
      {props.assinaturaNoAceite && (
        <div className="hk-pilha">
          <p className="hk-bloco-titulo">{t('corretiva.aceite.assinatura.titulo')}</p>
          <p className="hk-suave">{t('corretiva.aceite.assinatura.dica')}</p>
          <QuadroDeAssinatura aoMudar={setTracos} />
        </div>
      )}
      <Botao type="submit" variante="primario">
        {t('corretiva.aceite.aceitar')}
      </Botao>
    </form>
  );
}

/** Os códigos da OS (I6), por nome, para o detalhe; nada se não houver nenhum. */
export function CodigosDaOs(props: { os: OsNoBloco; codigos: CodigosDoTenant | null }) {
  const t = useT();
  const nomeDoCodigo = useNomeDoCodigo(props.codigos);
  const porId = new Map((props.codigos?.codigos ?? []).map((c) => [c.id, c]));
  const itens = TIPOS_DE_CODIGO.flatMap((tipo) => {
    const id = props.os.codigos[CAMPO_DO_TIPO[tipo]];
    if (id === null) return [];
    const c = porId.get(id);
    return [{ tipo, id, nome: c ? nomeDoCodigo(c) : t('corretiva.os.codigo_sem_nome') }];
  });
  if (itens.length === 0) return null;
  return (
    <ul className="hk-sublista" data-codigos-da-os>
      {itens.map((i) => (
        <li key={i.tipo} className="hk-suave" data-codigo={i.id}>
          {t('corretiva.os.codigo', { tipo: i.tipo, nome: i.nome })}
        </li>
      ))}
    </ul>
  );
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
    <form onSubmit={enviar}>
      <Campo rotulo={t('corretiva.reabertura.motivo')}>
        {(p) => (
          <AreaDeTexto {...p} value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3} />
        )}
      </Campo>
      {props.temAtivo && (
        <label className="hk-marcar">
          <input type="checkbox" checked={parado} onChange={(e) => setParado(e.target.checked)} />
          {t('corretiva.reabertura.parado')}
        </label>
      )}
      {props.temAtivo && parado && (
        <Campo rotulo={t('corretiva.reabertura.parado_desde')}>
          {(p) => (
            <Entrada
              {...p}
              type="datetime-local"
              value={desde}
              onChange={(e) => setDesde(e.target.value)}
            />
          )}
        </Campo>
      )}
      <Botao type="submit">{t('corretiva.reabertura.reabrir')}</Botao>
    </form>
  );
}

/** A OS no corpo de uma OS ou da OS preventiva (PV3c): a corretiva e a preventiva usam o mesmo bloco. */
export type OsNoBloco = OsDoChamado | OsDaPagina;

/**
 * Uma OS em detalhe: situação, responsável, quem executa, arrendamento,
 * custo, códigos, checklist, assinatura, motivos, o aceite e a reabertura da
 * concluída, as fotos e o histórico. O detalhe do chamado mostra um por OS; a
 * página da OS (PV3c), um só.
 */
export function BlocoDaOs<O extends OsNoBloco>(props: {
  os: O;
  nomes: DetalheDoChamado['nomes'];
  refs: Referencias | null;
  codigos: CodigosDoTenant | null;
  assinaturaNoAceite: boolean;
  /** A OS tem ativo com parada possível: a reabertura oferece o equipamento parado. */
  temAtivo: boolean;
  aoAceitar: (
    os: O,
    custoInformado: number | null,
    codigos?: CodigosDaOsNaTela | undefined,
    assinatura?: Traco[] | null,
  ) => void;
  aoReabrir: (os: O, p: PedidoDeReabertura) => void;
}) {
  const t = useT();
  const intl = useIntl();
  const nomes = useNomes(props.refs);
  const { os: o, nomes: n } = props;
  const responsavel = nomes.nome(
    o.responsavel.tipo === 'tecnico'
      ? n.pessoas[o.responsavel.usuarioId]
      : n.equipes[o.responsavel.equipeId],
  );
  return (
    <div className="hk-pilha">
      <div className="hk-linha-de-botoes">
        <Selo tom={tomDoEstado(o.estado)}>
          {t('corretiva.os.situacao', {
            situacao: nomes.situacao(o.situacaoId),
            data: intl.formatDate(o.criadoEm, dataCurta),
          })}
        </Selo>
        <span className="hk-suave">{t('corretiva.os.responsavel', { nome: responsavel })}</span>
        <Link href={`/os/${o.id}/impressao`} data-imprimir-os={o.id}>
          {t('impressao_os.acao.abrir')}
        </Link>
      </div>
      <p className="hk-suave" data-executado-por={o.executadoPor}>
        {o.executadoPor === 'fornecedor'
          ? t('corretiva.os.executado_por_fornecedor', {
              nome: nomes.nome(o.fornecedorId ? n.fornecedores[o.fornecedorId] : null),
            })
          : t('corretiva.os.executado_pela_equipe')}
      </p>
      {o.responsavelArrendamento && (
        <p className="hk-suave" data-arrendamento={o.responsavelArrendamento}>
          {t('corretiva.os.arrendamento', {
            responsavel: o.responsavelArrendamento,
          })}
        </p>
      )}
      {o.locadorAvisadoEm && (
        <p className="hk-suave" data-locador-avisado={o.locadorAvisadoEm}>
          {t('corretiva.os.locador_avisado', {
            data: intl.formatDate(o.locadorAvisadoEm, dataCurta),
          })}
        </p>
      )}
      {o.custoInformado !== null && (
        <p className="hk-suave" data-custo={o.custoInformado}>
          {t('corretiva.os.custo', {
            custo: intl.formatNumber(o.custoInformado, {
              style: 'currency',
              currency: 'BRL',
            }),
          })}
        </p>
      )}
      <CodigosDaOs os={o} codigos={props.codigos} />
      <ChecklistDaOs key={`checklist-${o.id}-${o.versao}`} osId={o.id} estado={o.estado} />
      {o.assinaturaAceiteId && <AssinaturaDoAceite anexoId={o.assinaturaAceiteId} />}
      {o.motivoReabertura && (
        <p className="hk-suave">
          {t('corretiva.os.motivo_reabertura', { motivo: o.motivoReabertura })}
        </p>
      )}
      {o.motivoCancelamento && (
        <p className="hk-suave">
          {t('corretiva.motivo_cancelamento', { motivo: o.motivoCancelamento })}
        </p>
      )}
      {o.estado === 'concluida' && (
        <div className="hk-bloco" data-tom="atencao">
          <p className="hk-bloco-titulo">{t('corretiva.aceite.titulo')}</p>
          <p className="hk-suave">{t('corretiva.aceite.descricao')}</p>
          <Aceite
            os={o}
            codigos={props.codigos}
            assinaturaNoAceite={props.assinaturaNoAceite}
            aoAceitar={(custo, codigos, assinatura) =>
              props.aoAceitar(o, custo, codigos, assinatura)
            }
          />
          <Reabertura temAtivo={props.temAtivo} aoReabrir={(p) => props.aoReabrir(o, p)} />
        </div>
      )}
      <AnexosDoRegistro entidade="os" registroId={o.id} somenteLeitura />
      <HistoricoDoRegistro key={`${o.id}-${o.versao}`} entidade="os" registroId={o.id} />
    </div>
  );
}

export function ChamadoEmDetalhe(props: {
  detalhe: DetalheDoChamado;
  refs: Referencias | null;
  /** Os códigos do tenant (I6); sem eles, o aceite não mostra os campos de código. */
  codigos?: CodigosDoTenant | null;
  aoAceitar: (
    os: OsDoChamado,
    custoInformado: number | null,
    codigos?: CodigosDaOsNaTela | undefined,
    assinatura?: Traco[] | null,
  ) => void;
  aoReabrir: (os: OsDoChamado, p: PedidoDeReabertura) => void;
}) {
  const t = useT();
  const intl = useIntl();
  const nomes = useNomes(props.refs);
  const { chamado, os, nomes: n } = props.detalhe;
  return (
    <>
      <Painel
        titulo={t('corretiva.onde', { hotel: nomes.nome(n.hotel), local: nomes.nome(n.local) })}
      >
        <div className="hk-pilha">
          <p className="hk-texto-longo">{chamado.descricao}</p>
          <div className="hk-linha-de-botoes">
            <Selo tom={tomDoEstado(chamado.estado)}>{nomes.situacao(chamado.situacaoId)}</Selo>
            <SeloDePrioridade nivel={nomes.nivel(chamado.prioridadeId)}>
              {nomes.prioridade(chamado.prioridadeId)}
            </SeloDePrioridade>
          </div>
          <div>
            {chamado.ativoId && (
              <p className="hk-suave">
                {t('corretiva.chamado.ativo', { ativo: nomes.nome(n.ativo) })}
              </p>
            )}
            <p className="hk-suave">
              {t('corretiva.chamado.aberto_por', {
                nome: nomes.nome(n.pessoas[chamado.abertoPor]),
              })}
            </p>
            <p className="hk-suave">
              {t('corretiva.chamado.aberto_em', {
                data: intl.formatDate(chamado.criadoEm, dataCurta),
              })}
            </p>
            {chamado.prazoAtendimento && (
              <p className="hk-suave" data-prazo="atendimento">
                {t('corretiva.chamado.prazo_atendimento', {
                  data: intl.formatDate(chamado.prazoAtendimento, dataCurta),
                })}
              </p>
            )}
            {chamado.prazoSolucao && (
              <p className="hk-suave" data-prazo="solucao">
                {t('corretiva.chamado.prazo_solucao', {
                  data: intl.formatDate(chamado.prazoSolucao, dataCurta),
                })}
              </p>
            )}
            {chamado.pausadoSegundos > 0 && (
              <p className="hk-suave" data-prazo="pausado">
                {t('corretiva.chamado.relogio_parado', {
                  minutos: Math.ceil(chamado.pausadoSegundos / 60),
                })}
              </p>
            )}
            <p className="hk-suave" data-impacto={chaveDoImpacto(chamado.impactoHospede)}>
              {t('corretiva.chamado.impacto', { impacto: chaveDoImpacto(chamado.impactoHospede) })}
            </p>
            {chamado.motivoCancelamento && (
              <p className="hk-suave">
                {t('corretiva.motivo_cancelamento', { motivo: chamado.motivoCancelamento })}
              </p>
            )}
          </div>
        </div>
      </Painel>
      <Painel titulo={t('corretiva.chamado.os')}>
        {os.length === 0 ? (
          <MensagemVazia>{t('corretiva.chamado.sem_os')}</MensagemVazia>
        ) : (
          <ul className="hk-lista">
            {os.map((o) => (
              <li key={o.id} id={`os-${o.id}`}>
                <BlocoDaOs
                  os={o}
                  nomes={n}
                  refs={props.refs}
                  codigos={props.codigos ?? null}
                  assinaturaNoAceite={props.detalhe.assinaturaNoAceite}
                  temAtivo={chamado.ativoId !== null}
                  aoAceitar={props.aoAceitar}
                  aoReabrir={props.aoReabrir}
                />
              </li>
            ))}
          </ul>
        )}
      </Painel>
    </>
  );
}

const ROTULO_DA_ENTIDADE = {
  chamado: 'corretiva.linha_do_tempo.chamado',
  os: 'corretiva.linha_do_tempo.os',
  parada_ativo: 'corretiva.linha_do_tempo.parada_ativo',
  uh_indisponivel: 'corretiva.linha_do_tempo.uh_indisponivel',
} as const satisfies Record<EventoDaLinhaDoTempo['entidade'], Chave>;

export function LinhaDoTempo({ eventos }: { eventos: EventoDaLinhaDoTempo[] }) {
  const t = useT();
  const intl = useIntl();
  return (
    <Painel titulo={t('corretiva.linha_do_tempo.titulo')}>
      {eventos.length === 0 ? (
        <MensagemVazia>{t('corretiva.linha_do_tempo.vazia')}</MensagemVazia>
      ) : (
        <ol className="hk-tempo">
          {eventos.map((e) => (
            <li key={e.id}>
              <span>
                {t('corretiva.linha_do_tempo.evento', {
                  data: intl.formatDate(e.em, dataCurta),
                  acao: t(ROTULO_DA_ENTIDADE[e.entidade], { acao: e.acao }),
                })}
              </span>
              {e.usuarioNome && (
                <span className="hk-suave">
                  {t('corretiva.linha_do_tempo.por', { nome: e.usuarioNome })}
                </span>
              )}
              {e.motivo && (
                <span className="hk-suave">
                  {t('corretiva.linha_do_tempo.motivo', { motivo: e.motivo })}
                </span>
              )}
            </li>
          ))}
        </ol>
      )}
    </Painel>
  );
}
