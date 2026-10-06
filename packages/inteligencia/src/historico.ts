// HubKeep Intelligence: o histórico que o motor lê. São formas mínimas,
// montadas pela aplicação a partir das portas do núcleo (chamado, OS, parada,
// ativo, local). O motor nunca lê banco. Os campos marcados com "(fase A)"
// dependem da instrumentação do núcleo, que entra no começo da 1b
// (docs/referencia/lacunas-instrumentacao-intelligence.md), e ficam null ou
// ausentes enquanto ela não existir; o score marca o componente como ausente.
import { type Parada, tempoParadoTotal } from '@hubkeep/dominio';
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
  /** Conclusão da OS; null enquanto não concluída. */
  concluidaEm: Date | null;
  /** Vezes que a OS foi reaberta (auditoria, ação 'reabrir'). */
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
 * Criticidade do ativo (fase A, `app.ativo.criticidade`), com o máximo da
 * escala da política `ativo.criticidade` do tenant.
 */
export interface Criticidade {
  nivel: number;
  maximo: number;
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
