// Chave de idempotência das operações offline (F0-11, ADR-025). Gravada na
// mesma unit of work do efeito: se outro envio da mesma chave chegou antes e
// já gravou, o INSERT não entra e a unidade inteira volta (o efeito junto).
import type { RespostaDeOperacao } from '@hubkeep/aplicacao';
import { transacaoDe, type UnidadeDeTrabalho } from '../unidade-de-trabalho';

/** A chave já estava gravada: a unit of work volta, e quem chamou lê a resposta guardada. */
export class OperacaoJaRecebida extends Error {
  constructor() {
    super('Operação offline já recebida.');
    this.name = 'OperacaoJaRecebida';
  }
}

export async function registrarOperacao(
  uow: UnidadeDeTrabalho,
  operacao: { chave: string; tipo: string },
  resposta: RespostaDeOperacao,
): Promise<void> {
  if (!uow.usuarioId) throw new Error('Operação offline exige um usuário na sessão.');
  // Com dois envios simultâneos, o segundo INSERT espera o primeiro terminar e,
  // se ele gravou, cai no ON CONFLICT.
  const gravada = await transacaoDe(uow)
    .insertInto('app.operacao_offline')
    .values({
      tenant_id: uow.tenantId,
      usuario_id: uow.usuarioId,
      chave: operacao.chave,
      tipo: operacao.tipo,
      resposta: JSON.stringify(resposta),
    })
    .onConflict((oc) => oc.columns(['tenant_id', 'usuario_id', 'chave']).doNothing())
    .returning('chave')
    .executeTakeFirst();
  if (!gravada) throw new OperacaoJaRecebida();
}
