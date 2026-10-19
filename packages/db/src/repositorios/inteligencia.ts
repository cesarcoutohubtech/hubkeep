// Job diário do Intelligence (ADR-036): a sessão de um tenant, com o hk_worker,
// numa unit of work só (executarComoSistema): as leituras e as gravações do dia
// estão na mesma transação, e a auditoria e os eventos entram no fim dela. Se
// algo falha, nada do dia fica gravado, e o job seguinte faz o dia de novo.
//
// Aqui só IO. As regras (quais hotéis e chamados entram, a OS que vale, a
// resolução das políticas, a decisão sobre cada detecção) são do
// packages/inteligencia, que este pacote não importa (ADR-037): as linhas saem
// como o banco as guarda, e a ligação do servidor do web as entrega ao motor.
//
// - Execução: uma auditoria por execução no tenant, mesmo sem gravar nada, com
//   quem disparou ('cron' ou o usuário do recálculo), o resumo, as versões das
//   fórmulas e a versão da política de cada hotel (Cesar, 10/10/2026). A
//   auditoria é do sistema (usuario_id vazio): quem disparou vai no registro.
// - Métrica (app.metrica_ativo_diaria): só INSERT, sem auditoria por linha
//   (a da execução conta as linhas) e sem evento.
// - Insight (app.insight): o job abre e atualiza a detecção, nunca o estado.
//   Uma auditoria por abertura e por atualização; evento insight.aberto, e
//   insight.subiu_de_faixa quando a faixa sobe (Cesar, 10/10/2026). Evento sem
//   consumidor fica pendente no outbox até existir quem o leia. A auditoria
//   do insight vai sem hotel_id (Cesar, 10/10/2026): a RLS da app.auditoria
//   deixaria o técnico e o solicitante do hotel lê-la, e o insight é só de
//   quem decide.
// - A chave do insight chega pronta (família, '|hoteis=' e o SHA-256 da lista
//   canônica, montado na ligação com node:crypto); o banco confere o formato.
import type {
  AcaoDaOs,
  EstadoDaOs,
  EstadoDoChamado,
  ExecutadoPor,
  ModuloContratado,
  StatusDeHotel,
} from '@hubkeep/dominio';
import { type NotNull, sql } from 'kysely';
import type { Tx } from '../conexao';
import { novoId } from '../ids';
import { transacaoDe, type UnidadeDeTrabalho } from '../unidade-de-trabalho';

export interface HotelDoJob {
  id: string;
  bandeiraId: string | null;
  status: StatusDeHotel;
  /** `app.hotel.fuso` (IANA): o dia da métrica é contado nele. */
  fuso: string;
}

export interface PoliticaDoJob {
  id: string;
  chave: string;
  escopo: 'grupo' | 'bandeira' | 'hotel';
  hotelId: string | null;
  bandeiraId: string | null;
  valor: unknown;
  atualizadoEm: Date;
}

export interface AtivoDoJob {
  id: string;
  hotelId: string;
  categoriaId: string | null;
  fabricante: string | null;
  modelo: string | null;
  /** Como no banco (check de 1 a 5); o motor confere. */
  criticidade: number | null;
  /** O último dia da garantia, à meia-noite UTC. */
  garantiaAte: Date | null;
  desativadoEm: Date | null;
  paradas: { inicio: Date; fim: Date | null }[];
  /**
   * As OS preventivas do ativo (PV3) criadas até `agora`, com as transições
   * até `agora`: as que ainda estão abertas, as previstas desde `desde` e as
   * tocadas desde `desde`. A preventiva atrasada é regra do domínio.
   */
  preventivas: { dataPrevista: string; transicoes: { para: EstadoDaOs; quando: Date }[] }[];
}

export interface TransicaoDoJob {
  acao: AcaoDaOs;
  para: EstadoDaOs;
  quando: Date;
}

export interface OsDoJob {
  estado: EstadoDaOs;
  criadaEm: Date;
  codigoFalha: string | null;
  executadoPor: ExecutadoPor;
  fornecedorId: string | null;
  custoInformado: number | null;
  transicoes: TransicaoDoJob[];
}

export interface ChamadoDoJob {
  id: string;
  hotelId: string;
  localId: string;
  ativoId: string | null;
  abertaEm: Date;
  estado: EstadoDoChamado;
  impactoHospede: boolean | null;
  os: OsDoJob[];
}

export interface LocalDoJob {
  id: string;
  hotelId: string;
  andar: string | null;
  tipo: 'uh' | 'area_comum';
}

export interface InsightDoJob {
  id: string;
  familia: string;
  hotelIds: string[];
  estado: string;
  faixa: string;
  abertoEm: Date;
  anteriorId: string | null;
  encerradoEm: Date | null;
  motivoDeDescarte: string | null;
}

export interface MetricaDoJob {
  dia: string;
  ativoId: string;
  hotelId: string;
  calculo: number;
  recalculo: boolean;
  reincidencia: number | null;
  atencao: number | null;
  faixaAtencao: string;
  versaoFormulaReincidencia: number;
  versaoFormulaAtencao: number;
  versaoPolitica: string;
  detalheReincidencia: unknown;
  detalheAtencao: unknown;
}

export interface NovoInsightDoJob {
  tipo: string;
  familia: string;
  /** A família, '|hoteis=' e o SHA-256 (hex) da lista canônica de hotéis. */
  chave: string;
  /** null no insight de rede. */
  hotelId: string | null;
  bandeiraId: string | null;
  hotelIds: readonly string[];
  escopo: Readonly<Record<string, string>>;
  faixa: string;
  valor: number | null;
  versaoScore: number;
  detalhe: unknown;
  evidencia: unknown;
  anteriorId: string | null;
  em: Date;
}

export interface DeteccaoNoInsightDoJob {
  insightId: string;
  faixa: string;
  valor: number | null;
  versaoScore: number;
  detalhe: unknown;
  evidencia: unknown;
  subiuDeFaixa: boolean;
  em: Date;
}

export interface ExecucaoNoBancoDoJob {
  disparadoPor: string;
  dia: string;
  recalculo: boolean;
  ativos: number;
  metricasGravadas: number;
  metricasJaGravadas: number;
  insightsAbertos: number;
  insightsAtualizados: number;
  insightsIgnorados: number;
  textosApagados: number;
  versoesDeFormula: Readonly<Record<string, number>>;
  versoesDePolitica: Readonly<Record<string, string>>;
}

/** O que o job lê e grava num tenant, tudo na transação da sessão. */
export interface SessaoDoJobDoIntelligence {
  modulos(): Promise<ModuloContratado[]>;
  hoteis(): Promise<HotelDoJob[]>;
  /** As linhas ativas de app.politica destas chaves, em todos os escopos. */
  politicas(chaves: readonly string[]): Promise<PoliticaDoJob[]>;
  /** Os ativos criados até `agora`, menos os baixados até `desde`, com as paradas do período. */
  ativos(agora: Date, desde: Date): Promise<AtivoDoJob[]>;
  /**
   * Os chamados abertos até `agora` e abertos depois de `desde` ou com
   * transição de OS entre `desde` e `agora`, com todas as OS e transições.
   */
  chamados(agora: Date, desde: Date): Promise<ChamadoDoJob[]>;
  locais(): Promise<LocalDoJob[]>;
  /** Os insights abertos e o último encerrado de cada família. */
  insights(): Promise<InsightDoJob[]>;
  /** O maior cálculo gravado de cada ativo no dia `AAAA-MM-DD`. */
  calculosDoDia(dia: string): Promise<Map<string, number>>;
  gravarMetricas(linhas: readonly MetricaDoJob[]): Promise<void>;
  abrirInsight(novo: NovoInsightDoJob): Promise<{ id: string }>;
  atualizarInsight(deteccao: DeteccaoNoInsightDoJob): Promise<void>;
  /** A auditoria da execução no tenant. */
  registrarExecucao(execucao: ExecucaoNoBancoDoJob): Promise<void>;
  /** As reclamações de hóspede avaliadas depois de `desde` e até `agora`, sem o texto (ADR-047). */
  sinais(agora: Date, desde: Date): Promise<SinalDoJob[]>;
  /** Apaga o texto das reclamações avaliadas antes de `ate`; devolve quantas. */
  apagarTextos(ate: Date, agora: Date): Promise<number>;
}

export interface SinalDoJob {
  id: string;
  hotelId: string;
  ocorridoEm: Date;
  nota: number | null;
  escala: number | null;
  manutencao: boolean | null;
  categoriaId: string | null;
  uhId: string | null;
  ativoId: string | null;
  ligacao: string;
}

/** As reclamações do trecho, sem o texto (ADR-047), na forma do motor. */
export async function sinaisNoTrecho(
  tx: Tx,
  desde: Date,
  ate: Date,
  hotelId?: string,
): Promise<SinalDoJob[]> {
  let q = tx
    .selectFrom('app.sinal_hospede')
    .select([
      'id',
      'hotel_id',
      'ocorrido_em',
      'nota',
      'escala',
      'manutencao',
      'categoria_id',
      'uh_id',
      'ativo_id',
      'ligacao',
    ])
    .where('ocorrido_em', '>', desde)
    .where('ocorrido_em', '<=', ate);
  if (hotelId) q = q.where('hotel_id', '=', hotelId);
  const linhas = await q.orderBy('ocorrido_em').orderBy('id').execute();
  return linhas.map((r) => ({
    id: r.id,
    hotelId: r.hotel_id,
    ocorridoEm: data(r.ocorrido_em),
    nota: r.nota === null ? null : Number(r.nota),
    escala: r.escala,
    manutencao: r.manutencao,
    categoriaId: r.categoria_id,
    uhId: r.uh_id,
    ativoId: r.ativo_id,
    ligacao: r.ligacao,
  }));
}

const LOTE_DE_METRICAS = 500;
const data = (v: Date | string): Date => new Date(v);
const dataDoDia = (v: string | null): Date | null => (v ? new Date(`${v}T00:00:00Z`) : null);

/** Os chamados do período: abertos até `agora`, e abertos depois de `desde` ou com transição de OS nesse trecho. */
function chamadosDoPeriodo(tx: Tx, agora: Date, desde: Date) {
  return tx
    .selectFrom('app.chamado as c')
    .where('c.criado_em', '<=', agora)
    .where((eb) =>
      eb.or([
        eb('c.criado_em', '>', desde),
        eb.exists(
          eb
            .selectFrom('app.os as o')
            .innerJoin('app.os_transicao as t', (j) =>
              j.onRef('t.hotel_id', '=', 'o.hotel_id').onRef('t.os_id', '=', 'o.id'),
            )
            .select(sql<number>`1`.as('um'))
            .whereRef('o.hotel_id', '=', 'c.hotel_id')
            .whereRef('o.chamado_id', '=', 'c.id')
            .where('t.quando', '>', desde)
            .where('t.quando', '<=', agora),
        ),
      ]),
    );
}

function porChave<T>(xs: readonly T[], k: (x: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const x of xs) {
    const lista = m.get(k(x));
    if (lista) lista.push(x);
    else m.set(k(x), [x]);
  }
  return m;
}

const colunasDoInsight = [
  'id',
  'familia',
  'hotel_ids',
  'estado',
  'faixa',
  'primeira_deteccao_em',
  'anterior_id',
  'encerrado_em',
  'motivo_descarte',
] as const;

export function sessaoDoJobDoIntelligence(uow: UnidadeDeTrabalho): SessaoDoJobDoIntelligence {
  const tx = transacaoDe(uow);
  return {
    async modulos() {
      const linhas = await tx
        .selectFrom('licenca.modulo')
        .select(['modulo', 'inicio', 'fim'])
        .where('tenant_id', '=', uow.tenantId)
        .execute();
      return linhas.map((m) => ({
        modulo: m.modulo,
        inicio: data(m.inicio),
        fim: m.fim && data(m.fim),
      }));
    },

    async hoteis() {
      const linhas = await tx
        .selectFrom('app.hotel')
        .select(['id', 'bandeira_id', 'status', 'fuso'])
        .orderBy('id')
        .execute();
      return linhas.map((h) => ({
        id: h.id,
        bandeiraId: h.bandeira_id,
        status: h.status,
        fuso: h.fuso,
      }));
    },

    async politicas(chaves) {
      if (!chaves.length) return [];
      const linhas = await tx
        .selectFrom('app.politica')
        .select(['id', 'chave', 'escopo_tipo', 'hotel_id', 'bandeira_id', 'valor', 'atualizado_em'])
        .where('ativa', '=', true)
        .where('chave', 'in', [...chaves])
        .execute();
      return linhas.map((l) => ({
        id: l.id,
        chave: l.chave,
        escopo: l.escopo_tipo as PoliticaDoJob['escopo'],
        hotelId: l.hotel_id,
        bandeiraId: l.bandeira_id,
        valor: l.valor,
        atualizadoEm: data(l.atualizado_em),
      }));
    },

    async ativos(agora, desde) {
      const preventivasDoPeriodo = () =>
        tx
          .selectFrom('app.os as o')
          .where('o.plano_id', 'is not', null)
          .where('o.criado_em', '<=', agora)
          .where((eb) =>
            eb.or([
              eb('o.estado', 'in', ['atribuida', 'em_execucao', 'pausada']),
              eb('o.data_prevista', '>=', sql<Date>`(${desde}::timestamptz)::date`),
              eb.exists(
                eb
                  .selectFrom('app.os_transicao as t')
                  .select(sql<number>`1`.as('um'))
                  .whereRef('t.hotel_id', '=', 'o.hotel_id')
                  .whereRef('t.os_id', '=', 'o.id')
                  .where('t.quando', '>=', desde),
              ),
            ]),
          );
      const [ativos, paradas, preventivas, transicoes] = await Promise.all([
        tx
          .selectFrom('app.ativo')
          .select([
            'id',
            'hotel_id',
            'categoria_id',
            'fabricante',
            'modelo',
            'criticidade',
            'desativado_em',
            sql<string | null>`garantia_ate::text`.as('garantia_ate'),
          ])
          .where('criado_em', '<=', agora)
          .where((eb) => eb.or([eb('desativado_em', 'is', null), eb('desativado_em', '>', desde)]))
          .orderBy('id')
          .execute(),
        tx
          .selectFrom('app.parada_ativo')
          .select(['ativo_id', 'inicio', 'fim'])
          .where('inicio', '<=', agora)
          .where((eb) => eb.or([eb('fim', 'is', null), eb('fim', '>', desde)]))
          .orderBy('inicio')
          .execute(),
        preventivasDoPeriodo()
          .select(['o.id', 'o.ativo_id', sql<string>`o.data_prevista::text`.as('data_prevista')])
          .$narrowType<{ ativo_id: NotNull }>()
          .orderBy('o.data_prevista')
          .orderBy('o.id')
          .execute(),
        tx
          .selectFrom('app.os_transicao')
          .select(['os_id', 'para', 'quando'])
          .where('os_id', 'in', preventivasDoPeriodo().select('o.id'))
          .where('quando', '<=', agora)
          .orderBy('quando')
          .execute(),
      ]);
      const doAtivo = porChave(paradas, (p) => p.ativo_id);
      const daOs = porChave(transicoes, (t) => t.os_id);
      const preventivasDoAtivo = porChave(preventivas, (p) => p.ativo_id);
      return ativos.map((a) => ({
        id: a.id,
        hotelId: a.hotel_id,
        categoriaId: a.categoria_id,
        fabricante: a.fabricante,
        modelo: a.modelo,
        criticidade: a.criticidade,
        garantiaAte: dataDoDia(a.garantia_ate),
        desativadoEm: a.desativado_em && data(a.desativado_em),
        paradas: (doAtivo.get(a.id) ?? []).map((p) => ({
          inicio: data(p.inicio),
          fim: p.fim && data(p.fim),
        })),
        preventivas: (preventivasDoAtivo.get(a.id) ?? []).map((p) => ({
          dataPrevista: p.data_prevista,
          transicoes: (daOs.get(p.id) ?? []).map((t) => ({
            para: t.para as EstadoDaOs,
            quando: data(t.quando),
          })),
        })),
      }));
    },

    async chamados(agora, desde) {
      const doPeriodo = () => chamadosDoPeriodo(tx, agora, desde);
      const [chamados, oss, transicoes] = await Promise.all([
        doPeriodo()
          .select([
            'c.id',
            'c.hotel_id',
            'c.local_id',
            'c.ativo_id',
            'c.criado_em',
            'c.estado',
            'c.impacto_hospede',
          ])
          .orderBy('c.id')
          .execute(),
        tx
          .selectFrom('app.os')
          .select([
            'id',
            'chamado_id',
            'estado',
            'criado_em',
            'codigo_falha_id',
            'executado_por',
            'fornecedor_id',
            'custo_informado',
          ])
          .where('chamado_id', 'in', doPeriodo().select('c.id'))
          .$narrowType<{ chamado_id: NotNull }>()
          .execute(),
        tx
          .selectFrom('app.os_transicao')
          .select(['os_id', 'acao', 'para', 'quando'])
          .where('os_id', 'in', (eb) =>
            eb
              .selectFrom('app.os')
              .select('id')
              .where('chamado_id', 'in', doPeriodo().select('c.id')),
          )
          .orderBy('quando')
          .execute(),
      ]);
      const daOs = porChave(transicoes, (t) => t.os_id);
      const doChamado = porChave(oss, (o) => o.chamado_id);
      return chamados.map((c) => ({
        id: c.id,
        hotelId: c.hotel_id,
        localId: c.local_id,
        ativoId: c.ativo_id,
        abertaEm: data(c.criado_em),
        estado: c.estado as EstadoDoChamado,
        impactoHospede: c.impacto_hospede,
        os: (doChamado.get(c.id) ?? []).map((o) => ({
          estado: o.estado as EstadoDaOs,
          criadaEm: data(o.criado_em),
          codigoFalha: o.codigo_falha_id,
          executadoPor: o.executado_por as ExecutadoPor,
          fornecedorId: o.fornecedor_id,
          custoInformado: o.custo_informado === null ? null : Number(o.custo_informado),
          transicoes: (daOs.get(o.id) ?? []).map((t) => ({
            acao: t.acao as AcaoDaOs,
            para: t.para as EstadoDaOs,
            quando: data(t.quando),
          })),
        })),
      }));
    },

    async locais() {
      const linhas = await tx
        .selectFrom('app.local')
        .select(['id', 'hotel_id', 'andar', 'tipo'])
        .orderBy('id')
        .execute();
      return linhas.map((l) => ({ id: l.id, hotelId: l.hotel_id, andar: l.andar, tipo: l.tipo }));
    },

    async insights() {
      const [abertos, encerrados] = await Promise.all([
        tx
          .selectFrom('app.insight')
          .select(colunasDoInsight)
          .where('encerrado_em', 'is', null)
          .execute(),
        tx
          .selectFrom('app.insight')
          .distinctOn('familia')
          .select(colunasDoInsight)
          .where('encerrado_em', 'is not', null)
          .orderBy('familia')
          .orderBy('encerrado_em', 'desc')
          .execute(),
      ]);
      return [...abertos, ...encerrados].map((i) => ({
        id: i.id,
        familia: i.familia,
        hotelIds: i.hotel_ids,
        estado: i.estado,
        faixa: i.faixa,
        abertoEm: data(i.primeira_deteccao_em),
        anteriorId: i.anterior_id,
        encerradoEm: i.encerrado_em && data(i.encerrado_em),
        motivoDeDescarte: i.motivo_descarte,
      }));
    },

    sinais: (agora, desde) => sinaisNoTrecho(tx, desde, agora),

    async apagarTextos(ate, agora) {
      const r = await tx
        .updateTable('app.sinal_hospede')
        .set({
          texto: null,
          texto_apagado_em: agora,
          versao: sql<number>`versao + 1`,
          atualizado_em: agora,
        })
        .where('texto', 'is not', null)
        .where('ocorrido_em', '<', ate)
        .executeTakeFirst();
      return Number(r.numUpdatedRows);
    },

    async calculosDoDia(dia) {
      const linhas = await tx
        .selectFrom('app.metrica_ativo_diaria')
        .select(['ativo_id', (eb) => eb.fn.max('calculo').as('calculo')])
        .where(sql<boolean>`dia = ${dia}::date`)
        .groupBy('ativo_id')
        .execute();
      return new Map(linhas.map((l) => [l.ativo_id, Number(l.calculo)]));
    },

    async gravarMetricas(linhas) {
      if (!linhas.length) return;
      for (let i = 0; i < linhas.length; i += LOTE_DE_METRICAS) {
        await tx
          .insertInto('app.metrica_ativo_diaria')
          .values(
            linhas.slice(i, i + LOTE_DE_METRICAS).map((m) => ({
              id: novoId(),
              tenant_id: uow.tenantId,
              hotel_id: m.hotelId,
              ativo_id: m.ativoId,
              dia: m.dia,
              calculo: m.calculo,
              recalculo: m.recalculo,
              reincidencia: m.reincidencia,
              atencao: m.atencao,
              faixa_atencao: m.faixaAtencao,
              versao_formula_reincidencia: m.versaoFormulaReincidencia,
              versao_formula_atencao: m.versaoFormulaAtencao,
              versao_politica: m.versaoPolitica,
              detalhe_reincidencia: JSON.stringify(m.detalheReincidencia),
              detalhe_atencao: JSON.stringify(m.detalheAtencao),
            })),
          )
          .execute();
      }
    },

    async abrirInsight(n) {
      const id = novoId();
      await tx
        .insertInto('app.insight')
        .values({
          id,
          tenant_id: uow.tenantId,
          hotel_id: n.hotelId,
          bandeira_id: n.bandeiraId,
          hotel_ids: [...n.hotelIds],
          tipo: n.tipo,
          familia: n.familia,
          chave: n.chave,
          escopo: JSON.stringify(n.escopo),
          faixa: n.faixa,
          valor: n.valor,
          versao_score: n.versaoScore,
          detalhe: JSON.stringify(n.detalhe),
          evidencia: JSON.stringify(n.evidencia),
          anterior_id: n.anteriorId,
          primeira_deteccao_em: n.em,
          ultima_deteccao_em: n.em,
        })
        .execute();
      uow.auditar({
        entidade: 'insight',
        registroId: id,
        acao: 'abrir',
        hotelId: null,
        depois: {
          tipo: n.tipo,
          familia: n.familia,
          hotelIds: n.hotelIds,
          faixa: n.faixa,
          valor: n.valor,
          versaoScore: n.versaoScore,
          anteriorId: n.anteriorId,
        },
      });
      uow.publicar({
        tipo: 'insight.aberto',
        entidade: 'insight',
        registroId: id,
        payload: {
          tipo: n.tipo,
          hotelId: n.hotelId,
          bandeiraId: n.bandeiraId,
          hotelIds: n.hotelIds,
          faixa: n.faixa,
          anteriorId: n.anteriorId,
        },
      });
      return { id };
    },

    async registrarExecucao(e) {
      uow.auditar({
        entidade: 'job_inteligencia',
        registroId: novoId(),
        acao: e.recalculo ? 'recalcular_dia' : 'calcular_dia',
        depois: {
          disparadoPor: e.disparadoPor,
          dia: e.dia,
          recalculo: e.recalculo,
          ativos: e.ativos,
          metricasGravadas: e.metricasGravadas,
          metricasJaGravadas: e.metricasJaGravadas,
          insightsAbertos: e.insightsAbertos,
          insightsAtualizados: e.insightsAtualizados,
          insightsIgnorados: e.insightsIgnorados,
          textosApagados: e.textosApagados,
          versoesDeFormula: e.versoesDeFormula,
          versoesDePolitica: e.versoesDePolitica,
        },
      });
    },

    async atualizarInsight(d) {
      const antes = await tx
        .selectFrom('app.insight')
        .select(['hotel_id', 'hotel_ids', 'faixa', 'valor', 'versao_score'])
        .where('id', '=', d.insightId)
        .executeTakeFirst();
      if (!antes) throw new Error(`Insight ${d.insightId} não encontrado no tenant do job.`);
      await tx
        .updateTable('app.insight')
        .set({
          ultima_deteccao_em: d.em,
          faixa: d.faixa,
          valor: d.valor,
          versao_score: d.versaoScore,
          detalhe: JSON.stringify(d.detalhe),
          evidencia: JSON.stringify(d.evidencia),
          versao: sql`versao + 1`,
          atualizado_em: d.em,
        })
        .where('id', '=', d.insightId)
        .execute();
      uow.auditar({
        entidade: 'insight',
        registroId: d.insightId,
        acao: 'atualizar_deteccao',
        hotelId: null,
        antes: { faixa: antes.faixa, valor: antes.valor, versaoScore: antes.versao_score },
        depois: { faixa: d.faixa, valor: d.valor, versaoScore: d.versaoScore },
      });
      if (d.subiuDeFaixa) {
        uow.publicar({
          tipo: 'insight.subiu_de_faixa',
          entidade: 'insight',
          registroId: d.insightId,
          payload: {
            hotelId: antes.hotel_id,
            hotelIds: antes.hotel_ids,
            de: antes.faixa,
            para: d.faixa,
          },
        });
      }
    },
  };
}
