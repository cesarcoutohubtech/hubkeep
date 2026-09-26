// URLs assinadas de anexo (F0-10, ADR-024). O caminho do arquivo é calculado
// pela API; o cliente só diz a que registro o anexo pertence e o tipo.
import { z } from 'zod';

export const ENTIDADES_COM_ANEXO_API = ['hotel', 'local'] as const;
export const TIPOS_DE_ANEXO_API = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
] as const;

export const PedidoDeUrlDeUpload = z
  .object({
    entidade: z.enum(ENTIDADES_COM_ANEXO_API),
    registroId: z.guid(),
    tipo: z.enum(TIPOS_DE_ANEXO_API),
  })
  .meta({ id: 'PedidoDeUrlDeUpload' });

export const RespostaDeUrlDeUpload = z
  .object({
    /** Onde o arquivo vai ficar; é o que se guarda para pedir o download. */
    caminho: z.string(),
    /** Envio direto do aparelho: PUT do arquivo nesta URL. */
    url: z.string(),
    token: z.string(),
    expiraEm: z.iso.datetime({ offset: true }),
  })
  .meta({ id: 'RespostaDeUrlDeUpload' });

export const PedidoDeUrlDeDownload = z
  .object({ caminho: z.string().min(1).max(500) })
  .meta({ id: 'PedidoDeUrlDeDownload' });

export const RespostaDeUrlDeDownload = z
  .object({ url: z.string(), expiraEm: z.iso.datetime({ offset: true }) })
  .meta({ id: 'RespostaDeUrlDeDownload' });
