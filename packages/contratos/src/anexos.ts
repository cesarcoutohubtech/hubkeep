// Anexos (F0-10 e B4, ADR-024). O caminho do arquivo é calculado pela API; o
// cliente só diz a que registro o anexo pertence e o tipo. Depois do envio, o
// aparelho registra o caminho (e o da miniatura, gerada nele).
import { z } from 'zod';

export const ENTIDADES_COM_ANEXO_API = ['hotel', 'local', 'ativo', 'chamado', 'os'] as const;
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
    /**
     * Id do arquivo gerado no aparelho (C4): o caminho sai igual no reenvio da
     * foto offline, e o envio repetido é recusado pelo Storage em vez de
     * duplicar. Sem ele, o servidor gera um.
     */
    arquivoId: z.guid().optional(),
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

export const PedidoDeRegistroDeAnexo = z
  .object({
    /** O caminho devolvido pela URL de upload, depois do envio. */
    caminho: z.string().min(1).max(500),
    /** O caminho da miniatura, enviada com outra URL de upload do mesmo registro. */
    miniaturaCaminho: z.string().min(1).max(500).nullish(),
    /** Nome original do arquivo. */
    nome: z.string().max(500).nullish(),
  })
  .meta({ id: 'PedidoDeRegistroDeAnexo' });

export const RespostaDeAnexoRegistrado = z
  .object({ id: z.guid() })
  .meta({ id: 'RespostaDeAnexoRegistrado' });

export const RespostaDeAnexoRemovido = z
  .object({ id: z.guid() })
  .meta({ id: 'RespostaDeAnexoRemovido' });

export const AnexoApi = z
  .object({
    id: z.guid(),
    tipo: z.enum(TIPOS_DE_ANEXO_API),
    nome: z.string().nullable(),
    temMiniatura: z.boolean(),
    usuarioId: z.guid(),
    /** Nome de quem enviou; null se o usuário não enxerga o membro. */
    nomeUsuario: z.string().nullable(),
    criadoEm: z.iso.datetime({ offset: true }),
    podeRemover: z.boolean(),
  })
  .meta({ id: 'AnexoApi' });

export const RespostaDeAnexos = z
  .object({ anexos: z.array(AnexoApi) })
  .meta({ id: 'RespostaDeAnexos' });

export const PedidoDeUrlDoAnexo = z
  .object({ miniatura: z.boolean().default(false) })
  .meta({ id: 'PedidoDeUrlDoAnexo' });
