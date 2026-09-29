// Porta das operações offline do PWA (F0-11, ADR-025). Implementada por
// packages/db: o efeito da operação e o registro da chave de idempotência vão
// na MESMA unit of work, então a operação acontece uma vez só, mesmo com
// reenvio (resposta perdida) ou dois envios simultâneos.
import type { Contexto } from '@hubkeep/dominio';
import type { DadosDeAtivo, MudancaDeAtivo } from './ativos';
import type { DadosDeChamado } from './chamados';
import type { PreferenciasGravadas } from './preferencias';

/** Resposta guardada com a chave e devolvida igual a cada reenvio. */
export type RespostaDeOperacao = Record<string, string | number | boolean | null>;

/** O que uma operação offline pode escrever, dentro da unit of work dela. */
export interface SessaoDeOperacao {
  gravarPreferencias(p: PreferenciasGravadas): Promise<void>;
  cadastrarAtivo(
    hotelId: string,
    localId: string,
    dados: DadosDeAtivo,
  ): Promise<{ id: string; versao: number }>;
  /** Versão diferente da esperada: Conflito conflito_de_versao (ADR-029). */
  alterarAtivo(
    ativoId: string,
    versaoEsperada: number,
    mudanca: MudancaDeAtivo,
  ): Promise<{ versao: number }>;
  /** Abertura do chamado (C2), em nome do usuário do contexto. */
  abrirChamado(hotelId: string, dados: DadosDeChamado): Promise<{ id: string; versao: number }>;
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
