// Recebimento das operações que o PWA do técnico fez sem rede (F0-11, ADR-025).
//
// Cada operação chega com a chave gerada no aparelho. A validação roda antes
// (operação inválida é 422 e não guarda a chave: o aparelho a descarta); a
// operação válida é aplicada uma vez só, pela porta. A fase 0 tem um tipo, a
// troca das próprias preferências; os da OS entram na fase 1a.
import type { Contexto } from '@hubkeep/dominio';
import type { PortaOperacoesOffline, RespostaDeOperacao } from '../portas/sincronizacao';
import type { PreferenciasGravadas } from '../portas/preferencias';
import { validarPreferencias } from './preferencias';

export type OperacaoOffline = {
  chave: string;
  tipo: 'preferencias.gravar';
  dados: PreferenciasGravadas;
};

export interface ResultadoDaOperacao {
  chave: string;
  /** true: a chave já tinha sido recebida; nada foi aplicado de novo. */
  repetida: boolean;
  resposta: RespostaDeOperacao;
}

export interface CasosDeUsoDeSincronizacao {
  receberOperacao(ctx: Contexto, operacao: OperacaoOffline): Promise<ResultadoDaOperacao>;
}

export function criarCasosDeUsoDeSincronizacao(deps: {
  operacoes: PortaOperacoesOffline;
}): CasosDeUsoDeSincronizacao {
  return {
    async receberOperacao(ctx, operacao) {
      switch (operacao.tipo) {
        case 'preferencias.gravar': {
          validarPreferencias(operacao.dados);
          const r = await deps.operacoes.aplicarUmaVez(ctx, operacao, async (s) => {
            await s.gravarPreferencias(operacao.dados);
            return { aplicada: true };
          });
          return { chave: operacao.chave, ...r };
        }
      }
    },
  };
}
