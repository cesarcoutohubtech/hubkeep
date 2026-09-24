// Repositório de bandeira. Primeiro repositório do pacote e modelo dos
// próximos: recebe a unidade de trabalho (nunca a transação), grava a mudança
// e registra auditoria e evento na própria unidade. Quem pode criar bandeira
// (Admin do grupo) é garantido pela RLS; a regra de negócio vem na F0-06.
import { novoId } from '../ids';
import { transacaoDe, type UnidadeDeTrabalho } from '../unidade-de-trabalho';

export interface Bandeira {
  id: string;
  nome: string;
}

export async function criarBandeira(uow: UnidadeDeTrabalho, nome: string): Promise<Bandeira> {
  const bandeira = { id: novoId(), nome };
  await transacaoDe(uow)
    .insertInto('app.bandeira')
    .values({ id: bandeira.id, tenant_id: uow.tenantId, nome })
    .execute();
  uow.auditar({ entidade: 'bandeira', registroId: bandeira.id, acao: 'criar', depois: bandeira });
  uow.publicar({
    tipo: 'bandeira.criada',
    entidade: 'bandeira',
    registroId: bandeira.id,
    payload: bandeira,
  });
  return bandeira;
}
