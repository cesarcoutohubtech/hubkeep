// Porta das operações offline do PWA (F0-11, ADR-025). Implementada por
// packages/db: o efeito da operação e o registro da chave de idempotência vão
// na MESMA unit of work, então a operação acontece uma vez só, mesmo com
// reenvio (resposta perdida) ou dois envios simultâneos.
import type { Contexto } from '@hubkeep/dominio';
import type { PreferenciasGravadas } from './preferencias';

/** Resposta guardada com a chave e devolvida igual a cada reenvio. */
export type RespostaDeOperacao = Record<string, string | number | boolean | null>;

/** O que uma operação offline pode escrever, dentro da unit of work dela. */
export interface SessaoDeOperacao {
  gravarPreferencias(p: PreferenciasGravadas): Promise<void>;
}

export interface PortaOperacoesOffline {
  /**
   * Roda `efeito` e grava a chave, juntos. Se a chave já foi recebida (do
   * mesmo usuário), não roda nada e devolve a resposta guardada.
   */
  aplicarUmaVez(
    ctx: Contexto,
    operacao: { chave: string; tipo: string },
    efeito: (s: SessaoDeOperacao) => Promise<RespostaDeOperacao>,
  ): Promise<{ repetida: boolean; resposta: RespostaDeOperacao }>;
}
