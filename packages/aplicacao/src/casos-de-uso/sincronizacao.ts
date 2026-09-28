// Recebimento das operações que o PWA do técnico fez sem rede (F0-11, ADR-025).
//
// Cada operação chega com a chave gerada no aparelho. A validação roda antes
// (operação inválida é 422 e não guarda a chave: o aparelho a descarta); a
// operação válida é aplicada uma vez só, pela porta. Tipos: a troca das
// próprias preferências (fase 0) e o cadastro e a alteração de ativo (B3). No
// ativo, a validação que lê o banco (local, categoria, permissão) é a mesma
// do web (preparar*); a versão é conferida na gravação, e o conflito volta
// como 409 conflito_de_versao, sem guardar a chave (ADR-029).
import type { Contexto } from '@hubkeep/dominio';
import type { PortaOperacoesOffline, RespostaDeOperacao } from '../portas/sincronizacao';
import type { PreferenciasGravadas } from '../portas/preferencias';
import type {
  CasosDeUsoDeAtivos,
  PedidoDeAlteracaoDeAtivo,
  PedidoDeCadastroDeAtivo,
} from './ativos';
import { validarPreferencias } from './preferencias';

export type OperacaoOffline =
  | { chave: string; tipo: 'preferencias.gravar'; dados: PreferenciasGravadas }
  | { chave: string; tipo: 'ativo.cadastrar'; dados: PedidoDeCadastroDeAtivo }
  | {
      chave: string;
      tipo: 'ativo.alterar';
      dados: PedidoDeAlteracaoDeAtivo & { ativoId: string };
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
  ativos: Pick<CasosDeUsoDeAtivos, 'prepararCadastro' | 'prepararAlteracao'>;
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
        case 'ativo.cadastrar': {
          const c = await deps.ativos.prepararCadastro(ctx, operacao.dados);
          const r = await deps.operacoes.aplicarUmaVez(ctx, operacao, async (s) => {
            const { id, versao } = await s.cadastrarAtivo(c.hotelId, c.localId, c.dados);
            return { id, versao };
          });
          return { chave: operacao.chave, ...r };
        }
        case 'ativo.alterar': {
          const { ativoId, ...pedido } = operacao.dados;
          const c = await deps.ativos.prepararAlteracao(ctx, ativoId, pedido);
          const r = await deps.operacoes.aplicarUmaVez(ctx, operacao, async (s) => {
            const { versao } = await s.alterarAtivo(c.ativoId, c.versaoEsperada, c.dados);
            return { id: c.ativoId, versao };
          });
          return { chave: operacao.chave, ...r };
        }
      }
    },
  };
}
