// Indicadores do painel da 1c (item 8 do docs/13), pelas definições do
// glossário único de métricas (docs/referencia/glossario-metricas.md, versão 3,
// aprovada por Cesar e Kaio em 13/10/2026). Cálculo na leitura, sem tabela de
// agregados (decisão 9 do Cesar, de 13/10/2026).
//
// O período é de dias locais: cada hotel o converte em instantes pelo próprio
// fuso (regra 5 do glossário). Por isso o cálculo sai primeiro numa parcial
// por hotel, com as somas e as durações, e a rede ou a bandeira somam as
// parciais antes de calcular os percentuais e as médias: a média da bandeira
// é a do conjunto, e não a média dos percentuais de cada hotel.
//
// O chamado cancelado fica fora de toda métrica, pelo estado de agora, também
// nos dias anteriores ao cancelamento (termo "corretiva"). Horas corridas em
// todos os tempos (regra 6); o % de SLA usa o prazo de solução já calculado
// pelo calendário (ADR-042).
import type { EstadoDaOs, EstadoDoChamado } from './corretiva';
import { escopoCobreHotel } from './equipes';
import { PermissaoNegada, RegraViolada } from './erros';
import { type Resultado, vigente } from './permissoes';
import { conclusaoEReaberturas, type TransicaoDoServico } from './servico-da-os';
import { inicioDoDiaLocal } from './sla';
import type { Atribuicao, Papel } from './tipos';
import { uhDiasPerdidos, type PeriodoDeUhIndisponivel } from './uh-indisponivel';

const HORA_MS = 3_600_000;
const DIA_MS = 24 * HORA_MS;

export const LIMITES_DO_PAINEL = {
  /** O período mais longo de uma consulta, em dias (a meta do painel vai até 92). */
  diasPorConsulta: 92,
  /** A maior tolerância da preventiva em dia, em dias. */
  toleranciaMaxima: 30,
  /**
   * Na comparação na bandeira, o hotel só concorre ao destaque de melhor de
   * uma coluna de percentual com pelo menos estes itens no período; abaixo, o
   * percentual aparece como "amostra pequena" (Cesar, 15/10/2026; a ajustar
   * no piloto).
   */
  amostraMinimaDoDestaque: 10,
} as const;

/** A coluna de percentual tem itens bastantes para concorrer ao destaque? */
export const amostraSuficiente = (itens: number): boolean =>
  itens >= LIMITES_DO_PAINEL.amostraMinimaDoDestaque;

/** As faixas do backlog por idade, em dias completos desde a abertura. */
export const FAIXAS_DE_IDADE = [
  'ate_2',
  'de_3_a_7',
  'de_8_a_15',
  'de_16_a_30',
  'mais_de_30',
] as const;
export type FaixaDeIdade = (typeof FAIXAS_DE_IDADE)[number];

const faixaDaIdade = (dias: number): FaixaDeIdade =>
  dias <= 2
    ? 'ate_2'
    : dias <= 7
      ? 'de_3_a_7'
      : dias <= 15
        ? 'de_8_a_15'
        : dias <= 30
          ? 'de_16_a_30'
          : 'mais_de_30';

// ---------------------------------------------------------------------------
// Período

/** O período escolhido na tela: do primeiro ao último dia local, inclusive. */
export interface PeriodoDoPainel {
  /** aaaa-mm-dd */
  inicio: string;
  /** aaaa-mm-dd */
  fim: string;
}

const DIA = /^(\d{4})-(\d{2})-(\d{2})$/;

const diaValido = (dia: string): boolean => {
  const m = DIA.exec(dia);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.toISOString().slice(0, 10) === dia;
};

/** O dia local n dias depois (ou antes, com n negativo). */
export const somarDias = (dia: string, n: number): string => {
  const [a, m, d] = dia.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(a, m - 1, d) + n * DIA_MS).toISOString().slice(0, 10);
};

/** Os dias do período, em ordem. */
export const diasDoPeriodo = (p: PeriodoDoPainel): string[] => {
  const dias: string[] = [];
  for (let dia = p.inicio; dia <= p.fim; dia = somarDias(dia, 1)) dias.push(dia);
  return dias;
};

/** Confere o período: dias válidos, o fim no início ou depois, até 92 dias. */
export function validarPeriodoDoPainel(p: PeriodoDoPainel): void {
  const valido =
    diaValido(p.inicio) &&
    diaValido(p.fim) &&
    p.inicio <= p.fim &&
    somarDias(p.inicio, LIMITES_DO_PAINEL.diasPorConsulta - 1) >= p.fim;
  if (!valido) {
    throw new RegraViolada('indicadores_periodo_invalido', 'Período inválido.', {
      maximoDias: LIMITES_DO_PAINEL.diasPorConsulta,
    });
  }
}

/** O período em instantes no fuso do hotel: [de, ate), com o ate no começo do dia seguinte ao fim. */
export const intervaloNoFuso = (p: PeriodoDoPainel, fuso: string): { de: Date; ate: Date } => ({
  de: inicioDoDiaLocal(p.inicio, fuso),
  ate: inicioDoDiaLocal(somarDias(p.fim, 1), fuso),
});

// ---------------------------------------------------------------------------
// Entrada

/** Uma OS como os indicadores a leem: o estado e as transições. */
export interface OsDoIndicador {
  id: string;
  estado: EstadoDaOs;
  /** A equipe da OS, para a produtividade; null sem equipe. */
  equipeId: string | null;
  transicoes: readonly TransicaoDoServico[];
}

/** Um chamado (corretiva) como os indicadores o leem, com as OS dele. */
export interface ChamadoDoIndicador {
  id: string;
  estado: EstadoDoChamado;
  abertoEm: Date;
  /** null no chamado sem SLA (aberto antes do calendário, ADR-042). */
  prazoSolucao: Date | null;
  pausadoSegundos: number;
  os: readonly OsDoIndicador[];
}

/** Uma OS preventiva, com a data prevista no dia local do hotel. */
export interface PreventivaDoIndicador extends OsDoIndicador {
  /** aaaa-mm-dd */
  dataPrevista: string;
}

/** Um trecho de trabalho apontado numa OS (`app.os_apontamento`). */
export interface ApontamentoDoIndicador {
  osId: string;
  inicio: Date;
  fim: Date;
}

export interface EntradaDoHotel {
  hotelId: string;
  fuso: string;
  /** As UHs ativas do hotel (`app.local`, tipo 'uh', status 'ativo'). */
  uhsAtivas: number;
  /** A tolerância da preventiva em dia, pela política `preventiva.tolerancia_dias`. */
  toleranciaDias: number;
  chamados: readonly ChamadoDoIndicador[];
  preventivas: readonly PreventivaDoIndicador[];
  periodosDeUh: readonly PeriodoDeUhIndisponivel[];
  apontamentos: readonly ApontamentoDoIndicador[];
}

// ---------------------------------------------------------------------------
// Termos de base no chamado

/**
 * A conclusão do serviço do chamado em `agora`: a da OS que a tem (termo de
 * base "conclusão do serviço"). Com mais de uma OS concluída, vale a mais
 * recente.
 */
export function conclusaoDoChamado(c: ChamadoDoIndicador, agora: Date): Date | null {
  let conclusao: Date | null = null;
  for (const os of c.os) {
    const { concluidaEm } = conclusaoEReaberturas(os.transicoes, agora);
    if (concluidaEm && (!conclusao || concluidaEm > conclusao)) conclusao = concluidaEm;
  }
  return conclusao;
}

const valido = (c: ChamadoDoIndicador) => c.estado !== 'cancelado';
const dentro = (t: Date, de: Date, ate: Date) => t >= de && t < ate;

/** O backlog no instante: os chamados não cancelados, já abertos e sem a conclusão do serviço. */
export const noBacklog = (c: ChamadoDoIndicador, instante: Date): boolean =>
  valido(c) && c.abertoEm <= instante && conclusaoDoChamado(c, instante) === null;

// ---------------------------------------------------------------------------
// Parcial do hotel

export interface SomasDeSla {
  /** Os chamados com o prazo de solução vencido no período (ou concluídos antes dele). */
  total: number;
  dentroDoPrazo: number;
  /** Os com o prazo no período que ainda correm, sem conclusão: fora da conta até vencer. */
  aindaNoPrazo: number;
  /** O tempo pausado dos chamados do total, em segundos. */
  pausadoSegundos: number;
}

export interface SomasDePreventiva {
  /** As preventivas com data prevista no período, não canceladas, com o limite já passado ou concluídas. */
  total: number;
  emDia: number;
  /** Passaram do limite sem conclusão (termo "preventiva atrasada"). */
  atrasadas: number;
  /** O limite ainda não passou e não foram concluídas: fora da conta até vencer. */
  aindaNoPrazo: number;
}

export interface DiaDaSerie {
  /** aaaa-mm-dd, no fuso de cada hotel. */
  dia: string;
  /** O backlog no fim do dia (ou agora, no dia de hoje). */
  backlog: number;
  abertos: number;
  /** Os chamados com a conclusão do serviço no dia. */
  encerrados: number;
}

export interface ProdutividadeDaEquipe {
  hotelId: string;
  /** null: as OS sem equipe. */
  equipeId: string | null;
  osConcluidas: number;
  /** Os segundos apontados dentro do período. */
  segundosApontados: number;
}

/** O que o hotel soma no período; a rede e a bandeira somam as parciais. */
export interface ParcialDeIndicadores {
  hoteis: number;
  uhsAtivas: number;
  abertos: number;
  backlog: number;
  backlogPorIdade: Record<FaixaDeIdade, number>;
  sla: SomasDeSla;
  /** Da abertura à conclusão do serviço, em horas, dos chamados concluídos no período. */
  horasAteAConclusao: number[];
  preventiva: SomasDePreventiva;
  preventivasConcluidas: number;
  /** As corretivas com a conclusão do serviço no período (a base do MTTR). */
  corretivasConcluidas: number;
  uhDias: number;
  serie: DiaDaSerie[];
  produtividade: ProdutividadeDaEquipe[];
}

const faixasZeradas = (): Record<FaixaDeIdade, number> =>
  Object.fromEntries(FAIXAS_DE_IDADE.map((f) => [f, 0])) as Record<FaixaDeIdade, number>;

/**
 * A parcial do hotel no período, em `agora`. O instante de leitura do backlog
 * é o fim do período ou agora, o que vier antes.
 */
export function parcialDoHotel(
  e: EntradaDoHotel,
  periodo: PeriodoDoPainel,
  agora: Date,
): ParcialDeIndicadores {
  const { de, ate } = intervaloNoFuso(periodo, e.fuso);
  const corte = ate < agora ? ate : agora;
  const chamados = e.chamados.filter(valido);
  const conclusao = new Map(chamados.map((c) => [c.id, conclusaoDoChamado(c, agora)]));

  // Backlog e backlog por idade, no corte.
  const backlogPorIdade = faixasZeradas();
  let backlog = 0;
  for (const c of chamados) {
    if (!noBacklog(c, corte)) continue;
    backlog += 1;
    backlogPorIdade[faixaDaIdade(Math.floor((corte.getTime() - c.abertoEm.getTime()) / DIA_MS))] +=
      1;
  }

  // % de SLA: o prazo de solução vence no período.
  const sla: SomasDeSla = { total: 0, dentroDoPrazo: 0, aindaNoPrazo: 0, pausadoSegundos: 0 };
  for (const c of chamados) {
    if (!c.prazoSolucao || !dentro(c.prazoSolucao, de, ate)) continue;
    const fim = conclusao.get(c.id) ?? null;
    if (!fim && c.prazoSolucao >= agora) {
      sla.aindaNoPrazo += 1;
      continue;
    }
    sla.total += 1;
    sla.pausadoSegundos += c.pausadoSegundos;
    if (fim && fim <= c.prazoSolucao) sla.dentroDoPrazo += 1;
  }

  // MTTR e a base da razão: a conclusão do serviço no período.
  const horasAteAConclusao: number[] = [];
  for (const c of chamados) {
    const fim = conclusao.get(c.id);
    if (fim && dentro(fim, de, ate)) {
      horasAteAConclusao.push((fim.getTime() - c.abertoEm.getTime()) / HORA_MS);
    }
  }

  // Preventiva em dia, pela data prevista no período e o limite no fuso do hotel.
  const preventiva: SomasDePreventiva = { total: 0, emDia: 0, atrasadas: 0, aindaNoPrazo: 0 };
  let preventivasConcluidas = 0;
  for (const p of e.preventivas) {
    if (p.estado === 'cancelada') continue;
    const { concluidaEm } = conclusaoEReaberturas(p.transicoes, agora);
    if (concluidaEm && dentro(concluidaEm, de, ate)) preventivasConcluidas += 1;
    if (p.dataPrevista < periodo.inicio || p.dataPrevista > periodo.fim) continue;
    const limite = inicioDoDiaLocal(somarDias(p.dataPrevista, e.toleranciaDias + 1), e.fuso);
    if (concluidaEm) {
      preventiva.total += 1;
      if (concluidaEm < limite) preventiva.emDia += 1;
    } else if (limite <= agora) {
      preventiva.total += 1;
      preventiva.atrasadas += 1;
    } else {
      preventiva.aindaNoPrazo += 1;
    }
  }

  // A série diária: o backlog no fim de cada dia, os abertos e os encerrados.
  const serie: DiaDaSerie[] = [];
  for (const dia of diasDoPeriodo(periodo)) {
    const inicioDia = inicioDoDiaLocal(dia, e.fuso);
    if (inicioDia > agora) break;
    const fimDia = inicioDoDiaLocal(somarDias(dia, 1), e.fuso);
    const instante = fimDia < agora ? fimDia : agora;
    let b = 0;
    let abertos = 0;
    let encerrados = 0;
    for (const c of chamados) {
      if (noBacklog(c, instante)) b += 1;
      if (dentro(c.abertoEm, inicioDia, fimDia)) abertos += 1;
      const fim = conclusao.get(c.id);
      if (fim && dentro(fim, inicioDia, fimDia)) encerrados += 1;
    }
    serie.push({ dia, backlog: b, abertos, encerrados });
  }

  // Produtividade: as OS concluídas no período e as horas apontadas nele, por equipe.
  const porEquipe = new Map<string | null, ProdutividadeDaEquipe>();
  const daEquipe = (equipeId: string | null) => {
    let p = porEquipe.get(equipeId);
    if (!p) {
      p = { hotelId: e.hotelId, equipeId, osConcluidas: 0, segundosApontados: 0 };
      porEquipe.set(equipeId, p);
    }
    return p;
  };
  const equipeDaOs = new Map<string, string | null>();
  const todasAsOs = [...chamados.flatMap((c) => c.os), ...e.preventivas];
  for (const os of todasAsOs) {
    equipeDaOs.set(os.id, os.equipeId);
    if (os.estado === 'cancelada') continue;
    const { concluidaEm } = conclusaoEReaberturas(os.transicoes, agora);
    if (concluidaEm && dentro(concluidaEm, de, ate)) daEquipe(os.equipeId).osConcluidas += 1;
  }
  for (const a of e.apontamentos) {
    if (!equipeDaOs.has(a.osId)) continue;
    const ms =
      Math.min(a.fim.getTime(), ate.getTime()) - Math.max(a.inicio.getTime(), de.getTime());
    if (ms > 0) daEquipe(equipeDaOs.get(a.osId) ?? null).segundosApontados += Math.round(ms / 1000);
  }

  return {
    hoteis: 1,
    uhsAtivas: e.uhsAtivas,
    abertos: chamados.filter((c) => dentro(c.abertoEm, de, ate)).length,
    backlog,
    backlogPorIdade,
    sla,
    horasAteAConclusao,
    preventiva,
    preventivasConcluidas,
    corretivasConcluidas: horasAteAConclusao.length,
    uhDias: uhDiasPerdidos(
      e.periodosDeUh.filter((p) => p.hotelId === e.hotelId),
      de,
      ate,
      agora,
    ),
    serie,
    produtividade: [...porEquipe.values()],
  };
}

/** A parcial vazia: a soma de nenhum hotel. */
export const parcialVazia = (): ParcialDeIndicadores => ({
  hoteis: 0,
  uhsAtivas: 0,
  abertos: 0,
  backlog: 0,
  backlogPorIdade: faixasZeradas(),
  sla: { total: 0, dentroDoPrazo: 0, aindaNoPrazo: 0, pausadoSegundos: 0 },
  horasAteAConclusao: [],
  preventiva: { total: 0, emDia: 0, atrasadas: 0, aindaNoPrazo: 0 },
  preventivasConcluidas: 0,
  corretivasConcluidas: 0,
  uhDias: 0,
  serie: [],
  produtividade: [],
});

/** A soma das parciais: a rede, ou a bandeira. A série soma pelo dia local de cada hotel. */
export function somarParciais(parciais: readonly ParcialDeIndicadores[]): ParcialDeIndicadores {
  const s = parcialVazia();
  const serie = new Map<string, DiaDaSerie>();
  for (const p of parciais) {
    s.hoteis += p.hoteis;
    s.uhsAtivas += p.uhsAtivas;
    s.abertos += p.abertos;
    s.backlog += p.backlog;
    for (const f of FAIXAS_DE_IDADE) s.backlogPorIdade[f] += p.backlogPorIdade[f];
    s.sla.total += p.sla.total;
    s.sla.dentroDoPrazo += p.sla.dentroDoPrazo;
    s.sla.aindaNoPrazo += p.sla.aindaNoPrazo;
    s.sla.pausadoSegundos += p.sla.pausadoSegundos;
    s.horasAteAConclusao.push(...p.horasAteAConclusao);
    s.preventiva.total += p.preventiva.total;
    s.preventiva.emDia += p.preventiva.emDia;
    s.preventiva.atrasadas += p.preventiva.atrasadas;
    s.preventiva.aindaNoPrazo += p.preventiva.aindaNoPrazo;
    s.preventivasConcluidas += p.preventivasConcluidas;
    s.corretivasConcluidas += p.corretivasConcluidas;
    s.uhDias += p.uhDias;
    for (const d of p.serie) {
      const acumulado = serie.get(d.dia) ?? { dia: d.dia, backlog: 0, abertos: 0, encerrados: 0 };
      acumulado.backlog += d.backlog;
      acumulado.abertos += d.abertos;
      acumulado.encerrados += d.encerrados;
      serie.set(d.dia, acumulado);
    }
    s.produtividade.push(...p.produtividade);
  }
  s.uhDias = umaCasa(s.uhDias);
  s.serie = [...serie.values()].sort((a, b) => (a.dia < b.dia ? -1 : 1));
  return s;
}

// ---------------------------------------------------------------------------
// Indicadores

const umaCasa = (n: number) => Math.round(n * 10) / 10;
const duasCasas = (n: number) => Math.round(n * 100) / 100;
const percentual = (parte: number, total: number) =>
  total === 0 ? null : umaCasa((parte / total) * 100);
const por100Uhs = (n: number, uhs: number) => (uhs === 0 ? null : umaCasa((n / uhs) * 100));

function mediana(valores: readonly number[]): number | null {
  if (valores.length === 0) return null;
  const v = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(v.length / 2);
  return v.length % 2 === 1
    ? (v[meio] as number)
    : ((v[meio - 1] as number) + (v[meio] as number)) / 2;
}

export interface Indicadores {
  backlog: number;
  backlogPorIdade: Record<FaixaDeIdade, number>;
  backlogPor100Uhs: number | null;
  /** % de SLA, com uma casa; null sem chamado na conta. */
  percentualDeSla: number | null;
  sla: SomasDeSla & {
    /** A média do tempo pausado por chamado da conta, em segundos inteiros. */
    pausadoMedioSegundos: number | null;
  };
  /** MTTR em horas, com uma casa, e a mediana ao lado. */
  mttrHoras: number | null;
  medianaHoras: number | null;
  corretivasConcluidas: number;
  percentualDePreventivaEmDia: number | null;
  preventiva: SomasDePreventiva;
  preventivasConcluidas: number;
  /** Preventivas concluídas para cada corretiva, com duas casas; null sem corretiva. */
  preventivasPorCorretiva: number | null;
  /** As preventivas no total das concluídas, em %. */
  percentualDePreventivas: number | null;
  abertos: number;
  chamadosPor100Uhs: number | null;
  uhDias: number;
  uhsAtivas: number;
  hoteis: number;
}

/** Os indicadores de uma parcial: de um hotel, da bandeira ou da rede. */
export function indicadoresDaParcial(p: ParcialDeIndicadores): Indicadores {
  const n = p.horasAteAConclusao.length;
  const soma = p.horasAteAConclusao.reduce((a, h) => a + h, 0);
  const med = mediana(p.horasAteAConclusao);
  const concluidas = p.preventivasConcluidas + p.corretivasConcluidas;
  return {
    backlog: p.backlog,
    backlogPorIdade: { ...p.backlogPorIdade },
    backlogPor100Uhs: por100Uhs(p.backlog, p.uhsAtivas),
    percentualDeSla: percentual(p.sla.dentroDoPrazo, p.sla.total),
    sla: {
      ...p.sla,
      pausadoMedioSegundos:
        p.sla.total === 0 ? null : Math.round(p.sla.pausadoSegundos / p.sla.total),
    },
    mttrHoras: n === 0 ? null : umaCasa(soma / n),
    medianaHoras: med === null ? null : umaCasa(med),
    corretivasConcluidas: p.corretivasConcluidas,
    percentualDePreventivaEmDia: percentual(p.preventiva.emDia, p.preventiva.total),
    preventiva: { ...p.preventiva },
    preventivasConcluidas: p.preventivasConcluidas,
    preventivasPorCorretiva:
      p.corretivasConcluidas === 0
        ? null
        : duasCasas(p.preventivasConcluidas / p.corretivasConcluidas),
    percentualDePreventivas: percentual(p.preventivasConcluidas, concluidas),
    abertos: p.abertos,
    chamadosPor100Uhs: por100Uhs(p.abertos, p.uhsAtivas),
    uhDias: p.uhDias,
    uhsAtivas: p.uhsAtivas,
    hoteis: p.hoteis,
  };
}

// ---------------------------------------------------------------------------
// Quem vê

/** A gestão vê o painel inteiro, no escopo dela (propostas de desenho da 1c, seção 3). */
export const PAPEIS_DO_PAINEL: readonly Papel[] = ['admin_grupo', 'gestor_csc', 'gerente_hotel'];

/**
 * O que a pessoa vê de um hotel:
 * - 'completa': a gestão com escopo que cobre o hotel;
 * - 'cartoes': o proprietário (o locador é o proprietário, decisão 6) do hotel
 *   ou de UHs dele, só com o backlog, os UH-dias e os chamados, sem
 *   produtividade e sem comparação; o que ele lê do hotel a RLS decide. Se o
 *   hotel é dele, quem diz é o banco (authz.hoteis_proprietario e
 *   authz.locais_proprietario), porque a RLS não mostra os vínculos a ele;
 * - null: nada (o hotel fica fora do painel).
 */
export type VisaoDoHotel = 'completa' | 'cartoes';

export function visaoDoHotel(
  minhas: readonly Atribuicao[],
  hotel: { id: string; bandeiraId: string | null; doUsuarioComoProprietario: boolean },
  agora: Date,
): VisaoDoHotel | null {
  const vigentes = minhas.filter((a) => vigente(a, agora));
  if (vigentes.some((a) => PAPEIS_DO_PAINEL.includes(a.papel) && escopoCobreHotel(a, hotel))) {
    return 'completa';
  }
  const proprietario = vigentes.some(
    (a) => a.papel === 'proprietario' && a.escopo.tipo === 'proprietario',
  );
  return proprietario && hotel.doUsuarioComoProprietario ? 'cartoes' : null;
}

/** Abre o painel quem tem um papel da gestão ou de proprietário vigente. */
export function podeVerIndicadores(minhas: readonly Atribuicao[], agora: Date): Resultado {
  return minhas.some(
    (a) => vigente(a, agora) && (PAPEIS_DO_PAINEL.includes(a.papel) || a.papel === 'proprietario'),
  )
    ? { permitido: true }
    : {
        permitido: false,
        erro: new PermissaoNegada(
          'indicadores_sem_permissao',
          'Só a gestão e o proprietário veem o painel de indicadores.',
        ),
      };
}
