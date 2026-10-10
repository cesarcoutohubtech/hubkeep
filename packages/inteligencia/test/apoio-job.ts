// Implementações em memória das portas do job diário, para os testes. Elas
// fazem o que a ligação real fará no banco: o insight nasce com uma chave por
// família e conjunto de hotéis, e a unicidade de um aberto por chave vale como
// no índice parcial da app.insight; a métrica só recebe INSERT, com o par
// (ativo, dia, cálculo) único. A ligação real monta a chave com o SHA-256 da
// lista canônica (node:crypto ou sha256()); aqui a lista entra como está, que é
// injetiva do mesmo jeito, e o pacote puro continua sem node (o hash é coberto
// no pgTAP e no teste da ligação).
import type { ModuloContratado } from '@hubkeep/dominio';
import {
  type AtivoDoDia,
  type AtualizacaoDeInsight,
  type ConfigSistemico,
  type CorretivaDaFonte,
  type DeteccaoDoDia,
  ESTADOS_ABERTOS_DO_INSIGHT,
  type FonteDoJob,
  type GravacaoDoJob,
  type HotelDoDia,
  type InsightExistente,
  type LinhaDaMetricaDiaria,
  type LocalAnalisado,
  type NovoInsight,
  SEPARADOR_DE_HOTEIS,
} from '../src';

/** A chave de unicidade na memória: a família e a lista canônica, sem o hash. */
export const chaveDeTeste = (familia: string, hotelIds: readonly string[]): string =>
  `${familia}|hoteis=${hotelIds.join(SEPARADOR_DE_HOTEIS)}`;

export interface InsightGravado extends InsightExistente {
  chave: string;
  tipo: string;
  valor: number | null;
  ultimaDeteccaoEm: Date;
}

export class BancoEmMemoria {
  metricas: LinhaDaMetricaDiaria[] = [];
  insights: InsightGravado[] = [];
  private seq = 0;

  gravarMetricas(linhas: readonly LinhaDaMetricaDiaria[]): void {
    for (const l of linhas) {
      const repetida = this.metricas.some(
        (m) => m.ativoId === l.ativoId && m.dia === l.dia && m.calculo === l.calculo,
      );
      if (repetida) throw new Error(`métrica repetida: ${l.ativoId} ${l.dia} ${l.calculo}`);
      this.metricas.push(l);
    }
  }

  abrir(n: NovoInsight): InsightGravado {
    const d = n.deteccao;
    const chave = chaveDeTeste(d.familia, d.hotelIds);
    const aberto = this.insights.some(
      (i) => i.chave === chave && ESTADOS_ABERTOS_DO_INSIGHT.includes(i.estado),
    );
    if (aberto) throw new Error(`um aberto por chave: ${chave}`);
    this.seq += 1;
    const novo: InsightGravado = {
      id: `i${this.seq}`,
      familia: d.familia,
      hotelIds: d.hotelIds,
      estado: 'novo',
      faixa: d.faixa,
      abertoEm: n.agora,
      anteriorId: n.anteriorId,
      encerradoEm: null,
      motivoDeDescarte: null,
      chave,
      tipo: d.tipo,
      valor: d.valor,
      ultimaDeteccaoEm: n.agora,
    };
    this.insights.push(novo);
    return novo;
  }

  atualizar(a: AtualizacaoDeInsight): void {
    const i = this.insights.find((x) => x.id === a.insightId);
    if (!i) throw new Error(`insight inexistente: ${a.insightId}`);
    i.faixa = a.deteccao.faixa;
    i.valor = a.deteccao.valor;
    i.ultimaDeteccaoEm = a.agora;
  }
}

export interface DadosDoTenant {
  hoteis: HotelDoDia[];
  ativos: AtivoDoDia[];
  corretivas: CorretivaDaFonte[];
  locais: LocalAnalisado[];
  sistemico?: ConfigSistemico;
  /** Sem a lista, o tenant tem o módulo `inteligencia` vigente desde 01/01/2026, sem prazo. */
  modulos?: ModuloContratado[];
}

export const MODULO_VIGENTE: ModuloContratado = {
  modulo: 'inteligencia',
  inicio: new Date('2026-01-01T03:00:00Z'),
  fim: null,
};

export class FonteEmMemoria implements FonteDoJob {
  constructor(
    private readonly banco: BancoEmMemoria,
    public dados: DadosDoTenant,
  ) {}
  /** As leituras feitas, em ordem, para conferir que o tenant sem o módulo só lê os módulos. */
  lidas: string[] = [];
  private ler = <T>(nome: string, valor: T): T => {
    this.lidas.push(nome);
    return valor;
  };
  modulos = async () => this.ler('modulos', this.dados.modulos ?? [MODULO_VIGENTE]);
  hoteis = async () => this.ler('hoteis', this.dados.hoteis);
  ativos = async () => this.ler('ativos', this.dados.ativos);
  corretivas = async (agora: Date) =>
    this.ler(
      'corretivas',
      this.dados.corretivas.filter((c) => c.abertaEm.getTime() <= agora.getTime()),
    );
  locais = async () => this.ler('locais', this.dados.locais);
  politicaSistemica = async () => this.ler('politicaSistemica', this.dados.sistemico);
  insights = async (): Promise<readonly InsightExistente[]> =>
    this.ler('insights', this.banco.insights);
  calculosDoDia = async (dia: string): Promise<ReadonlyMap<string, number>> => {
    this.lidas.push('calculosDoDia');
    const m = new Map<string, number>();
    for (const l of this.banco.metricas)
      if (l.dia === dia) m.set(l.ativoId, Math.max(m.get(l.ativoId) ?? 0, l.calculo));
    return m;
  };
}

export class GravacaoEmMemoria implements GravacaoDoJob {
  constructor(private readonly banco: BancoEmMemoria) {}
  gravarMetricas = async (linhas: readonly LinhaDaMetricaDiaria[]) =>
    this.banco.gravarMetricas(linhas);
  abrirInsight = async (n: NovoInsight) => {
    this.banco.abrir(n);
  };
  atualizarInsight = async (a: AtualizacaoDeInsight) => this.banco.atualizar(a);
}

export type { DeteccaoDoDia };
