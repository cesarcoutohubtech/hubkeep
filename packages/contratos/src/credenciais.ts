// Credencial do agente conector (ADR-008): `hk_<tenant_id>_<segredo>`. O
// segredo só é mostrado uma vez, na criação; o banco guarda o hash.
import { z } from 'zod';

export const PedidoDeCredencial = z
  .object({ descricao: z.string().trim().min(1).max(200) })
  .meta({ id: 'PedidoDeCredencial' });

export const RespostaDeCredencial = z
  .object({
    id: z.guid(),
    /** Mostrada só agora; não há como recuperá-la depois. */
    credencial: z.string(),
  })
  .meta({ id: 'RespostaDeCredencial' });

export const RespostaDeRevogacao = z
  .object({ id: z.guid(), revogadaEm: z.iso.datetime({ offset: true }) })
  .meta({ id: 'RespostaDeRevogacao' });
