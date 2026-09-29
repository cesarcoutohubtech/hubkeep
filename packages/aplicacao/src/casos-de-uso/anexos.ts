// Anexos (F0-10 e B4, ADR-024).
//
//   upload    o registro precisa existir para o usuário (RLS) e o hotel dele
//             estar entre os que o usuário escreve; o caminho é calculado aqui,
//             {tenant}/{hotel}/{entidade}/{registro}/{id}.{ext}, nunca vem do
//             cliente. O aparelho envia direto para a URL (docs/01).
//   registro  depois do envio, o aparelho registra o caminho (e o da miniatura,
//             gerada nele). O caminho é conferido como no download e gravado
//             na unit of work, com auditoria e evento (B4).
//   download  pelo anexo registrado: a RLS de app.anexo decide quem o vê, o
//             proprietário inclusive, nos anexos dos locais dele e dos ativos
//             que estão neles. Pelo caminho (F0-10), o caminho é conferido de
//             novo: tenant do contexto, hotel que o usuário lê e registro que
//             pertence a esse hotel. Qualquer falha é 404, para não dizer o que
//             existe fora do escopo.
//   remoção   lógica; remove quem enviou ou quem gere o hotel (domínio).
import {
  type Atribuicao,
  type Contexto,
  NaoEncontrado,
  PermissaoNegada,
  type Resultado,
  RegraViolada,
  exigir,
  normalizarNomeDeAnexo,
  podeRemoverAnexo,
  validarMiniatura,
} from '@hubkeep/dominio';
import {
  type AnexoGravado,
  type ArmazenamentoDeArquivos,
  ENTIDADES_COM_ANEXO,
  type EntidadeComAnexo,
  type PortaAnexos,
  type PortaEscopoDeAnexo,
} from '../portas/anexos';
import type { PortaAtribuicoes, Relogio } from '../portas/papeis';

/** Tipos aceitos e a extensão de cada um (os mesmos do bucket, migração 0004). */
export const TIPOS_DE_ANEXO = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
} as const;
export type TipoDeAnexo = keyof typeof TIPOS_DE_ANEXO;

const TIPO_DA_EXTENSAO = Object.fromEntries(
  Object.entries(TIPOS_DE_ANEXO).map(([tipo, ext]) => [ext, tipo]),
) as Record<string, TipoDeAnexo>;

/** Validade da URL de download. A de upload é a do Supabase (2 horas). */
export const SEGUNDOS_URL_DE_DOWNLOAD = 300;
const SEGUNDOS_URL_DE_UPLOAD = 2 * 60 * 60;

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const CAMINHO = new RegExp(
  `^(${UUID})/(${UUID})/(${ENTIDADES_COM_ANEXO.join('|')})/(${UUID})/(${UUID})\\.(jpg|png|webp|pdf)$`,
  'i',
);

interface CaminhoLido {
  tenantId: string;
  hotelId: string;
  entidade: EntidadeComAnexo;
  registroId: string;
  /** tenant/hotel/entidade/registro: o que o arquivo e a miniatura compartilham. */
  registro: string;
  tipo: TipoDeAnexo;
}

function lerCaminho(caminho: string): CaminhoLido | null {
  const m = CAMINHO.exec(caminho);
  if (!m) return null;
  const [, tenantId, hotelId, entidade, registroId, , ext] = m as unknown as [
    string,
    string,
    string,
    EntidadeComAnexo,
    string,
    string,
    string,
  ];
  return {
    tenantId,
    hotelId,
    entidade,
    registroId,
    registro: [tenantId, hotelId, entidade, registroId].join('/'),
    tipo: TIPO_DA_EXTENSAO[ext.toLowerCase()] as TipoDeAnexo,
  };
}

export interface DependenciasDeAnexos {
  armazenamento: ArmazenamentoDeArquivos;
  escopo: PortaEscopoDeAnexo;
  anexos: PortaAnexos;
  atribuicoes: Pick<PortaAtribuicoes, 'doUsuario'>;
  relogio: Relogio;
  /** UUID v7 (packages/db). */
  novoId: () => string;
  /** Padrão: podeRemoverAnexo do domínio. Só o teste de aceite troca. */
  podeRemover?: (
    minhas: readonly Atribuicao[],
    hotel: { id: string; bandeiraId: string | null },
    anexo: { usuarioId: string },
    usuarioId: string,
    agora: Date,
  ) => Resultado;
}

export interface PedidoDeRegistroDeAnexo {
  /** O caminho devolvido pela URL de upload, depois do envio. */
  caminho: string;
  /** O caminho da miniatura, enviada com outra URL de upload do mesmo registro. */
  miniaturaCaminho?: string | null | undefined;
  /** Nome original do arquivo. */
  nome?: string | null | undefined;
}

export interface AnexoListado extends Omit<
  AnexoGravado,
  'caminho' | 'miniaturaCaminho' | 'removidoEm'
> {
  temMiniatura: boolean;
  /** O usuário pode remover este anexo (domínio e escrita no hotel). */
  podeRemover: boolean;
}

export interface CasosDeUsoDeAnexos {
  pedirUrlDeUpload(
    ctx: Contexto,
    pedido: { entidade: EntidadeComAnexo; registroId: string; tipo: string },
  ): Promise<{ caminho: string; url: string; token: string; expiraEm: Date }>;
  pedirUrlDeDownload(ctx: Contexto, caminho: string): Promise<{ url: string; expiraEm: Date }>;
  registrar(ctx: Contexto, pedido: PedidoDeRegistroDeAnexo): Promise<{ id: string }>;
  listar(ctx: Contexto, entidade: EntidadeComAnexo, registroId: string): Promise<AnexoListado[]>;
  pedirUrlDoAnexo(
    ctx: Contexto,
    anexoId: string,
    miniatura: boolean,
  ): Promise<{ url: string; expiraEm: Date }>;
  remover(ctx: Contexto, anexoId: string): Promise<void>;
}

const naoEncontrado = () => new NaoEncontrado('anexo_nao_encontrado', 'Anexo não encontrado.');
const registroNaoEncontrado = (entidade: EntidadeComAnexo) =>
  new NaoEncontrado('registro_nao_encontrado', 'Registro não encontrado.', { entidade });
const semEscrita = () =>
  new PermissaoNegada('anexo_sem_escrita_no_hotel', 'Você não pode anexar arquivos neste hotel.');

export function criarCasosDeUsoDeAnexos(deps: DependenciasDeAnexos): CasosDeUsoDeAnexos {
  const podeRemover = deps.podeRemover ?? podeRemoverAnexo;
  const emSegundos = (s: number) => new Date(deps.relogio.agora().getTime() + s * 1000);
  const anexoVisivel = async (ctx: Contexto, anexoId: string) => {
    const a = await deps.anexos.anexo(ctx, anexoId);
    if (!a || a.removidoEm) throw naoEncontrado();
    return a;
  };

  return {
    async pedirUrlDeUpload(ctx, pedido) {
      const ext = TIPOS_DE_ANEXO[pedido.tipo as TipoDeAnexo];
      if (!ext) {
        throw new RegraViolada('tipo_de_arquivo_nao_aceito', 'Tipo de arquivo não aceito.', {
          tipo: pedido.tipo,
        });
      }
      const hotelId = await deps.escopo.hotelDoRegistro(ctx, pedido.entidade, pedido.registroId);
      if (!hotelId) throw registroNaoEncontrado(pedido.entidade);
      if (!(await deps.escopo.escreveNoHotel(ctx, hotelId))) throw semEscrita();
      // Em minúsculas, como o banco escreve os UUIDs: o registro (B4) confere
      // o caminho contra os ids da própria linha.
      const caminho = [
        ctx.tenantId,
        hotelId,
        pedido.entidade,
        pedido.registroId,
        `${deps.novoId()}.${ext}`,
      ]
        .join('/')
        .toLowerCase();
      const { url, token } = await deps.armazenamento.urlDeUpload(caminho);
      return { caminho, url, token, expiraEm: emSegundos(SEGUNDOS_URL_DE_UPLOAD) };
    },

    async pedirUrlDeDownload(ctx, caminho) {
      const c = lerCaminho(caminho);
      if (!c) throw naoEncontrado();
      if (c.tenantId.toLowerCase() !== ctx.tenantId.toLowerCase()) throw naoEncontrado();
      if (!(await deps.escopo.leNoHotel(ctx, c.hotelId))) throw naoEncontrado();
      const hotelDoRegistro = await deps.escopo.hotelDoRegistro(ctx, c.entidade, c.registroId);
      if (hotelDoRegistro?.toLowerCase() !== c.hotelId.toLowerCase()) throw naoEncontrado();
      const url = await deps.armazenamento.urlDeDownload(caminho, SEGUNDOS_URL_DE_DOWNLOAD);
      return { url, expiraEm: emSegundos(SEGUNDOS_URL_DE_DOWNLOAD) };
    },

    async registrar(ctx, pedido) {
      const c = lerCaminho(pedido.caminho);
      if (!c || pedido.caminho !== pedido.caminho.toLowerCase()) {
        throw new RegraViolada('caminho_de_anexo_invalido', 'Caminho de anexo inválido.');
      }
      if (c.tenantId !== ctx.tenantId.toLowerCase()) throw registroNaoEncontrado(c.entidade);
      const hotelId = await deps.escopo.hotelDoRegistro(ctx, c.entidade, c.registroId);
      if (hotelId?.toLowerCase() !== c.hotelId) throw registroNaoEncontrado(c.entidade);
      if (!(await deps.escopo.escreveNoHotel(ctx, hotelId))) throw semEscrita();
      let miniaturaCaminho: string | null = null;
      if (pedido.miniaturaCaminho) {
        const m = lerCaminho(pedido.miniaturaCaminho);
        if (
          !m ||
          pedido.miniaturaCaminho !== pedido.miniaturaCaminho.toLowerCase() ||
          pedido.miniaturaCaminho === pedido.caminho
        ) {
          throw new RegraViolada('miniatura_invalida', 'Miniatura inválida.');
        }
        validarMiniatura(c, m);
        miniaturaCaminho = pedido.miniaturaCaminho;
      }
      return deps.anexos.registrar(ctx, {
        hotelId: c.hotelId,
        entidade: c.entidade,
        registroId: c.registroId,
        caminho: pedido.caminho,
        miniaturaCaminho,
        tipo: c.tipo,
        nome: normalizarNomeDeAnexo(pedido.nome),
      });
    },

    async listar(ctx, entidade, registroId) {
      const hotelId = await deps.escopo.hotelDoRegistro(ctx, entidade, registroId);
      if (!hotelId) throw registroNaoEncontrado(entidade);
      const anexos = await deps.anexos.anexos(ctx, entidade, registroId);
      const hotel = await deps.anexos.hotel(ctx, hotelId);
      const escreve = hotel !== null && (await deps.escopo.escreveNoHotel(ctx, hotelId));
      const minhas = escreve ? await deps.atribuicoes.doUsuario(ctx) : [];
      const agora = deps.relogio.agora();
      return anexos.map((a) => ({
        id: a.id,
        hotelId: a.hotelId,
        entidade: a.entidade,
        registroId: a.registroId,
        tipo: a.tipo,
        nome: a.nome,
        usuarioId: a.usuarioId,
        nomeUsuario: a.nomeUsuario,
        criadoEm: a.criadoEm,
        temMiniatura: a.miniaturaCaminho !== null,
        podeRemover:
          escreve &&
          hotel !== null &&
          podeRemover(minhas, hotel, a, ctx.usuarioId, agora).permitido,
      }));
    },

    async pedirUrlDoAnexo(ctx, anexoId, miniatura) {
      const a = await anexoVisivel(ctx, anexoId);
      const caminho = miniatura ? a.miniaturaCaminho : a.caminho;
      if (!caminho) throw naoEncontrado();
      const url = await deps.armazenamento.urlDeDownload(caminho, SEGUNDOS_URL_DE_DOWNLOAD);
      return { url, expiraEm: emSegundos(SEGUNDOS_URL_DE_DOWNLOAD) };
    },

    async remover(ctx, anexoId) {
      const a = await anexoVisivel(ctx, anexoId);
      const hotel = await deps.anexos.hotel(ctx, a.hotelId);
      if (!hotel) throw naoEncontrado();
      exigir(
        podeRemover(
          await deps.atribuicoes.doUsuario(ctx),
          hotel,
          a,
          ctx.usuarioId,
          deps.relogio.agora(),
        ),
      );
      await deps.anexos.remover(ctx, anexoId);
    },
  };
}
