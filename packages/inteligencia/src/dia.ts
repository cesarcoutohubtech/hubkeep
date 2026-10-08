// O cálculo do job diário (ADR-036), em função pura: com o histórico de um
// tenant, já lido pelas portas do núcleo e com as políticas já resolvidas por
// hotel, devolve o resultado do dia por ativo (os scores com o detalhamento e
// a linha da métrica diária) e as detecções que o job passa a decidirDeteccao.
// A aplicação lê, chama isto e grava pela unit of work; nada aqui lê banco.
//
// O resultado gravado de cada dia é a fonte de verdade do histórico (decisão
// de 06/10/2026): ele guarda a configuração usada, a versão da fórmula de cada
// score e a da política (condição do Cesar de 07/10/2026, ADR-036), e nada
// gravado é apagado. Recalcular um dia passado não reproduz exatamente o que foi
// gravado, e por isso fica marcado como recálculo, com as versões de hoje. As
// datas são cortadas em `agora` (para o recálculo, o fim do dia: `fimDoDia`), e
// a conclusão e as reaberturas saem das transições da OS até `agora`
// (conclusaoEReaberturas), mas a origem só tem o valor atual de:
// - os campos editáveis da OS, do chamado, do ativo e do local;
// - a política vigente.
//
// Aprovado por Kaio em 06/10/2026 (PR #100) e pelo Cesar em 07/10/2026:
// - no 1.0, insight nasce de dois tipos: a atenção do ativo, quando passa do
//   limite, e o sinal sistêmico. A reincidência já é componente da atenção e
//   não abre insight próprio, para o mesmo ativo não ter dois; a substituição
//   fica na tela do ativo;
// - as horas paradas e o impacto no hóspede da atenção usam a janela da
//   reincidência do hotel; o custo informado, 12 meses (365 dias);
// - o sinal sistêmico não tem score: entra com a faixa fixa 'atencao' e vale
//   no hotel quando todas as corretivas são de um hotel; senão, na rede, da
//   bandeira quando os hotéis são todos dela, ou do grupo.
import type { Parada } from '@hubkeep/dominio';
import {
  type ConfigAtencao,
  type MedicoesDoAtivo,
  PADRAO_ATENCAO,
  atencaoDoAtivo,
} from './atencao';
import type { LinhaDaMetricaDiaria } from './agregacao';
import {
  type AtivoAnalisado,
  type Corretiva,
  type Criticidade,
  type LocalAnalisado,
  custoInformadoNaJanela,
  horasParadasNoTrecho,
  impactoHospedeDosChamados,
  situacaoDaGarantia,
} from './historico';
import {
  type AlcanceDoInsight,
  type Deteccao,
  familiaDoInsight,
  listaCanonicaDeHoteis,
} from './insight';
import { type ConfigReincidencia, PADRAO_REINCIDENCIA, reincidencia } from './reincidencia';
import { DIA_MS, type Score, sugereInsight } from './score';
import {
  type ConfigSistemico,
  PADRAO_SISTEMICO,
  type RegraSistemica,
  type SinalSistemico,
  detectarSistemicos,
} from './sistemico';

export const JANELA_CUSTO_DIAS = 365;
/** A versão da política de um hotel que só usa os padrões do código. */
export const VERSAO_DE_POLITICA_PADRAO = 'padrao';
/** Faixa do insight sistêmico, que não tem score (aprovado em 06/10/2026). */
export const FAIXA_DO_SISTEMICO = 'atencao';

export interface HotelDoDia {
  hotelId: string;
  bandeiraId: string | null;
  /** Políticas do hotel, já resolvidas (hotel → bandeira → grupo → padrão). */
  reincidencia?: ConfigReincidencia;
  atencao?: ConfigAtencao;
  /**
   * Identifica as linhas de app.politica que resolveram as duas políticas (por
   * exemplo, o id e o tualizado_em de cada uma), montado por quem lê o banco;
   * padrao quando valem só os padrões do código. O motor só a carrega para a
   * linha do dia.
   */
  versaoPolitica?: string;
}

export interface AtivoDoDia extends AtivoAnalisado {
  criticidade: Criticidade | null;
  /** Paradas do ativo (C5), as abertas com fim null. */
  paradas: readonly Parada[];
  /** Preventiva vencida do ativo (etapa P); ausente sem dado. */
  preventivaAtrasada?: boolean | null;
  /** Medições do checklist tipado na janela (P1); ausente sem dado. */
  medicoes?: MedicoesDoAtivo | null;
}

export interface EntradaDoDia {
  agora: Date;
  /** O dia está sendo calculado de novo (ou depois da hora); a linha sai marcada. */
  recalculo?: boolean;
  hoteis: readonly HotelDoDia[];
  ativos: readonly AtivoDoDia[];
  /** Corretivas do tenant; as de ativo ou hotel fora da lista são ignoradas. */
  corretivas: readonly Corretiva[];
  locais: readonly LocalAnalisado[];
  /** Política do grupo: o sinal sistêmico cruza hotéis. */
  sistemico?: ConfigSistemico;
}

export interface ResultadoDoAtivo {
  ativoId: string;
  hotelId: string;
  reincidencia: Score<ConfigReincidencia>;
  atencao: Score<ConfigAtencao>;
}

export type TipoDeInsight = 'atencao_ativo' | 'sistemico';

export interface DeteccaoDoDia extends Deteccao {
  tipo: TipoDeInsight;
  alcance: AlcanceDoInsight;
  /** O score que sugeriu, para o insight guardar; null no sistêmico. */
  valor: number | null;
  versao: number;
  /** O que o insight guarda como escopo: ids e chaves, nunca texto. */
  escopo: Readonly<Record<string, string>>;
  regra?: RegraSistemica;
  /**
   * Todos os hotéis envolvidos, em ordem. Quem lê o insight precisa ter acesso a
   * todos (a RLS da app.insight); por isso o escopo e a evidência só citam estes.
   */
  hotelIds: readonly string[];
  /** Ids de origem (corretivas), que a RLS da tabela de origem filtra. */
  corretivaIds: readonly string[];
}

export interface ResultadoDoDia {
  /** O dia em UTC, `AAAA-MM-DD`. */
  dia: string;
  recalculo: boolean;
  ativos: ResultadoDoAtivo[];
  /** Sem o calculo, que quem grava numera (1, ou o maior do dia mais 1). */
  metricas: Omit<LinhaDaMetricaDiaria, 'calculo'>[];
  sistemicos: SinalSistemico[];
  deteccoes: DeteccaoDoDia[];
}

function porChave<T, K>(xs: readonly T[], k: (x: T) => K): Map<K, T[]> {
  const m = new Map<K, T[]>();
  for (const x of xs) m.set(k(x), [...(m.get(k(x)) ?? []), x]);
  return m;
}

function alcanceDoSinal(
  s: SinalSistemico,
  hoteis: ReadonlyMap<string, HotelDoDia>,
): AlcanceDoInsight {
  const ids = s.evidencia.hotelIds;
  if (ids.length === 1) {
    const h = hoteis.get(ids[0] as string);
    return { tipo: 'hotel', hotelId: ids[0] as string, bandeiraId: h?.bandeiraId ?? null };
  }
  const bandeiras = new Set(ids.map((id) => hoteis.get(id)?.bandeiraId ?? null));
  const [unica] = [...bandeiras];
  return { tipo: 'rede', bandeiraId: bandeiras.size === 1 ? (unica ?? null) : null };
}

export function calcularDia(e: EntradaDoDia): ResultadoDoDia {
  const agora = e.agora.getTime();
  const hoteis = new Map(e.hoteis.map((h) => [h.hotelId, h]));
  const ativos = e.ativos.filter((a) => hoteis.has(a.hotelId));
  const idsDeAtivo = new Set(ativos.map((a) => a.id));
  const corretivas = e.corretivas.filter((c) => hoteis.has(c.hotelId));
  const doAtivo = porChave(
    corretivas.filter((c) => c.ativoId !== null && idsDeAtivo.has(c.ativoId)),
    (c) => c.ativoId as string,
  );
  const dia = e.agora.toISOString().slice(0, 10);

  const resultados = [...ativos]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((a): ResultadoDoAtivo => {
      const h = hoteis.get(a.hotelId) as HotelDoDia;
      const cfgR = h.reincidencia ?? PADRAO_REINCIDENCIA;
      const cs = doAtivo.get(a.id) ?? [];
      const r = reincidencia(cs, e.agora, cfgR);
      const atencao = atencaoDoAtivo(
        {
          criticidade: a.criticidade,
          reincidencia: r,
          horasParadas: horasParadasNoTrecho(
            a.paradas,
            agora - cfgR.janelaDias * DIA_MS,
            agora,
            e.agora,
          ),
          custoInformado12m: custoInformadoNaJanela(cs, e.agora, JANELA_CUSTO_DIAS),
          impactoHospede: impactoHospedeDosChamados(cs, e.agora, cfgR.janelaDias),
          preventivaAtrasada: a.preventivaAtrasada ?? null,
          medicoes: a.medicoes ?? null,
          garantia: situacaoDaGarantia(a, e.agora),
        },
        h.atencao ?? PADRAO_ATENCAO,
      );
      return { ativoId: a.id, hotelId: a.hotelId, reincidencia: r, atencao };
    });

  const deteccoes: DeteccaoDoDia[] = [];
  for (const r of resultados) {
    if (!sugereInsight(r.atencao, r.atencao.configuracao.limiteInsight)) continue;
    const escopo = { ativoId: r.ativoId, hotelId: r.hotelId };
    const cfgR = r.reincidencia.configuracao;
    deteccoes.push({
      tipo: 'atencao_ativo',
      familia: familiaDoInsight('atencao_ativo', escopo),
      faixa: r.atencao.faixa,
      alcance: {
        tipo: 'hotel',
        hotelId: r.hotelId,
        bandeiraId: hoteis.get(r.hotelId)?.bandeiraId ?? null,
      },
      valor: r.atencao.valor,
      versao: r.atencao.versao,
      escopo,
      hotelIds: [r.hotelId],
      corretivaIds: (doAtivo.get(r.ativoId) ?? [])
        .filter(
          (c) =>
            c.abertaEm.getTime() > agora - cfgR.janelaDias * DIA_MS &&
            c.abertaEm.getTime() <= agora,
        )
        .map((c) => c.id)
        .sort(),
    });
  }

  const sistemicos = detectarSistemicos(
    { corretivas, ativos, locais: e.locais.filter((l) => hoteis.has(l.hotelId)) },
    e.agora,
    e.sistemico ?? PADRAO_SISTEMICO,
  );
  for (const s of sistemicos) {
    const escopo = { regra: s.regra, ...s.chave };
    deteccoes.push({
      tipo: 'sistemico',
      familia: familiaDoInsight('sistemico', escopo),
      faixa: FAIXA_DO_SISTEMICO,
      alcance: alcanceDoSinal(s, hoteis),
      valor: null,
      versao: s.versao,
      escopo,
      regra: s.regra,
      hotelIds: listaCanonicaDeHoteis(s.evidencia.hotelIds),
      corretivaIds: s.evidencia.corretivaIds,
    });
  }

  return {
    dia,
    recalculo: e.recalculo ?? false,
    ativos: resultados,
    metricas: resultados.map((r) => ({
      dia,
      ativoId: r.ativoId,
      hotelId: r.hotelId,
      reincidencia: r.reincidencia.valor,
      atencao: r.atencao.valor,
      faixaAtencao: r.atencao.faixa,
      recalculo: e.recalculo ?? false,
      versaoFormulaReincidencia: r.reincidencia.versao,
      versaoFormulaAtencao: r.atencao.versao,
      versaoPolitica: hoteis.get(r.hotelId)?.versaoPolitica ?? VERSAO_DE_POLITICA_PADRAO,
    })),
    sistemicos,
    deteccoes,
  };
}

/** O último instante (UTC) de um dia `AAAA-MM-DD`: o `agora` para recalcular esse dia. */
export function fimDoDia(dia: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) throw new Error(`Dia fora do formato AAAA-MM-DD: ${dia}`);
  const fim = new Date(`${dia}T23:59:59.999Z`);
  if (Number.isNaN(fim.getTime()) || fim.toISOString().slice(0, 10) !== dia)
    throw new Error(`Dia inexistente: ${dia}`);
  return fim;
}
