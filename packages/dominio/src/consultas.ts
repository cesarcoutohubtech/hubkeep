// Listas de chamados e OS e linha do tempo do chamado (fase 1a, C7). Quem vê o
// quê é escopo, e a RLS decide (cada papel lê os hotéis dele; o proprietário,
// os chamados das UHs e do hotel inteiro dele). Aqui ficam os limites do
// pedido: o período, o tamanho da página e o que entra na linha do tempo.
import { RegraViolada } from './erros';

/** Registros por página nas listas; a próxima página continua do último id (UUID v7). */
export const TAMANHO_DA_PAGINA = 50;

/** As entidades da auditoria que formam a linha do tempo do chamado. */
export const ENTIDADES_DA_LINHA_DO_TEMPO = [
  'chamado',
  'os',
  'parada_ativo',
  'uh_indisponivel',
] as const;
export type EntidadeDaLinhaDoTempo = (typeof ENTIDADES_DA_LINHA_DO_TEMPO)[number];

export interface FiltroDaLista {
  hotelId: string | null;
  situacaoId: string | null;
  prioridadeId: string | null;
  /** Início do período (inclusive), pela data de criação do registro. */
  de: Date | null;
  /** Fim do período (exclusive). */
  ate: Date | null;
  /** Continua a lista depois deste id (do mais novo para o mais antigo). */
  depoisDe: string | null;
  /** Só as OS do locador no hotel arrendado (1c, ADR-045); a lista de chamados não usa. */
  doLocador: boolean;
}

/** Datas válidas, e o início antes do fim; senão 422 periodo_invalido. */
export function validarPeriodoDaLista(de: Date | null, ate: Date | null): void {
  const invalida = (d: Date | null) => d !== null && Number.isNaN(d.getTime());
  if (invalida(de) || invalida(ate) || (de !== null && ate !== null && de >= ate)) {
    throw new RegraViolada('periodo_invalido', 'O início do período precisa ser antes do fim.');
  }
}

/**
 * O motivo que a auditoria guardou na ação (cancelamento, reabertura), para a
 * linha do tempo; null se a ação não tem motivo.
 */
export function motivoDaAuditoria(depois: unknown): string | null {
  if (typeof depois !== 'object' || depois === null) return null;
  const d = depois as Record<string, unknown>;
  const motivo = d['motivo'] ?? d['motivoCancelamento'];
  return typeof motivo === 'string' && motivo.length > 0 ? motivo : null;
}
