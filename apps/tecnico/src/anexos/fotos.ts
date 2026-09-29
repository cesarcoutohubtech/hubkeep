// Fotos do ativo pelo PWA (fase 1a, B4; ADR-024), com rede: a foto e a
// miniatura são preparadas no aparelho, cada uma vai direto ao Storage pela
// URL assinada (PUT) e o anexo é registrado na API com os dois caminhos. A
// foto sem rede, na fila offline, entra com a execução da OS (C4).
import {
  RespostaDeAnexoRegistrado,
  RespostaDeAnexos,
  RespostaDeUrlDeDownload,
  RespostaDeUrlDeUpload,
} from '@hubkeep/contratos';
import { type FotoPreparada, prepararFoto } from '@hubkeep/imagem';
import { type Credenciais, baseDaApi, cabecalhos } from '../api';

export type ResultadoDaFoto = { tipo: 'ok' } | { tipo: 'erro'; codigo: string };

export interface FotoListada {
  id: string;
  nome: string | null;
  temMiniatura: boolean;
  criadoEm: string;
}

export interface PortaDeFotos {
  /** Anexos do ativo, do mais novo para o mais antigo; null sem rede ou sem sessão. */
  listar(ativoId: string): Promise<FotoListada[] | null>;
  /** URL de 5 minutos da miniatura; null se não deu. */
  urlDaMiniatura(anexoId: string): Promise<string | null>;
  enviar(ativoId: string, arquivo: Blob, nome: string | null): Promise<ResultadoDaFoto>;
}

class FalhaDaFoto extends Error {
  constructor(readonly codigo: string) {
    super(codigo);
  }
}

export function criarFotos(
  c: Credenciais,
  deps: { preparar?: (arquivo: Blob) => Promise<FotoPreparada>; requisitar?: typeof fetch } = {},
): PortaDeFotos {
  const preparar = deps.preparar ?? prepararFoto;
  const requisitar = deps.requisitar ?? fetch;

  async function api(caminho: string, init: RequestInit = {}): Promise<unknown> {
    const h = await cabecalhos(c);
    if (!h) throw new FalhaDaFoto('nao_autenticado');
    let r: Response;
    try {
      r = await requisitar(`${baseDaApi()}${caminho}`, { ...init, headers: h });
    } catch {
      throw new FalhaDaFoto('envio_de_arquivo_falhou');
    }
    const corpo = (await r.json().catch(() => null)) as unknown;
    if (!r.ok) {
      const codigo = (corpo as { erro?: { codigo?: string } } | null)?.erro?.codigo;
      throw new FalhaDaFoto(codigo ?? `http_${r.status}`);
    }
    return corpo;
  }

  async function subir(ativoId: string, arquivo: Blob): Promise<string> {
    const u = RespostaDeUrlDeUpload.parse(
      await api('/api/v1/anexos/url-de-upload', {
        method: 'POST',
        body: JSON.stringify({ entidade: 'ativo', registroId: ativoId, tipo: 'image/jpeg' }),
      }),
    );
    const envio = await requisitar(u.url, {
      method: 'PUT',
      headers: { 'content-type': 'image/jpeg' },
      body: arquivo,
    }).catch(() => null);
    if (!envio?.ok) throw new FalhaDaFoto('envio_de_arquivo_falhou');
    return u.caminho;
  }

  return {
    async listar(ativoId) {
      try {
        const r = RespostaDeAnexos.parse(await api(`/api/v1/ativos/${ativoId}/anexos`));
        return r.anexos.map((a) => ({
          id: a.id,
          nome: a.nome,
          temMiniatura: a.temMiniatura,
          criadoEm: a.criadoEm,
        }));
      } catch {
        return null;
      }
    },
    async urlDaMiniatura(anexoId) {
      try {
        const r = RespostaDeUrlDeDownload.parse(
          await api(`/api/v1/anexos/${anexoId}/url-de-download`, {
            method: 'POST',
            body: JSON.stringify({ miniatura: true }),
          }),
        );
        return r.url;
      } catch {
        return null;
      }
    },
    async enviar(ativoId, arquivo, nome) {
      let preparada: FotoPreparada;
      try {
        preparada = await preparar(arquivo);
      } catch {
        return { tipo: 'erro', codigo: 'foto_ilegivel' };
      }
      try {
        const caminho = await subir(ativoId, preparada.foto);
        const miniaturaCaminho = await subir(ativoId, preparada.miniatura);
        RespostaDeAnexoRegistrado.parse(
          await api('/api/v1/anexos', {
            method: 'POST',
            body: JSON.stringify({ caminho, miniaturaCaminho, nome }),
          }),
        );
        return { tipo: 'ok' };
      } catch (e) {
        if (e instanceof FalhaDaFoto) return { tipo: 'erro', codigo: e.codigo };
        throw e;
      }
    },
  };
}
