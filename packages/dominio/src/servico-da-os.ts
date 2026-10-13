// A conclusão do serviço e o aceite da OS a partir das transições
// (`app.os_transicao`), como termos de base do glossário de métricas (versão 3,
// aprovada por Cesar e Kaio em 13/10/2026). Moram aqui para o núcleo e o
// Intelligence contarem do mesmo jeito; o Intelligence lia daqui a conclusão
// que antes calculava em `packages/inteligencia/src/historico.ts`.
//
// Só contam as transições até `agora`, então o recálculo de um dia passado vê
// a OS como ela estava naquele dia.
import type { AcaoDaOs } from './corretiva';

/** O que estas regras leem de uma transição da OS. */
export interface TransicaoDoServico {
  acao: AcaoDaOs;
  quando: Date;
}

const ate = (transicoes: readonly TransicaoDoServico[], agora: Date): TransicaoDoServico[] =>
  transicoes
    .filter((t) => t.quando.getTime() <= agora.getTime())
    .sort((a, b) => a.quando.getTime() - b.quando.getTime());

/**
 * A conclusão do serviço e as reaberturas da OS em `agora`:
 * - `concluidaEm`: a última conclusão, se depois dela a OS não foi reaberta
 *   nem cancelada; null senão. O aceite não muda a conclusão;
 * - `reaberturas`: as reaberturas até `agora`.
 */
export function conclusaoEReaberturas(
  transicoes: readonly TransicaoDoServico[],
  agora: Date,
): { concluidaEm: Date | null; reaberturas: number } {
  let concluidaEm: Date | null = null;
  let reaberturas = 0;
  for (const t of ate(transicoes, agora)) {
    if (t.acao === 'concluir') concluidaEm = t.quando;
    else if (t.acao === 'reabrir' || t.acao === 'cancelar') concluidaEm = null;
    if (t.acao === 'reabrir') reaberturas += 1;
  }
  return { concluidaEm, reaberturas };
}

/**
 * O aceite da OS em `agora`: o último aceite, pelo gestor (`aceitar`) ou pelo
 * worker (`aceitar_automatico`, M5 da 1c; conta como aceite, decisão do Kaio de
 * 13/10/2026), se depois dele a OS não foi reaberta nem cancelada; null senão.
 * O custo informado é gravado no aceite, então é por ele que o custo conta.
 */
export function aceiteDaOs(transicoes: readonly TransicaoDoServico[], agora: Date): Date | null {
  let aceitaEm: Date | null = null;
  for (const t of ate(transicoes, agora)) {
    if (t.acao === 'aceitar' || t.acao === 'aceitar_automatico') aceitaEm = t.quando;
    else if (t.acao === 'reabrir' || t.acao === 'cancelar') aceitaEm = null;
  }
  return aceitaEm;
}
