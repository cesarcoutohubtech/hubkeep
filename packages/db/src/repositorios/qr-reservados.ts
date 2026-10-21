// Códigos de QR reservados (fase 1b, M3; migração 0061), na unit of work, com
// auditoria e o evento qr.reservado. A geração não repete código reservado
// nem de ativo visível a quem gera; a unicidade no tenant (do código
// reservado e do código do ativo) fica no banco. A chance de colidir com
// código que quem gera não vê é desprezível (50 bits); se colidir, nada é
// gravado e o usuário gera de novo.
import { novoCodigoQr, novoId } from '../ids';
import { transacaoDe, type UnidadeDeTrabalho } from '../unidade-de-trabalho';

export async function reservarCodigos(
  uow: UnidadeDeTrabalho,
  hotelId: string,
  quantidade: number,
): Promise<{ loteId: string; codigos: string[] }> {
  const criadoPor = uow.usuarioId;
  if (criadoPor === null) throw new Error('Reservar códigos de QR pede um usuário.');
  const tx = transacaoDe(uow);
  const codigos = new Set<string>();
  while (codigos.size < quantidade) {
    const candidatos = new Set<string>();
    while (candidatos.size < quantidade - codigos.size) {
      const c = novoCodigoQr();
      if (!codigos.has(c)) candidatos.add(c);
    }
    const lista = [...candidatos];
    const reservados = await tx
      .selectFrom('app.qr_reservado')
      .select('codigo')
      .where('codigo', 'in', lista)
      .execute();
    const deAtivos = await tx
      .selectFrom('app.ativo')
      .select('codigo_qr as codigo')
      .where('codigo_qr', 'in', lista)
      .execute();
    const usados = new Set([...reservados, ...deAtivos].map((r) => r.codigo));
    for (const c of lista) if (!usados.has(c)) codigos.add(c);
  }
  const loteId = novoId();
  const lista = [...codigos];
  await tx
    .insertInto('app.qr_reservado')
    .values(
      lista.map((codigo) => ({
        id: novoId(),
        tenant_id: uow.tenantId,
        hotel_id: hotelId,
        codigo,
        lote_id: loteId,
        criado_por: criadoPor,
      })),
    )
    .execute();
  uow.auditar({
    entidade: 'qr_reservado',
    registroId: loteId,
    acao: 'criar',
    hotelId,
    depois: { quantidade, codigos: lista },
  });
  uow.publicar({
    tipo: 'qr.reservado',
    entidade: 'qr_reservado',
    registroId: loteId,
    payload: { hotelId, quantidade },
  });
  return { loteId, codigos: lista };
}
