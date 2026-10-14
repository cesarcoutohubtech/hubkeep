// Registro dos envios da comunicação (1c, ADR-046), na unit of work do
// hk_worker. Como o aviso de SLA (0044), o envio não vai para a auditoria: a
// própria tabela, só de inserção, é o registro. O índice único parcial da
// 0049 recusa o segundo envio do mesmo evento à mesma pessoa no mesmo canal,
// fora a falha; a gravação repetida não faz nada.
import type { EnvioRegistrado } from '@hubkeep/aplicacao';
import { novoId } from '../ids';
import { transacaoDe, type UnidadeDeTrabalho } from '../unidade-de-trabalho';

export async function registrarEnvio(uow: UnidadeDeTrabalho, e: EnvioRegistrado): Promise<void> {
  await transacaoDe(uow)
    .insertInto('app.envio_notificacao')
    .values({
      id: novoId(),
      tenant_id: uow.tenantId,
      hotel_id: e.hotelId,
      evento_id: e.eventoId,
      tipo_evento: e.tipoEvento,
      usuario_id: e.usuarioId,
      canal: e.canal,
      situacao: e.situacao,
    })
    .onConflict((oc) =>
      oc
        .columns(['tenant_id', 'evento_id', 'usuario_id', 'canal'])
        .where('situacao', '<>', 'falhou')
        .doNothing(),
    )
    .execute();
}
