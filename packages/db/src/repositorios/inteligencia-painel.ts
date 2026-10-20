// O painel do Intelligence (as telas do 1.0), pelo hk_app com o contexto de
// quem pede: a RLS da app.insight deixa ler e decidir só quem decide, no
// próprio escopo (migração 0038), e a do chamado recorta os chamados da
// evidência. Aqui só IO; as regras (quem decide, as transições, o
// responsável) são do packages/inteligencia, que este pacote não importa
// (ADR-037).
//
// O detalhe do ativo lê a app.metrica_ativo_diaria: o resultado original de
// cada dia (o primeiro cálculo, sem recálculo; o recálculo é outra linha).
//
// A decisão grava o estado, o responsável e, no encerramento, quem encerrou,
// com a trava de versão, uma auditoria (ação = a ação da pessoa) e o evento
// insight.decidido. A auditoria do insight vai sem hotel_id (Cesar,
// 10/10/2026): a RLS da app.auditoria deixaria o técnico e o solicitante do
// hotel lê-la, e o insight é só de quem decide.
import { NaoEncontrado, conflitoDeVersao } from '@hubkeep/dominio';
import { sql } from 'kysely';
import type { Tx } from '../conexao';
import { transacaoDe, type UnidadeDeTrabalho } from '../unidade-de-trabalho';

export interface InsightDoPainelNoBanco {
  id: string;
  hotelId: string | null;
  bandeiraId: string | null;
  hotelIds: string[];
  tipo: string;
  escopo: Record<string, string>;
  estado: string;
  faixa: string;
  valor: number | null;
  versaoScore: number;
  anteriorId: string | null;
  primeiraDeteccaoEm: Date;
  ultimaDeteccaoEm: Date;
  responsavelId: string | null;
  encerradoEm: Date | null;
  encerradoPor: string | null;
  nota: string | null;
  motivoDeDescarte: string | null;
  versao: number;
}

export interface InsightComEvidenciaNoBanco extends InsightDoPainelNoBanco {
  detalhe: unknown;
  evidencia: unknown;
}

export interface FiltroDeInsightsNoBanco {
  estados: readonly string[];
  tipo?: string;
  faixa?: string;
  hotelId?: string;
}

export interface ContagemDeInsightsNoBanco {
  tipo: string;
  faixa: string;
  comResponsavel: boolean;
  quantidade: number;
}

export interface InsightLigadoNoBanco {
  id: string;
  anteriorId: string | null;
  abertoEm: Date;
  encerradoEm: Date | null;
}

export interface ChamadoDoInsightNoBanco {
  id: string;
  hotelId: string;
  ativoId: string | null;
  abertoEm: Date;
  estado: string;
  descricao: string;
}

export interface NomesDoPainelNoBanco {
  hoteis: Record<string, string>;
  bandeiras: Record<string, string>;
  pessoas: Record<string, string>;
  ativos: Record<string, string>;
}

export interface AtivoDoPainelNoBanco {
  id: string;
  nome: string;
  hotelId: string;
  bandeiraId: string | null;
  criticidade: number | null;
  desativadoEm: Date | null;
  /** O fuso do hotel do ativo. */
  fuso: string;
  /** AAAA-MM-DD; null sem a data. */
  dataCompra: string | null;
  /** AAAA-MM-DD; null sem a data. */
  garantiaAte: string | null;
}

export interface MetricaDoPainelNoBanco {
  dia: string;
  calculo: number;
  recalculo: boolean;
  calculadoEm: Date;
  atencao: number | null;
  faixa: string;
  reincidencia: number | null;
  versaoFormulaAtencao: number;
  versaoFormulaReincidencia: number;
  versaoPolitica: string;
  detalheAtencao: unknown;
  detalheReincidencia: unknown;
}

export interface DecisaoNoBanco {
  insightId: string;
  acao: string;
  versaoEsperada: number;
  estado: string;
  nota: string | null;
  motivoDeDescarte: string | null;
  responsavelId: string;
  encerradoEm: Date | null;
  encerradoPor: string | null;
  em: Date;
}

const data = (v: Date | string) => (v instanceof Date ? v : new Date(v));

const COLUNAS = [
  'id',
  'hotel_id',
  'bandeira_id',
  'hotel_ids',
  'tipo',
  'escopo',
  'estado',
  'faixa',
  'valor',
  'versao_score',
  'anterior_id',
  'primeira_deteccao_em',
  'ultima_deteccao_em',
  'responsavel_id',
  'encerrado_em',
  'encerrado_por',
  'nota',
  'motivo_descarte',
  'versao',
] as const;

type LinhaDoInsight = {
  id: string;
  hotel_id: string | null;
  bandeira_id: string | null;
  hotel_ids: string[];
  tipo: string;
  escopo: unknown;
  estado: string;
  faixa: string;
  valor: number | null;
  versao_score: number;
  anterior_id: string | null;
  primeira_deteccao_em: Date | string;
  ultima_deteccao_em: Date | string;
  responsavel_id: string | null;
  encerrado_em: Date | string | null;
  encerrado_por: string | null;
  nota: string | null;
  motivo_descarte: string | null;
  versao: number;
};

function doBanco(i: LinhaDoInsight): InsightDoPainelNoBanco {
  return {
    id: i.id,
    hotelId: i.hotel_id,
    bandeiraId: i.bandeira_id,
    hotelIds: i.hotel_ids,
    tipo: i.tipo,
    escopo: i.escopo as Record<string, string>,
    estado: i.estado,
    faixa: i.faixa,
    valor: i.valor,
    versaoScore: i.versao_score,
    anteriorId: i.anterior_id,
    primeiraDeteccaoEm: data(i.primeira_deteccao_em),
    ultimaDeteccaoEm: data(i.ultima_deteccao_em),
    responsavelId: i.responsavel_id,
    encerradoEm: i.encerrado_em === null ? null : data(i.encerrado_em),
    encerradoPor: i.encerrado_por,
    nota: i.nota,
    motivoDeDescarte: i.motivo_descarte,
    versao: i.versao,
  };
}

export async function contagensDeInsights(
  tx: Tx,
  estados: readonly string[],
): Promise<ContagemDeInsightsNoBanco[]> {
  if (!estados.length) return [];
  const linhas = await tx
    .selectFrom('app.insight')
    .select([
      'tipo',
      'faixa',
      sql<boolean>`responsavel_id is not null`.as('com_responsavel'),
      sql<number>`count(*)::int`.as('quantidade'),
    ])
    .where('estado', 'in', estados)
    .groupBy(['tipo', 'faixa', sql`responsavel_id is not null`])
    .execute();
  return linhas.map((l) => ({
    tipo: l.tipo,
    faixa: l.faixa,
    comResponsavel: l.com_responsavel,
    quantidade: l.quantidade,
  }));
}

export async function insightsDoPainel(
  tx: Tx,
  filtro: FiltroDeInsightsNoBanco,
  limite: number,
): Promise<InsightDoPainelNoBanco[]> {
  if (!filtro.estados.length) return [];
  let q = tx.selectFrom('app.insight').select(COLUNAS).where('estado', 'in', filtro.estados);
  if (filtro.tipo) q = q.where('tipo', '=', filtro.tipo);
  if (filtro.faixa) q = q.where('faixa', '=', filtro.faixa);
  if (filtro.hotelId) q = q.where(sql<boolean>`hotel_ids @> array[${filtro.hotelId}]::uuid[]`);
  const linhas = await q
    .orderBy('ultima_deteccao_em', 'desc')
    .orderBy('id')
    .limit(limite)
    .execute();
  return linhas.map(doBanco);
}

export async function insightDoPainel(
  tx: Tx,
  id: string,
): Promise<InsightComEvidenciaNoBanco | null> {
  const i = await tx
    .selectFrom('app.insight')
    .select([...COLUNAS, 'detalhe', 'evidencia'])
    .where('id', '=', id)
    .executeTakeFirst();
  return i ? { ...doBanco(i), detalhe: i.detalhe, evidencia: i.evidencia } : null;
}

/** Os anteriores destes insights e os que os têm como anterior. */
export async function insightsLigados(
  tx: Tx,
  ids: readonly string[],
): Promise<InsightLigadoNoBanco[]> {
  if (!ids.length) return [];
  const linhas = await tx
    .selectFrom('app.insight')
    .select(['id', 'anterior_id', 'primeira_deteccao_em', 'encerrado_em'])
    .where((eb) =>
      eb.or([
        eb('anterior_id', 'in', ids),
        eb(
          'id',
          'in',
          eb
            .selectFrom('app.insight as x')
            .select('x.anterior_id')
            .where('x.id', 'in', ids)
            .where('x.anterior_id', 'is not', null),
        ),
      ]),
    )
    .execute();
  return linhas.map((l) => ({
    id: l.id,
    anteriorId: l.anterior_id,
    abertoEm: data(l.primeira_deteccao_em),
    encerradoEm: l.encerrado_em === null ? null : data(l.encerrado_em),
  }));
}

export async function chamadosDoInsight(
  tx: Tx,
  ids: readonly string[],
): Promise<ChamadoDoInsightNoBanco[]> {
  if (!ids.length) return [];
  const linhas = await tx
    .selectFrom('app.chamado')
    .select(['id', 'hotel_id', 'ativo_id', 'criado_em', 'estado', 'descricao'])
    .where('id', 'in', ids)
    .execute();
  return linhas.map((c) => ({
    id: c.id,
    hotelId: c.hotel_id,
    ativoId: c.ativo_id,
    abertoEm: data(c.criado_em),
    estado: c.estado,
    descricao: c.descricao,
  }));
}

export async function nomesDoPainel(
  tx: Tx,
  p: {
    hotelIds: readonly string[];
    bandeiraIds: readonly string[];
    usuarioIds: readonly string[];
    ativoIds: readonly string[];
  },
): Promise<NomesDoPainelNoBanco> {
  const [hoteis, bandeiras, pessoas, ativos] = await Promise.all([
    p.hotelIds.length
      ? tx.selectFrom('app.hotel').select(['id', 'nome']).where('id', 'in', p.hotelIds).execute()
      : [],
    p.bandeiraIds.length
      ? tx
          .selectFrom('app.bandeira')
          .select(['id', 'nome'])
          .where('id', 'in', p.bandeiraIds)
          .execute()
      : [],
    p.usuarioIds.length
      ? tx
          .selectFrom('app.membro')
          .select(['usuario_id as id', 'nome'])
          .where('usuario_id', 'in', p.usuarioIds)
          .execute()
      : [],
    p.ativoIds.length
      ? tx.selectFrom('app.ativo').select(['id', 'nome']).where('id', 'in', p.ativoIds).execute()
      : [],
  ]);
  const mapa = (xs: readonly { id: string; nome: string }[]) =>
    Object.fromEntries(xs.map((x) => [x.id, x.nome]));
  return {
    hoteis: mapa(hoteis),
    bandeiras: mapa(bandeiras),
    pessoas: mapa(pessoas),
    ativos: mapa(ativos),
  };
}

export async function decidirInsightNoBanco(
  uow: UnidadeDeTrabalho,
  d: DecisaoNoBanco,
): Promise<{ versao: number }> {
  const tx = transacaoDe(uow);
  // O FOR UPDATE aplica também a policy de UPDATE: fora do escopo, não há linha.
  const antes = await tx
    .selectFrom('app.insight')
    .select(['estado', 'responsavel_id', 'hotel_id', 'hotel_ids', 'versao'])
    .where('id', '=', d.insightId)
    .forUpdate()
    .executeTakeFirst();
  if (!antes) throw new NaoEncontrado('insight_nao_encontrado', 'Insight não encontrado.');
  if (antes.versao !== d.versaoEsperada) throw conflitoDeVersao(antes.versao);
  const r = await tx
    .updateTable('app.insight')
    .set({
      estado: d.estado,
      nota: d.nota,
      motivo_descarte: d.motivoDeDescarte,
      responsavel_id: d.responsavelId,
      encerrado_em: d.encerradoEm,
      encerrado_por: d.encerradoPor,
      versao: sql<number>`versao + 1`,
      atualizado_em: d.em,
    })
    .where('id', '=', d.insightId)
    .returning('versao')
    .executeTakeFirstOrThrow();
  uow.auditar({
    entidade: 'insight',
    registroId: d.insightId,
    acao: d.acao,
    hotelId: null,
    antes: { estado: antes.estado, responsavelId: antes.responsavel_id, versao: antes.versao },
    depois: {
      estado: d.estado,
      responsavelId: d.responsavelId,
      nota: d.nota,
      motivoDeDescarte: d.motivoDeDescarte,
      versao: r.versao,
    },
  });
  uow.publicar({
    tipo: 'insight.decidido',
    entidade: 'insight',
    registroId: d.insightId,
    payload: {
      acao: d.acao,
      de: antes.estado,
      para: d.estado,
      hotelId: antes.hotel_id,
      hotelIds: antes.hotel_ids,
      responsavelId: d.responsavelId,
    },
  });
  return { versao: r.versao };
}

export async function ativoDoPainel(tx: Tx, id: string): Promise<AtivoDoPainelNoBanco | null> {
  const a = await tx
    .selectFrom('app.ativo as a')
    .innerJoin('app.hotel as h', 'h.id', 'a.hotel_id')
    .select([
      'a.id',
      'a.nome',
      'a.hotel_id',
      'h.bandeira_id',
      'a.criticidade',
      'a.desativado_em',
      'h.fuso',
      sql<string | null>`a.data_compra::text`.as('data_compra'),
      sql<string | null>`a.garantia_ate::text`.as('garantia_ate'),
    ])
    .where('a.id', '=', id)
    .executeTakeFirst();
  return a
    ? {
        id: a.id,
        nome: a.nome,
        hotelId: a.hotel_id,
        bandeiraId: a.bandeira_id,
        criticidade: a.criticidade,
        desativadoEm: a.desativado_em === null ? null : data(a.desativado_em),
        fuso: a.fuso,
        dataCompra: a.data_compra,
        garantiaAte: a.garantia_ate,
      }
    : null;
}

export interface AtivoEncontradoNoBanco {
  id: string;
  nome: string;
  hotelId: string;
  bandeiraId: string | null;
}

/**
 * "Procurar ativo" no Intelligence: os ativos sem baixa cujo texto de busca
 * (`app.ativo.busca`, já normalizado) contém o termo, em ordem de nome, até
 * `limite`. A RLS recorta o que quem pede lê; o motor recorta quem decide.
 */
export async function ativosPorBusca(
  tx: Tx,
  termo: string,
  limite: number,
): Promise<AtivoEncontradoNoBanco[]> {
  const linhas = await tx
    .selectFrom('app.ativo as a')
    .innerJoin('app.hotel as h', 'h.id', 'a.hotel_id')
    .select(['a.id', 'a.nome', 'a.hotel_id', 'h.bandeira_id'])
    .where('a.busca', 'ilike', `%${termo.replace(/[\\%_]/g, '\\$&')}%`)
    .where('a.desativado_em', 'is', null)
    .orderBy('a.nome')
    .orderBy('a.id')
    .limit(limite)
    .execute();
  return linhas.map((a) => ({
    id: a.id,
    nome: a.nome,
    hotelId: a.hotel_id,
    bandeiraId: a.bandeira_id,
  }));
}

const COLUNAS_DA_METRICA = [
  sql<string>`dia::text`.as('dia'),
  'calculo',
  'recalculo',
  'calculado_em',
  'atencao',
  'faixa_atencao',
  'reincidencia',
  'versao_formula_atencao',
  'versao_formula_reincidencia',
  'versao_politica',
  'detalhe_atencao',
  'detalhe_reincidencia',
] as const;

/**
 * O resultado de cada dia a partir de `desde` (AAAA-MM-DD): o original (o
 * primeiro cálculo sem recálculo) ou, no dia que o job nunca gravou, o
 * primeiro recálculo, que é o único registro dele (ADR-036).
 */
export async function metricasDoAtivo(
  tx: Tx,
  ativoId: string,
  desde: string,
): Promise<MetricaDoPainelNoBanco[]> {
  const linhas = await tx
    .selectFrom('app.metrica_ativo_diaria')
    .distinctOn('dia')
    .select(COLUNAS_DA_METRICA)
    .where('ativo_id', '=', ativoId)
    .where('dia', '>=', sql<Date>`${desde}::date`)
    .orderBy('dia')
    .orderBy('recalculo')
    .orderBy('calculo')
    .execute();
  return linhas.map(metricaDoPainel);
}

/** Os recálculos de um dia (AAAA-MM-DD) do ativo, do primeiro ao último, até `limite`. */
export async function recalculosDoDia(
  tx: Tx,
  ativoId: string,
  dia: string,
  limite: number,
): Promise<MetricaDoPainelNoBanco[]> {
  const linhas = await tx
    .selectFrom('app.metrica_ativo_diaria')
    .select(COLUNAS_DA_METRICA)
    .where('ativo_id', '=', ativoId)
    .where('recalculo', '=', true)
    .where('dia', '=', sql<Date>`${dia}::date`)
    .orderBy('calculo')
    .limit(limite)
    .execute();
  return linhas.map(metricaDoPainel);
}

function metricaDoPainel(m: {
  dia: string;
  calculo: number;
  recalculo: boolean;
  calculado_em: Date;
  atencao: number | null;
  faixa_atencao: string;
  reincidencia: number | null;
  versao_formula_atencao: number;
  versao_formula_reincidencia: number;
  versao_politica: string;
  detalhe_atencao: unknown;
  detalhe_reincidencia: unknown;
}): MetricaDoPainelNoBanco {
  return {
    dia: m.dia,
    calculo: m.calculo,
    recalculo: m.recalculo,
    calculadoEm: data(m.calculado_em),
    atencao: m.atencao,
    faixa: m.faixa_atencao,
    reincidencia: m.reincidencia,
    versaoFormulaAtencao: m.versao_formula_atencao,
    versaoFormulaReincidencia: m.versao_formula_reincidencia,
    versaoPolitica: m.versao_politica,
    detalheAtencao: m.detalhe_atencao,
    detalheReincidencia: m.detalhe_reincidencia,
  };
}

/** Os insights de um tipo com o par `chave` = `valor` no escopo, do mais novo ao mais antigo. */
export async function insightsDoEscopo(
  tx: Tx,
  tipo: string,
  chave: string,
  valor: string,
  limite: number,
): Promise<InsightDoPainelNoBanco[]> {
  const linhas = await tx
    .selectFrom('app.insight')
    .select(COLUNAS)
    .where('tipo', '=', tipo)
    .where(sql<boolean>`escopo ->> ${chave} = ${valor}`)
    .orderBy('primeira_deteccao_em', 'desc')
    .orderBy('id')
    .limit(limite)
    .execute();
  return linhas.map(doBanco);
}
