// Calendário de SLA (fase 1c; ADR-042). Regras puras, sem IO:
//   - as políticas chamado.sla (prazos por prioridade e por categoria, os
//     motivos que param o relógio, o ponto facultativo e a meta) e
//     hotel.horario_atendimento (intervalos por dia da semana, na hora local
//     do hotel), com o formato validado aqui (o contrato da API repete);
//   - a regra do chamado: a linha da prioridade (pelo id, pela chave padrão ou
//     pelo peso mais próximo), sobreposta pela da categoria;
//   - os dias sem atendimento: os feriados oficiais (que a aplicação lê pela
//     porta FeriadosOficiais, sem o domínio conhecer biblioteca) e os do hotel;
//   - o cálculo: o prazo a partir de um instante, o tempo de relógio entre dois
//     instantes e o prazo refeito na retomada de uma pausa que parou o
//     relógio. No relógio 24x7 as horas são corridas; no de atendimento, só
//     contam as horas dentro dos intervalos do dia, e o feriado não conta.
// O fuso é sempre o do hotel (IANA), convertido pela Intl do JavaScript: a
// mudança de horário de verão, se voltar, sai da base de fusos do runtime.
import { PRIORIDADES_PADRAO } from './situacoes';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const objeto = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const HORA_MS = 3_600_000;
const DIA_MS = 24 * HORA_MS;

export const RELOGIOS_DE_SLA = ['24x7', 'atendimento'] as const;
export type RelogioDeSla = (typeof RELOGIOS_DE_SLA)[number];

/**
 * Motivos da pausa da OS (decisão 6 do Cesar de 13/10/2026). A lista é do
 * domínio, como os estados (ADR-027): o tenant escolhe quais param o relógio
 * (`motivosQuePausam`), não cria motivo. O check de app.os_transicao.motivo_pausa
 * repete os valores (migração 0043; tests/valores-canonicos-banco).
 */
export const MOTIVOS_DE_PAUSA = [
  'aguardando_peca',
  'aguardando_fornecedor',
  'uh_ocupada_sem_acesso',
  'fim_de_turno',
  'outro',
] as const;
export type MotivoDePausa = (typeof MOTIVOS_DE_PAUSA)[number];
export const ehMotivoDePausa = (v: unknown): v is MotivoDePausa =>
  typeof v === 'string' && (MOTIVOS_DE_PAUSA as readonly string[]).includes(v);

export const LIMITES_DO_SLA = {
  /** Prazo máximo de uma linha, em horas (90 dias). */
  horas: 2160,
  prioridades: 50,
  categorias: 200,
  intervalosPorDia: 4,
} as const;

/** Prazos de uma prioridade: horas de atendimento (até a OS gerada) e de solução (até o serviço concluído). */
export interface LinhaDeSla {
  atendimentoHoras: number;
  solucaoHoras: number;
  relogio: RelogioDeSla;
}

/** O que a categoria sobrepõe à linha da prioridade, e se a pausa da OS pode parar o relógio. */
export interface SlaDaCategoria {
  atendimentoHoras?: number;
  solucaoHoras?: number;
  relogio?: RelogioDeSla;
  pausa?: boolean;
}

export interface PoliticaDeSla {
  /** Pelo id da prioridade do tenant, ou pela chave padrão (urgente, alta, media, baixa). */
  porPrioridade: Record<string, LinhaDeSla>;
  /** Pelo id da categoria de ativo. */
  porCategoria: Record<string, SlaDaCategoria>;
  /** Motivos da pausa que param o relógio, na categoria com a pausa ligada. */
  motivosQuePausam: MotivoDePausa[];
  /** Ponto facultativo (Carnaval, Quarta-feira de Cinzas) como dia sem atendimento. */
  pontoFacultativo: boolean;
  /** Meta do % de SLA (decisão 4 da paridade de 10/10/2026). */
  metaPercentual: number;
}

/** Padrão de fábrica (decisão 2 do item 1 de propostas-desenho-1c), editável. */
export const SLA_PADRAO: PoliticaDeSla = {
  porPrioridade: {
    urgente: { atendimentoHoras: 1, solucaoHoras: 2, relogio: '24x7' },
    alta: { atendimentoHoras: 2, solucaoHoras: 8, relogio: '24x7' },
    media: { atendimentoHoras: 8, solucaoHoras: 24, relogio: 'atendimento' },
    baixa: { atendimentoHoras: 24, solucaoHoras: 72, relogio: 'atendimento' },
  },
  porCategoria: {},
  motivosQuePausam: ['aguardando_peca', 'aguardando_fornecedor', 'uh_ocupada_sem_acesso'],
  pontoFacultativo: false,
  metaPercentual: 90,
};

/** Horas positivas, em quartos de hora, até o limite. */
export const horasDeSlaValidas = (h: unknown): h is number =>
  typeof h === 'number' &&
  Number.isFinite(h) &&
  h > 0 &&
  h <= LIMITES_DO_SLA.horas &&
  Number.isInteger(h * 4);

const ehRelogio = (v: unknown): v is RelogioDeSla =>
  typeof v === 'string' && (RELOGIOS_DE_SLA as readonly string[]).includes(v);
const CHAVES_PADRAO = PRIORIDADES_PADRAO.map((p) => p.chave) as readonly string[];
const chaveDePrioridade = (k: string) => UUID.test(k) || CHAVES_PADRAO.includes(k);

function linhaValida(v: unknown): v is LinhaDeSla {
  return (
    objeto(v) &&
    Object.keys(v).length === 3 &&
    horasDeSlaValidas(v['atendimentoHoras']) &&
    horasDeSlaValidas(v['solucaoHoras']) &&
    (v['atendimentoHoras'] as number) <= (v['solucaoHoras'] as number) &&
    ehRelogio(v['relogio'])
  );
}

const CAMPOS_DA_CATEGORIA = ['atendimentoHoras', 'solucaoHoras', 'relogio', 'pausa'];
function categoriaValida(v: unknown): v is SlaDaCategoria {
  if (!objeto(v)) return false;
  const chaves = Object.keys(v);
  if (chaves.length === 0 || !chaves.every((k) => CAMPOS_DA_CATEGORIA.includes(k))) return false;
  if ('atendimentoHoras' in v && !horasDeSlaValidas(v['atendimentoHoras'])) return false;
  if ('solucaoHoras' in v && !horasDeSlaValidas(v['solucaoHoras'])) return false;
  if (
    'atendimentoHoras' in v &&
    'solucaoHoras' in v &&
    (v['atendimentoHoras'] as number) > (v['solucaoHoras'] as number)
  )
    return false;
  if ('relogio' in v && !ehRelogio(v['relogio'])) return false;
  if ('pausa' in v && typeof v['pausa'] !== 'boolean') return false;
  return true;
}

export function politicaDeSlaValida(v: unknown): v is PoliticaDeSla {
  if (!objeto(v) || Object.keys(v).length !== 5) return false;
  const { porPrioridade, porCategoria, motivosQuePausam, pontoFacultativo, metaPercentual } = v;
  if (!objeto(porPrioridade)) return false;
  const prioridades = Object.entries(porPrioridade);
  if (prioridades.length < 1 || prioridades.length > LIMITES_DO_SLA.prioridades) return false;
  if (!prioridades.every(([k, linha]) => chaveDePrioridade(k) && linhaValida(linha))) return false;
  if (!objeto(porCategoria)) return false;
  const categorias = Object.entries(porCategoria);
  if (categorias.length > LIMITES_DO_SLA.categorias) return false;
  if (!categorias.every(([k, c]) => UUID.test(k) && categoriaValida(c))) return false;
  if (
    !Array.isArray(motivosQuePausam) ||
    !motivosQuePausam.every(ehMotivoDePausa) ||
    new Set(motivosQuePausam).size !== motivosQuePausam.length
  )
    return false;
  if (typeof pontoFacultativo !== 'boolean') return false;
  return (
    Number.isInteger(metaPercentual) &&
    (metaPercentual as number) >= 1 &&
    (metaPercentual as number) <= 100
  );
}

// ---------------------------------------------------------------------------
// Horário de atendimento

/** Dias da semana na ordem de Date.getUTCDay (0 = domingo). */
export const DIAS_DA_SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'] as const;
export type DiaDaSemana = (typeof DIAS_DA_SEMANA)[number];

/** Intervalo na hora local do hotel, de `inicio` até `fim` (exclusive), em 'HH:MM'; `fim` aceita '24:00'. */
export interface IntervaloDeAtendimento {
  inicio: string;
  fim: string;
}
export type HorarioDeAtendimento = Record<DiaDaSemana, IntervaloDeAtendimento[]>;

/** Padrão do mock: de segunda a sexta, das 8h às 18h, e sábado, das 8h às 12h. */
export const HORARIO_PADRAO: HorarioDeAtendimento = {
  dom: [],
  seg: [{ inicio: '08:00', fim: '18:00' }],
  ter: [{ inicio: '08:00', fim: '18:00' }],
  qua: [{ inicio: '08:00', fim: '18:00' }],
  qui: [{ inicio: '08:00', fim: '18:00' }],
  sex: [{ inicio: '08:00', fim: '18:00' }],
  sab: [{ inicio: '08:00', fim: '12:00' }],
};

const HORA = /^([01]\d|2[0-3]):([0-5]\d)$/;
/** Minutos desde a meia-noite de 'HH:MM' ('24:00' só como fim); null fora do formato. */
function minutosDe(hhmm: unknown, fim: boolean): number | null {
  if (typeof hhmm !== 'string') return null;
  if (fim && hhmm === '24:00') return 24 * 60;
  const m = HORA.exec(hhmm);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

export function horarioDeAtendimentoValido(v: unknown): v is HorarioDeAtendimento {
  if (!objeto(v) || Object.keys(v).length !== DIAS_DA_SEMANA.length) return false;
  let total = 0;
  for (const dia of DIAS_DA_SEMANA) {
    const intervalos = v[dia];
    if (!Array.isArray(intervalos) || intervalos.length > LIMITES_DO_SLA.intervalosPorDia)
      return false;
    let ultimoFim = -1;
    for (const i of intervalos) {
      if (!objeto(i) || Object.keys(i).length !== 2) return false;
      const inicio = minutosDe(i['inicio'], false);
      const fim = minutosDe(i['fim'], true);
      if (inicio === null || fim === null || inicio >= fim || inicio < ultimoFim) return false;
      ultimoFim = fim;
    }
    total += intervalos.length;
  }
  return total >= 1;
}

// ---------------------------------------------------------------------------
// A regra do chamado

export interface PrioridadeParaSla {
  id: string;
  chavePadrao: string | null;
  peso: number;
}

/** A regra que vale para o chamado, com de onde veio a linha. */
export interface RegraDeSla extends LinhaDeSla {
  /** A pausa da OS pode parar o relógio (a categoria ligou). */
  pausa: boolean;
  origem: 'prioridade' | 'chave_padrao' | 'peso';
  /** A categoria do chamado sobrepôs algo da linha. */
  daCategoria: boolean;
}

/**
 * A regra do chamado, lida da política copiada na abertura (ADR-042): a linha
 * da prioridade pelo id; senão, pela chave padrão dela; senão, a da prioridade
 * de peso mais próximo que tem linha (no empate, a de peso maior, a mais
 * rigorosa). A linha pela chave padrão usa o peso da prioridade do tenant com
 * essa chave, ou o peso de fábrica. A categoria sobrepõe os campos que tem;
 * se o atendimento ficar maior que a solução, vale a solução.
 */
export function regraDeSla(p: {
  sla: PoliticaDeSla;
  prioridade: PrioridadeParaSla;
  prioridades: readonly PrioridadeParaSla[];
  categoriaId: string | null;
}): RegraDeSla {
  const { sla, prioridade } = p;
  let linha: LinhaDeSla | undefined = sla.porPrioridade[prioridade.id];
  let origem: RegraDeSla['origem'] = 'prioridade';
  if (!linha && prioridade.chavePadrao) {
    linha = sla.porPrioridade[prioridade.chavePadrao];
    origem = 'chave_padrao';
  }
  if (!linha) {
    origem = 'peso';
    linha = linhaDePesoMaisProximo(sla, prioridade.peso, p.prioridades);
  }
  const c = p.categoriaId !== null ? sla.porCategoria[p.categoriaId] : undefined;
  const solucaoHoras = c?.solucaoHoras ?? linha.solucaoHoras;
  return {
    atendimentoHoras: Math.min(c?.atendimentoHoras ?? linha.atendimentoHoras, solucaoHoras),
    solucaoHoras,
    relogio: c?.relogio ?? linha.relogio,
    pausa: c?.pausa ?? false,
    origem,
    daCategoria: c !== undefined,
  };
}

function linhaDePesoMaisProximo(
  sla: PoliticaDeSla,
  peso: number,
  prioridades: readonly PrioridadeParaSla[],
): LinhaDeSla {
  const pesoDaChave = (k: string): number | undefined =>
    prioridades.find((x) => x.id === k)?.peso ??
    prioridades.find((x) => x.chavePadrao === k)?.peso ??
    PRIORIDADES_PADRAO.find((x) => x.chave === k)?.peso;
  const candidatas = (fonte: PoliticaDeSla) =>
    Object.entries(fonte.porPrioridade).flatMap(([k, linha]) => {
      const pesoDaLinha = pesoDaChave(k);
      return pesoDaLinha === undefined ? [] : [{ peso: pesoDaLinha, linha }];
    });
  // Uma linha só por id de prioridade que já não existe no tenant: cai para o padrão de fábrica.
  const lista = candidatas(sla).length > 0 ? candidatas(sla) : candidatas(SLA_PADRAO);
  lista.sort((a, b) => Math.abs(a.peso - peso) - Math.abs(b.peso - peso) || b.peso - a.peso);
  return (lista[0] as { linha: LinhaDeSla }).linha;
}

/** A pausa para o relógio da solução: a categoria ligou e o motivo está na lista. Sem motivo, nunca. */
export const pausaParaORelogio = (
  regra: Pick<RegraDeSla, 'pausa'>,
  motivosQuePausam: readonly MotivoDePausa[],
  motivo: MotivoDePausa | null,
): boolean => regra.pausa && motivo !== null && motivosQuePausam.includes(motivo);

// ---------------------------------------------------------------------------
// Dias sem atendimento

export const TIPOS_DE_FERIADO_OFICIAL = ['feriado', 'ponto_facultativo', 'observancia'] as const;
export type TipoDeFeriadoOficial = (typeof TIPOS_DE_FERIADO_OFICIAL)[number];

export interface FeriadoOficial {
  /** 'AAAA-MM-DD', no calendário local. */
  data: string;
  tipo: TipoDeFeriadoOficial;
}

export interface FeriadoDoHotel {
  data: string;
  /** Repete todo ano no mesmo dia e mês (decisão 4). */
  anual: boolean;
}

const DATA = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * As datas sem atendimento nos anos pedidos: o feriado oficial; o ponto
 * facultativo, só com a opção ligada (decisão 5); nunca a observância; e os
 * feriados do hotel (os ativos, que a aplicação já filtrou), com o anual
 * repetido em cada ano. O anual de 29 de fevereiro só vale no ano bissexto.
 */
export function datasSemAtendimento(p: {
  oficiais: readonly FeriadoOficial[];
  doHotel: readonly FeriadoDoHotel[];
  pontoFacultativo: boolean;
  anos: readonly number[];
}): Set<string> {
  const datas = new Set<string>();
  for (const f of p.oficiais) {
    if (f.tipo === 'feriado' || (f.tipo === 'ponto_facultativo' && p.pontoFacultativo))
      datas.add(f.data);
  }
  for (const f of p.doHotel) {
    const m = DATA.exec(f.data);
    if (!m) continue;
    if (!f.anual) {
      datas.add(f.data);
      continue;
    }
    for (const ano of p.anos) {
      const d = new Date(Date.UTC(ano, Number(m[2]) - 1, Number(m[3])));
      if (d.getUTCMonth() === Number(m[2]) - 1) datas.add(d.toISOString().slice(0, 10));
    }
  }
  return datas;
}

// ---------------------------------------------------------------------------
// Fuso do hotel

const formatadores = new Map<string, Intl.DateTimeFormat>();
function formatador(fuso: string): Intl.DateTimeFormat {
  let f = formatadores.get(fuso);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: fuso,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatadores.set(fuso, f);
  }
  return f;
}

/** A hora local do instante no fuso, como se fosse UTC (para somar e comparar). */
function localComoUtc(instante: number, fuso: string): number {
  const partes: Record<string, number> = {};
  for (const p of formatador(fuso).formatToParts(new Date(instante))) {
    if (p.type !== 'literal') partes[p.type] = Number(p.value);
  }
  return Date.UTC(
    partes['year'] as number,
    (partes['month'] as number) - 1,
    partes['day'] as number,
    partes['hour'] as number,
    partes['minute'] as number,
    partes['second'] as number,
  );
}

/**
 * O instante da hora local (dada como UTC) no fuso. Os candidatos saem do
 * deslocamento de 12 horas antes e de 12 horas depois. Na hora que existe
 * duas vezes (o fim do horário de verão), vale a primeira; na que não existe
 * (o salto do começo), vale a mesma distância depois do salto.
 */
function instanteDaHoraLocal(local: number, fuso: string): number {
  const deslocamento = (instante: number) => localComoUtc(instante, fuso) - instante;
  const antes = local - deslocamento(local - DIA_MS / 2);
  const depois = local - deslocamento(local + DIA_MS / 2);
  const validos = [antes, depois].filter((c) => localComoUtc(c, fuso) === local);
  return validos.length > 0 ? Math.min(...validos) : Math.max(antes, depois);
}

// ---------------------------------------------------------------------------
// Cálculo

export interface CalendarioDeSla {
  /** Fuso IANA do hotel. */
  fuso: string;
  horario: HorarioDeAtendimento;
  /** Datas locais sem atendimento ('AAAA-MM-DD'), de datasSemAtendimento. */
  semAtendimento: ReadonlySet<string>;
}

/** Até quantos dias o cálculo procura horário (a política sempre tem um intervalo; o limite só evita laço sem fim). */
const DIAS_MAXIMOS = 3660;

/** Os trechos de atendimento [inicio, fim) em instantes, dia a dia local, a partir do dia local de `desde`. */
function* trechosDeAtendimento(desde: number, cal: CalendarioDeSla): Generator<[number, number]> {
  const dia0 = Math.floor(localComoUtc(desde, cal.fuso) / DIA_MS) * DIA_MS;
  for (let n = 0; n < DIAS_MAXIMOS; n++) {
    const dia = dia0 + n * DIA_MS;
    if (cal.semAtendimento.has(new Date(dia).toISOString().slice(0, 10))) continue;
    const semana = DIAS_DA_SEMANA[new Date(dia).getUTCDay()] as DiaDaSemana;
    for (const i of cal.horario[semana]) {
      const inicio = instanteDaHoraLocal(
        dia + (minutosDe(i.inicio, false) ?? 0) * 60_000,
        cal.fuso,
      );
      const fim = instanteDaHoraLocal(dia + (minutosDe(i.fim, true) ?? 0) * 60_000, cal.fuso);
      if (fim > inicio) yield [inicio, fim];
    }
  }
}

/**
 * O prazo: `horas` de relógio a partir de `inicio`. No 24x7, corridas; no de
 * atendimento, só dentro do horário e fora dos dias sem atendimento. O prazo
 * que cai exatamente no fim de um intervalo fica nesse fim.
 */
export function calcularPrazo(
  inicio: Date,
  horas: number,
  relogio: RelogioDeSla,
  cal: CalendarioDeSla,
): Date {
  return new Date(somarTempo(inicio.getTime(), Math.round(horas * HORA_MS), relogio, cal));
}

function somarTempo(inicio: number, ms: number, relogio: RelogioDeSla, cal: CalendarioDeSla) {
  if (relogio === '24x7') return inicio + ms;
  let restante = ms;
  for (const [a, b] of trechosDeAtendimento(inicio, cal)) {
    if (b <= inicio) continue;
    const de = Math.max(a, inicio);
    if (restante <= b - de) return de + restante;
    restante -= b - de;
  }
  throw new Error('Calendário de SLA sem horário de atendimento no período.');
}

/** O tempo de relógio, em milissegundos, de `inicio` a `fim` (zero se o fim não vem depois). */
export function tempoDeRelogioEntre(
  inicio: Date,
  fim: Date,
  relogio: RelogioDeSla,
  cal: CalendarioDeSla,
): number {
  const de = inicio.getTime();
  const ate = fim.getTime();
  if (ate <= de) return 0;
  if (relogio === '24x7') return ate - de;
  let total = 0;
  for (const [a, b] of trechosDeAtendimento(de, cal)) {
    if (a >= ate) break;
    total += Math.max(0, Math.min(b, ate) - Math.max(a, de));
  }
  return total;
}

/** O tempo de relógio em horas (ADR-042). */
export const horasDeRelogioEntre = (
  inicio: Date,
  fim: Date,
  relogio: RelogioDeSla,
  cal: CalendarioDeSla,
): number => tempoDeRelogioEntre(inicio, fim, relogio, cal) / HORA_MS;

/**
 * Na retomada da pausa que parou o relógio (ajuste C): o prazo de solução é
 * refeito com o tempo de relógio que faltava quando a OS pausou, contado a
 * partir da retomada; o tempo parado é o de relógio entre a pausa e a
 * retomada. A pausa que começou com o prazo já vencido não muda nada: o
 * prazo já foi perdido.
 */
export function prazoNaRetomada(p: {
  prazoSolucao: Date;
  pausadaEm: Date;
  retomadaEm: Date;
  relogio: RelogioDeSla;
  calendario: CalendarioDeSla;
}): { prazoSolucao: Date; pausadoMs: number } {
  const { prazoSolucao, pausadaEm, retomadaEm, relogio, calendario } = p;
  if (prazoSolucao.getTime() <= pausadaEm.getTime() || retomadaEm <= pausadaEm) {
    return { prazoSolucao, pausadoMs: 0 };
  }
  const faltava = tempoDeRelogioEntre(pausadaEm, prazoSolucao, relogio, calendario);
  return {
    prazoSolucao: new Date(somarTempo(retomadaEm.getTime(), faltava, relogio, calendario)),
    pausadoMs: tempoDeRelogioEntre(pausadaEm, retomadaEm, relogio, calendario),
  };
}

// ---------------------------------------------------------------------------
// Prazos do chamado

/** Os anos de feriados que um cálculo a partir de `inicio` pode cruzar: o anterior (o dia local pode ser o último do ano) até o limite de dias da procura. */
export function anosDoCalendario(inicio: Date): number[] {
  const ano = inicio.getUTCFullYear();
  const ultimo = new Date(inicio.getTime() + DIAS_MAXIMOS * DIA_MS).getUTCFullYear();
  const anos: number[] = [];
  for (let a = ano - 1; a <= ultimo; a++) anos.push(a);
  return anos;
}

/**
 * A região dos feriados oficiais do hotel (ADR-022): o país e a subdivisão do
 * hotel, com nulo herdando do tenant. A subdivisão do tenant só vale se o
 * hotel fica no país dele.
 */
export function regiaoDoHotel(
  hotel: { pais: string | null; subdivisao: string | null },
  tenant: { pais: string; subdivisao: string | null },
): { pais: string; subdivisao: string | null } {
  const pais = hotel.pais ?? tenant.pais;
  const subdivisao = hotel.subdivisao ?? (pais === tenant.pais ? tenant.subdivisao : null);
  return { pais, subdivisao };
}

/** O calendário do hotel: o fuso, o horário (da cópia) e as datas sem atendimento nos anos pedidos. */
export function calendarioDeSla(p: {
  fuso: string;
  horario: HorarioDeAtendimento;
  oficiais: readonly FeriadoOficial[];
  doHotel: readonly FeriadoDoHotel[];
  pontoFacultativo: boolean;
  anos: readonly number[];
}): CalendarioDeSla {
  return {
    fuso: p.fuso,
    horario: p.horario,
    semAtendimento: datasSemAtendimento(p),
  };
}

/** A cópia do SLA que o chamado guarda na abertura (ADR-042), dentro de `politica_aplicada`. */
export interface SlaAplicado {
  'chamado.sla': PoliticaDeSla;
  'hotel.horario_atendimento': HorarioDeAtendimento;
}

/**
 * A cópia do SLA lida do chamado. O chamado aberto antes da 0043, ou com a
 * cópia fora do formato, não tem: fica sem prazo, e nada o recalcula.
 */
export function slaDaCopia(politicaAplicada: unknown): SlaAplicado | null {
  if (!objeto(politicaAplicada)) return null;
  const sla = politicaAplicada['chamado.sla'];
  const horario = politicaAplicada['hotel.horario_atendimento'];
  return politicaDeSlaValida(sla) && horarioDeAtendimentoValido(horario)
    ? { 'chamado.sla': sla, 'hotel.horario_atendimento': horario }
    : null;
}

export interface PrazosDoChamado {
  prazoAtendimento: Date;
  prazoSolucao: Date;
}

/**
 * Os prazos a partir da abertura (ADR-042): as horas da regra no relógio
 * dela. O tempo já parado por pausas (em segundos de relógio) estende o prazo
 * de solução.
 */
export function prazosDoChamado(p: {
  abertoEm: Date;
  regra: Pick<RegraDeSla, 'atendimentoHoras' | 'solucaoHoras' | 'relogio'>;
  calendario: CalendarioDeSla;
  pausadoSegundos?: number;
}): PrazosDoChamado {
  const { abertoEm, regra, calendario } = p;
  const pausadas = (p.pausadoSegundos ?? 0) / 3600;
  return {
    prazoAtendimento: calcularPrazo(abertoEm, regra.atendimentoHoras, regra.relogio, calendario),
    prazoSolucao: calcularPrazo(abertoEm, regra.solucaoHoras + pausadas, regra.relogio, calendario),
  };
}

/**
 * O recálculo na triagem (troca de prioridade ou de categoria): os prazos
 * refeitos da abertura com a regra nova, com o tempo já pausado. O prazo de
 * atendimento só muda enquanto o chamado nunca teve OS; depois dela, fica o
 * gravado.
 */
export function prazosNoRecalculo(p: {
  abertoEm: Date;
  regra: Pick<RegraDeSla, 'atendimentoHoras' | 'solucaoHoras' | 'relogio'>;
  calendario: CalendarioDeSla;
  pausadoSegundos: number;
  jaTeveOs: boolean;
  prazoAtendimentoGravado: Date | null;
}): PrazosDoChamado {
  const novos = prazosDoChamado(p);
  return p.jaTeveOs && p.prazoAtendimentoGravado !== null
    ? { prazoAtendimento: p.prazoAtendimentoGravado, prazoSolucao: novos.prazoSolucao }
    : novos;
}

/**
 * A regra do chamado lida da cópia (ADR-042), com a prioridade e a categoria
 * dele. Sem cópia (chamado de antes da 0043) ou com a prioridade fora da
 * lista do tenant, null: nada de SLA para ele.
 */
export function slaDoChamado(p: {
  politicaAplicada: unknown;
  prioridadeId: string;
  prioridades: readonly PrioridadeParaSla[];
  categoriaId: string | null;
}): { copia: SlaAplicado; regra: RegraDeSla } | null {
  const copia = slaDaCopia(p.politicaAplicada);
  const prioridade = p.prioridades.find((x) => x.id === p.prioridadeId);
  if (!copia || !prioridade) return null;
  return {
    copia,
    regra: regraDeSla({
      sla: copia['chamado.sla'],
      prioridade,
      prioridades: p.prioridades,
      categoriaId: p.categoriaId,
    }),
  };
}

/**
 * A pausa da OS para o relógio da solução (decisão 6 e ajuste C): o chamado
 * tem SLA e prazo de solução, a categoria ligou a pausa e o motivo está na
 * lista da cópia. Sem motivo, nunca.
 */
export const pausaDoChamadoParaORelogio = (
  sla: { copia: SlaAplicado; regra: RegraDeSla } | null,
  prazoSolucao: Date | null,
  motivo: MotivoDePausa | null,
): boolean =>
  sla !== null &&
  prazoSolucao !== null &&
  pausaParaORelogio(sla.regra, sla.copia['chamado.sla'].motivosQuePausam, motivo);
