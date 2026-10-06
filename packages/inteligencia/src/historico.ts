// HubKeep Intelligence: o histórico que o motor lê. São formas mínimas,
// montadas pela aplicação a partir das portas do núcleo (chamado, OS, parada,
// ativo, local). O motor nunca lê banco. Os campos marcados com "(fase A)"
// dependem da instrumentação do núcleo, que entra no começo da 1b
// (docs/referencia/lacunas-instrumentacao-intelligence.md), e ficam null ou
// ausentes enquanto ela não existir; o score marca o componente como ausente.
import { type AcaoDaOs, type EstadoDaOs, type Parada, tempoParadoTotal } from '@hubkeep/dominio';
import { DIA_MS, HORA_MS } from './score';

/** Quem executou a OS, gravado na triagem (fase A, `app.os.executado_por`). */
export type ExecutadoPor = 'equipe_interna' | 'terceiro';

/** Uma corretiva: o chamado e a OS dele, vistos pelo que importa à análise. */
export interface Corretiva {
  id: string;
  hotelId: string;
  localId: string;
  ativoId: string | null;
  abertaEm: Date;
  /** Conclusão da OS; null enquanto não concluída (`conclusaoEReaberturas`). */
  concluidaEm: Date | null;
  /** Vezes que a OS foi reaberta até a data do cálculo (`conclusaoEReaberturas`). */
  reaberturas: number;
  /** Código de falha (fase A, `app.os.codigo_falha_id`); null sem dado. */
  codigoFalha: string | null;
  /** Aberta pouco depois de uma preventiva do ativo (fase 1b); undefined sem dado. */
  aposPreventiva?: boolean;
  /** Fase A, `app.os.executado_por`; undefined antes da migração. */
  executadoPor?: ExecutadoPor;
  /** Fase A, `app.os.terceiro_nome`, só quando executada por terceiro. */
  terceiroNome?: string | null;
  /** Fase A, `app.os.custo_informado`, em reais, no aceite; null não informado. */
  custoInformado?: number | null;
  /** Fase A, `app.chamado.impacto_hospede`: afeta hóspede? null é "não sei". */
  impactoHospede?: boolean | null;
}

/** O ativo, com o que a análise por modelo e por idade usa. */
export interface AtivoAnalisado {
  id: string;
  hotelId: string;
  categoriaId: string | null;
  fabricante: string | null;
  modelo: string | null;
}

/** O local da corretiva, para a análise por andar e por área comum. */
export interface LocalAnalisado {
  id: string;
  hotelId: string;
  andar: string | null;
  /** O tipo do local (`app.local.tipo`); sem ele, o local não entra na regra da área comum. */
  tipo?: 'uh' | 'area_comum';
}

/**
 * Criticidade do ativo (etapa I1 da 1b, `app.ativo.criticidade`): escala fixa
 * de 1 a 5 (decisão do Cesar de 06/10/2026). O tenant só troca o nome de cada
 * nível, pela política `ativo.criticidade`; o motor usa o número.
 */
export type Criticidade = 1 | 2 | 3 | 4 | 5;
export const CRITICIDADE_MAXIMA = 5;

export const ehCriticidade = (n: unknown): n is Criticidade =>
  Number.isInteger(n) && (n as number) >= 1 && (n as number) <= CRITICIDADE_MAXIMA;

/**
 * Uma transição da OS (etapa I3 da 1b, `app.os_transicao`: de, para, quando,
 * quem e a ação), gravada pelo caso de uso na mesma unit of work que muda o
 * estado. Os nomes das colunas vêm no aviso do agente do núcleo.
 */
export interface TransicaoDaOs {
  acao: AcaoDaOs;
  para: EstadoDaOs;
  quando: Date;
}

/**
 * A conclusão e as reaberturas da OS como estavam em `agora`, a partir das
 * transições (decisão do Cesar de 06/10/2026: o job lê as transições, sem
 * abrir a auditoria ao worker). Só contam as transições até `agora`, então o
 * recálculo de um dia passado vê a OS como ela estava naquele dia.
 * - `concluidaEm`: a última conclusão, se depois dela a OS não foi reaberta
 *   nem cancelada; null senão. O aceite não muda a conclusão.
 * - `reaberturas`: as reaberturas até `agora`.
 */
export function conclusaoEReaberturas(
  transicoes: readonly TransicaoDaOs[],
  agora: Date,
): Pick<Corretiva, 'concluidaEm' | 'reaberturas'> {
  let concluidaEm: Date | null = null;
  let reaberturas = 0;
  for (const t of [...transicoes]
    .filter((t) => t.quando.getTime() <= agora.getTime())
    .sort((a, b) => a.quando.getTime() - b.quando.getTime())) {
    if (t.acao === 'concluir') concluidaEm = t.quando;
    else if (t.acao === 'reabrir' || t.acao === 'cancelar') concluidaEm = null;
    if (t.acao === 'reabrir') reaberturas += 1;
  }
  return { concluidaEm, reaberturas };
}

export const ordenarPorAbertura = <T extends { abertaEm: Date }>(xs: readonly T[]): T[] =>
  [...xs].sort((a, b) => a.abertaEm.getTime() - b.abertaEm.getTime());

/** Texto livre comparável: sem espaço sobrando nem repetido, sem caixa. */
const normalizar = (s: string | null | undefined): string =>
  s?.trim().replace(/\s+/g, ' ').toLowerCase() ?? '';

/** Fabricante e modelo comparáveis entre hotéis. */
export const chaveDeModelo = (a: Pick<AtivoAnalisado, 'fabricante' | 'modelo'>): string | null => {
  const f = normalizar(a.fabricante);
  const m = normalizar(a.modelo);
  return f && m ? `${f}|${m}` : null;
};

/** O nome do terceiro comparável entre OS e hotéis, como o modelo. */
export const chaveDeTerceiro = (
  c: Pick<Corretiva, 'executadoPor' | 'terceiroNome'>,
): string | null => (c.executadoPor === 'terceiro' ? normalizar(c.terceiroNome) || null : null);

/**
 * Soma do custo informado das corretivas concluídas na janela. null quando
 * nenhuma tem custo informado: o componente fica ausente, e não zero.
 */
export function custoInformadoNaJanela(
  corretivas: readonly Corretiva[],
  agora: Date,
  janelaDias: number,
): number | null {
  const inicio = agora.getTime() - janelaDias * DIA_MS;
  const comCusto = corretivas.filter(
    (c) =>
      c.concluidaEm !== null &&
      c.concluidaEm.getTime() > inicio &&
      c.concluidaEm.getTime() <= agora.getTime() &&
      c.custoInformado !== undefined &&
      c.custoInformado !== null,
  );
  return comCusto.length ? comCusto.reduce((s, c) => s + (c.custoInformado as number), 0) : null;
}

/**
 * Impacto no hóspede pelo indicador do chamado (decisão de 05/10/2026, até o
 * Guest Impact Score da 1.5): a porcentagem, de 0 a 100, dos chamados abertos
 * na janela que afetaram hóspede, entre os que têm a resposta. "Não sei" e o
 * chamado anterior à migração ficam fora da conta; sem nenhuma resposta, null.
 */
export function impactoHospedeDosChamados(
  corretivas: readonly Corretiva[],
  agora: Date,
  janelaDias: number,
): number | null {
  const inicio = agora.getTime() - janelaDias * DIA_MS;
  const respondidas = corretivas.filter(
    (c) =>
      c.abertaEm.getTime() > inicio &&
      c.abertaEm.getTime() <= agora.getTime() &&
      typeof c.impactoHospede === 'boolean',
  );
  if (!respondidas.length) return null;
  const afetaram = respondidas.filter((c) => c.impactoHospede).length;
  return Math.round((afetaram / respondidas.length) * 1000) / 10;
}

/** Horas paradas dentro do trecho [de, ate), com as paradas sobrepostas contadas uma vez. */
export function horasParadasNoTrecho(
  paradas: readonly Parada[],
  de: number,
  ate: number,
  agora: Date,
): number {
  const cortadas = paradas
    .map((p) => ({
      inicio: new Date(Math.max(p.inicio.getTime(), de)),
      fim: new Date(Math.min((p.fim ?? agora).getTime(), ate)),
    }))
    .filter((p) => p.fim.getTime() > p.inicio.getTime());
  return Math.round((tempoParadoTotal(cortadas, agora) / HORA_MS) * 10) / 10;
}
