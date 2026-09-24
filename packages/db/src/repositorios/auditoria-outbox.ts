// Grava o que a unidade de trabalho acumulou: auditoria e eventos de domínio.
// Chamado por executar()/executarComoSistema() depois que o caso de uso
// terminou sem erro, ainda dentro da mesma transação.
import { novoId } from '../ids';
import { transacaoDe, type UnidadeInterna } from '../unidade-de-trabalho';

export async function gravarAuditoriaEOutbox(uow: UnidadeInterna): Promise<void> {
  const tx = transacaoDe(uow);

  if (uow.auditorias.length > 0) {
    await tx
      .insertInto('app.auditoria')
      .values(
        uow.auditorias.map((a) => ({
          id: novoId(),
          tenant_id: uow.tenantId,
          hotel_id: a.hotelId ?? null,
          entidade: a.entidade,
          registro_id: a.registroId,
          acao: a.acao,
          antes: a.antes === undefined ? null : JSON.stringify(a.antes),
          depois: a.depois === undefined ? null : JSON.stringify(a.depois),
          usuario_id: uow.usuarioId,
        })),
      )
      .execute();
  }

  if (uow.eventos.length > 0) {
    await tx
      .insertInto('app.evento_dominio')
      .values(
        uow.eventos.map((e) => ({
          id: novoId(),
          tenant_id: uow.tenantId,
          tipo: e.tipo,
          entidade: e.entidade,
          registro_id: e.registroId,
          payload: JSON.stringify(e.payload),
        })),
      )
      .execute();
  }
}
