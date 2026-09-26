// URLs assinadas de anexo (F0-10, ADR-024).
//
//   upload    o registro precisa existir para o usuário (RLS) e o hotel dele
//             estar entre os que o usuário escreve; o caminho é calculado aqui,
//             {tenant}/{hotel}/{entidade}/{registro}/{id}.{ext}, nunca vem do
//             cliente. O aparelho envia direto para a URL (docs/01).
//   download  o caminho é conferido de novo: tenant do contexto, hotel que o
//             usuário lê e registro que pertence a esse hotel. Qualquer falha é
//             404, para não dizer o que existe fora do escopo.
import { type Contexto, NaoEncontrado, PermissaoNegada, RegraViolada } from '@hubkeep/dominio';
import {
  type ArmazenamentoDeArquivos,
  ENTIDADES_COM_ANEXO,
  type EntidadeComAnexo,
  type PortaEscopoDeAnexo,
} from '../portas/anexos';
import type { Relogio } from '../portas/papeis';

/** Tipos aceitos e a extensão de cada um (os mesmos do bucket, migração 0004). */
export const TIPOS_DE_ANEXO = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
} as const;
export type TipoDeAnexo = keyof typeof TIPOS_DE_ANEXO;

/** Validade da URL de download. A de upload é a do Supabase (2 horas). */
export const SEGUNDOS_URL_DE_DOWNLOAD = 300;
const SEGUNDOS_URL_DE_UPLOAD = 2 * 60 * 60;

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const CAMINHO = new RegExp(
  `^(${UUID})/(${UUID})/(${ENTIDADES_COM_ANEXO.join('|')})/(${UUID})/(${UUID})\\.(jpg|png|webp|pdf)$`,
  'i',
);

export interface DependenciasDeAnexos {
  armazenamento: ArmazenamentoDeArquivos;
  escopo: PortaEscopoDeAnexo;
  relogio: Relogio;
  /** UUID v7 (packages/db). */
  novoId: () => string;
}

export interface CasosDeUsoDeAnexos {
  pedirUrlDeUpload(
    ctx: Contexto,
    pedido: { entidade: EntidadeComAnexo; registroId: string; tipo: string },
  ): Promise<{ caminho: string; url: string; token: string; expiraEm: Date }>;
  pedirUrlDeDownload(ctx: Contexto, caminho: string): Promise<{ url: string; expiraEm: Date }>;
}

const naoEncontrado = () => new NaoEncontrado('anexo_nao_encontrado', 'Anexo não encontrado.');

export function criarCasosDeUsoDeAnexos(deps: DependenciasDeAnexos): CasosDeUsoDeAnexos {
  const emSegundos = (s: number) => new Date(deps.relogio.agora().getTime() + s * 1000);

  return {
    async pedirUrlDeUpload(ctx, pedido) {
      const ext = TIPOS_DE_ANEXO[pedido.tipo as TipoDeAnexo];
      if (!ext) {
        throw new RegraViolada('tipo_de_arquivo_nao_aceito', 'Tipo de arquivo não aceito.', {
          tipo: pedido.tipo,
        });
      }
      const hotelId = await deps.escopo.hotelDoRegistro(ctx, pedido.entidade, pedido.registroId);
      if (!hotelId) {
        throw new NaoEncontrado('registro_nao_encontrado', 'Registro não encontrado.', {
          entidade: pedido.entidade,
        });
      }
      if (!(await deps.escopo.escreveNoHotel(ctx, hotelId))) {
        throw new PermissaoNegada(
          'anexo_sem_escrita_no_hotel',
          'Você não pode anexar arquivos neste hotel.',
        );
      }
      const caminho = [
        ctx.tenantId,
        hotelId,
        pedido.entidade,
        pedido.registroId,
        `${deps.novoId()}.${ext}`,
      ].join('/');
      const { url, token } = await deps.armazenamento.urlDeUpload(caminho);
      return { caminho, url, token, expiraEm: emSegundos(SEGUNDOS_URL_DE_UPLOAD) };
    },

    async pedirUrlDeDownload(ctx, caminho) {
      const m = CAMINHO.exec(caminho);
      if (!m) throw naoEncontrado();
      const [, tenantId, hotelId, entidade, registroId] = m as unknown as [
        string,
        string,
        string,
        EntidadeComAnexo,
        string,
      ];
      if (tenantId.toLowerCase() !== ctx.tenantId.toLowerCase()) throw naoEncontrado();
      if (!(await deps.escopo.leNoHotel(ctx, hotelId))) throw naoEncontrado();
      const hotelDoRegistro = await deps.escopo.hotelDoRegistro(ctx, entidade, registroId);
      if (hotelDoRegistro?.toLowerCase() !== hotelId.toLowerCase()) throw naoEncontrado();
      const url = await deps.armazenamento.urlDeDownload(caminho, SEGUNDOS_URL_DE_DOWNLOAD);
      return { url, expiraEm: emSegundos(SEGUNDOS_URL_DE_DOWNLOAD) };
    },
  };
}
