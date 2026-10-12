// Anexos (F0-10 e B4, ADR-024).
//
//   upload    o registro precisa existir para o usuário (RLS) e o hotel dele
//             estar entre os que o usuário escreve; o caminho é calculado aqui,
//             {tenant}/{hotel}/{entidade}/{registro}/{id}.{ext}, nunca vem do
//             cliente. O aparelho envia direto para a URL (docs/01). Com o
//             arquivoId do aparelho, o caminho do reenvio é o mesmo; se o
//             arquivo já está lá, 409 arquivo_ja_enviado com o caminho, para
//             o aparelho seguir para o registro (foto offline, C4).
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
// A entidade pode ter regra própria para anexar (regraParaAnexar): na OS, só
// o responsável, com a OS atribuída, em execução ou pausada (C4 e I8). Vale
// no upload e no registro.
//
// Foto antes ou depois (I8): o anexo da OS pode levar o momento; fora da OS,
// 422 momento_so_na_os. A assinatura do aceite tem URL própria
// (pedirUrlDaAssinatura): quem pode aceitar a OS (regraParaAssinar, da
// triagem) recebe a URL de um PNG novo na pasta da OS; o registro é feito
// pelo aceite, na mesma unit of work. Ninguém remove a assinatura.
import {
  type Atribuicao,
  Conflito,
  type Contexto,
  NaoEncontrado,
  PermissaoNegada,
  type Resultado,
  RegraViolada,
  exigir,
  normalizarNomeDeAnexo,
  podeRemoverAnexo,
  type MomentoDaFoto,
  validarMiniatura,
  validarMomentoDoAnexo,
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
  /** Regra da entidade para anexar, depois do escopo (a OS: casos de uso de execução, C4). */
  regraParaAnexar?: (
    ctx: Contexto,
    entidade: EntidadeComAnexo,
    registroId: string,
  ) => Promise<void>;
  /** Quem pode aceitar a OS, para a URL da assinatura (I8; casos de uso de triagem). */
  regraParaAssinar?: (ctx: Contexto, osId: string) => Promise<void>;
  /** Padrão: podeRemoverAnexo do domínio. Só o teste de aceite troca. */
  podeRemover?: (
    minhas: readonly Atribuicao[],
    hotel: { id: string; bandeiraId: string | null },
    anexo: { usuarioId: string; assinatura?: boolean },
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
  /** Foto da OS antes ou depois (I8). */
  momento?: MomentoDaFoto | null | undefined;
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
    pedido: {
      entidade: EntidadeComAnexo;
      registroId: string;
      tipo: string;
      /** Gerado no aparelho, para o caminho ser o mesmo no reenvio (C4); senão, novo. */
      arquivoId?: string | undefined;
    },
  ): Promise<{ caminho: string; url: string; token: string; expiraEm: Date }>;
  /** URL de upload da assinatura do aceite (I8): um PNG novo na pasta da OS. */
  pedirUrlDaAssinatura(
    ctx: Contexto,
    osId: string,
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
      await deps.regraParaAnexar?.(ctx, pedido.entidade, pedido.registroId);
      // Em minúsculas, como o banco escreve os UUIDs: o registro (B4) confere
      // o caminho contra os ids da própria linha.
      const caminho = [
        ctx.tenantId,
        hotelId,
        pedido.entidade,
        pedido.registroId,
        `${pedido.arquivoId ?? deps.novoId()}.${ext}`,
      ]
        .join('/')
        .toLowerCase();
      const urlDoArquivo = await deps.armazenamento.urlDeUpload(caminho);
      if (!urlDoArquivo) {
        throw new Conflito('arquivo_ja_enviado', 'Este arquivo já foi enviado.', { caminho });
      }
      const { url, token } = urlDoArquivo;
      return { caminho, url, token, expiraEm: emSegundos(SEGUNDOS_URL_DE_UPLOAD) };
    },

    async pedirUrlDaAssinatura(ctx, osId) {
      const hotelId = await deps.escopo.hotelDoRegistro(ctx, 'os', osId);
      if (!hotelId) throw registroNaoEncontrado('os');
      if (!(await deps.escopo.escreveNoHotel(ctx, hotelId))) throw semEscrita();
      if (!deps.regraParaAssinar) throw new Error('Assinatura sem a regra de quem aceita.');
      await deps.regraParaAssinar(ctx, osId);
      const caminho = [ctx.tenantId, hotelId, 'os', osId, `${deps.novoId()}.png`]
        .join('/')
        .toLowerCase();
      const urlDoArquivo = await deps.armazenamento.urlDeUpload(caminho);
      if (!urlDoArquivo) {
        throw new Conflito('arquivo_ja_enviado', 'Este arquivo já foi enviado.', { caminho });
      }
      const { url, token } = urlDoArquivo;
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
      const momento = validarMomentoDoAnexo(c.entidade, pedido.momento);
      if (c.tenantId !== ctx.tenantId.toLowerCase()) throw registroNaoEncontrado(c.entidade);
      const hotelId = await deps.escopo.hotelDoRegistro(ctx, c.entidade, c.registroId);
      if (hotelId?.toLowerCase() !== c.hotelId) throw registroNaoEncontrado(c.entidade);
      if (!(await deps.escopo.escreveNoHotel(ctx, hotelId))) throw semEscrita();
      await deps.regraParaAnexar?.(ctx, c.entidade, c.registroId);
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
        momento,
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
        momento: a.momento,
        assinatura: a.assinatura,
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
