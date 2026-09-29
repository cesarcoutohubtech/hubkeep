// Envio de um anexo pelo web (fase 1a, B4; ADR-024). Imagem sai comprimida e
// com miniatura, pelo mesmo código do PWA (@hubkeep/imagem); PDF vai como
// está. Cada arquivo vai do navegador direto ao Storage pela URL assinada
// (PUT) e o anexo é registrado na API com os caminhos.
import { type FotoPreparada, TIPOS_DE_FOTO, prepararFoto } from '@hubkeep/imagem';
import { type ErroDaApi, chamarApi } from './api';

export type Entidade = 'hotel' | 'local' | 'ativo';

export interface DepsDoEnvio {
  preparar?: (arquivo: Blob) => Promise<FotoPreparada>;
  chamar?: typeof chamarApi;
  requisitar?: typeof fetch;
}

class FalhaDoEnvio extends Error {
  constructor(readonly erro: ErroDaApi) {
    super(erro.codigo);
  }
}

const falha = (codigo: string) => new FalhaDoEnvio({ codigo, parametros: {} });

/** Envia e registra o arquivo; null quando deu certo, senão o erro para exibir. */
export async function enviarAnexo(
  alvo: { entidade: Entidade; registroId: string },
  arquivo: File,
  deps: DepsDoEnvio = {},
): Promise<ErroDaApi | null> {
  const preparar = deps.preparar ?? prepararFoto;
  const chamar = deps.chamar ?? chamarApi;
  const requisitar = deps.requisitar ?? fetch;

  async function subir(conteudo: Blob, tipo: string): Promise<string> {
    const u = await chamar<{ caminho: string; url: string }>('/api/v1/anexos/url-de-upload', {
      method: 'POST',
      body: JSON.stringify({ ...alvo, tipo }),
    });
    if (!u.ok) throw new FalhaDoEnvio(u.erro);
    const envio = await requisitar(u.dados.url, {
      method: 'PUT',
      headers: { 'content-type': tipo },
      body: conteudo,
    }).catch(() => null);
    if (!envio?.ok) throw falha('envio_de_arquivo_falhou');
    return u.dados.caminho;
  }

  try {
    let caminho: string;
    let miniaturaCaminho: string | undefined;
    if (TIPOS_DE_FOTO.includes(arquivo.type)) {
      const preparada = await preparar(arquivo).catch(() => {
        throw falha('foto_ilegivel');
      });
      caminho = await subir(preparada.foto, 'image/jpeg');
      miniaturaCaminho = await subir(preparada.miniatura, 'image/jpeg');
    } else {
      caminho = await subir(arquivo, arquivo.type);
    }
    const r = await chamar<{ id: string }>('/api/v1/anexos', {
      method: 'POST',
      body: JSON.stringify({ caminho, miniaturaCaminho, nome: arquivo.name || null }),
    });
    return r.ok ? null : r.erro;
  } catch (e) {
    if (e instanceof FalhaDoEnvio) return e.erro;
    throw e;
  }
}
