// Transições da OS (fase 1b, I5; migração 0031): cada mudança de estado grava
// uma linha, na mesma unit of work que muda a OS, com a auditoria e o evento.
// O estado de antes vem do caso de uso, que leu a OS na versão conferida; o
// UPDATE da OS confere a mesma versão, então o par (de, para) é o que o banco
// gravou. Só INSERT: ninguém altera nem apaga uma transição (meta-teste 32).
import type { AcaoDaOs, EstadoDaOs, MotivoDePausa } from '@hubkeep/dominio';
import { novoId } from '../ids';
import { instanteDoRoteiro, transacaoDe, type UnidadeDeTrabalho } from '../unidade-de-trabalho';

export interface TransicaoGravada {
  osId: string;
  hotelId: string;
  acao: AcaoDaOs;
  /** Nulo só na geração da OS. */
  de: EstadoDaOs | null;
  para: EstadoDaOs;
  /**
   * A hora do aparelho, já ajustada pelo domínio (I9); sem ela, o instante do
   * relógio do roteiro (só na montagem do gerador) ou o now() da transação.
   */
  quando?: Date;
  /** Só na pausa: o motivo (1c, ADR-042); null quando o técnico não informou. */
  motivoPausa?: MotivoDePausa | null;
}

export async function registrarTransicao(
  uow: UnidadeDeTrabalho,
  t: TransicaoGravada,
): Promise<void> {
  if (!uow.usuarioId) throw new Error('Transição da OS exige usuário no contexto.');
  const quando = t.quando ?? instanteDoRoteiro(uow);
  await transacaoDe(uow)
    .insertInto('app.os_transicao')
    .values({
      id: novoId(),
      tenant_id: uow.tenantId,
      hotel_id: t.hotelId,
      os_id: t.osId,
      acao: t.acao,
      de: t.de,
      para: t.para,
      ...(quando ? { quando } : {}),
      ...(t.motivoPausa ? { motivo_pausa: t.motivoPausa } : {}),
      usuario_id: uow.usuarioId,
    })
    .execute();
}
