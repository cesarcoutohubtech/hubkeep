// Fotos do ativo pelo PWA (fase 1a, B4; ADR-024), com rede: a foto e a
// miniatura são preparadas no aparelho, cada uma vai direto ao Storage pela
// URL assinada (PUT) e o anexo é registrado na API com os dois caminhos.
//
// A foto da OS (C4b) funciona sem rede: é preparada na hora e vai para a fila
// de operações (anexo.foto), com dois arquivoIds gerados no aparelho, um para
// a foto e outro para a miniatura. No reenvio, os caminhos são os mesmos, e o
// que já tinha chegado conta como feito:
//   - URL de upload recusada com 409 arquivo_ja_enviado: o arquivo já está no
//     Storage; a API devolve o caminho, e o envio segue sem o PUT;
//   - PUT recusado pelo Storage como duplicado (409 no corpo): idem;
//   - registro recusado com 409 anexo_ja_registrado: a foto já estava feita.
// A regra da OS (responsável, em execução ou pausada) volta como recusa, com
// o código, igual às outras operações da fila.
import {
  RespostaDeAnexoRegistrado,
  RespostaDeAnexos,
  RespostaDeUrlDeDownload,
  RespostaDeUrlDeUpload,
} from '@hubkeep/contratos';
import { type FotoPreparada, prepararFoto } from '@hubkeep/imagem';
import { type Credenciais, baseDaApi, cabecalhos } from '../api';
import type { FotoNaFila, OperacaoNaFila } from '../fila/banco';
import { type Envio, type ResultadoDoEnvio, vaiTentarDeNovo } from '../fila/sincronizar';

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

/** A foto da OS pronta para a fila: preparada agora, com os arquivoIds fixos. */
export async function fotoParaFila(
  osId: string,
  arquivo: Blob,
  nome: string | null,
  deps: { preparar?: (arquivo: Blob) => Promise<FotoPreparada>; novoId?: () => string } = {},
): Promise<FotoNaFila> {
  const preparada = await (deps.preparar ?? prepararFoto)(arquivo);
  const novoId = deps.novoId ?? (() => crypto.randomUUID());
  return {
    entidade: 'os',
    registroId: osId,
    arquivoId: novoId(),
    miniaturaArquivoId: novoId(),
    foto: await preparada.foto.arrayBuffer(),
    miniatura: await preparada.miniatura.arrayBuffer(),
    nome,
  };
}

type Corpo = Record<string, unknown> | null;

/** Corpo JSON da resposta; null se não é JSON. */
const corpoDe = async (r: Response): Promise<Corpo> => (await r.json().catch(() => null)) as Corpo;

const erroDa = (corpo: Corpo) =>
  (corpo?.erro ?? null) as { codigo?: string; parametros?: Record<string, unknown> } | null;

/** O Storage recusa o caminho que já tem arquivo com 409 no corpo; o status HTTP varia (400 ou 409). */
const duplicadoNoStorage = (status: number, corpo: Corpo) =>
  status === 409 || String(corpo?.statusCode) === '409' || corpo?.error === 'Duplicate';

class Adiar extends Error {
  constructor(readonly motivo: string) {
    super(motivo);
  }
}
class Recusar extends Error {
  constructor(readonly codigo: string) {
    super(codigo);
  }
}

/** Envio da operação anexo.foto da fila; nunca lança (como o criarEnvio). */
export function criarEnvioDeFoto(c: Credenciais, requisitar: typeof fetch = fetch): Envio {
  async function chamar(
    caminho: string,
    corpo: unknown,
  ): Promise<{ status: number; corpo: Corpo }> {
    const h = await cabecalhos(c);
    if (!h) throw new Adiar('sem_sessao');
    let r: Response;
    try {
      r = await requisitar(`${baseDaApi()}${caminho}`, {
        method: 'POST',
        headers: h,
        body: JSON.stringify(corpo),
      });
    } catch {
      throw new Adiar('sem_rede');
    }
    return { status: r.status, corpo: await corpoDe(r) };
  }

  async function subir(f: FotoNaFila, arquivoId: string, bytes: ArrayBuffer): Promise<string> {
    const u = await chamar('/api/v1/anexos/url-de-upload', {
      entidade: f.entidade,
      registroId: f.registroId,
      tipo: 'image/jpeg',
      arquivoId,
    });
    const erro = erroDa(u.corpo);
    const jaEnviado = erro?.parametros?.caminho;
    if (
      u.status === 409 &&
      erro?.codigo === 'arquivo_ja_enviado' &&
      typeof jaEnviado === 'string'
    ) {
      return jaEnviado;
    }
    if (vaiTentarDeNovo(u.status)) throw new Adiar(`http_${u.status}`);
    if (u.status !== 200 && u.status !== 201) throw new Recusar(erro?.codigo ?? `http_${u.status}`);
    const destino = RespostaDeUrlDeUpload.parse(u.corpo);
    let envio: Response;
    try {
      envio = await requisitar(destino.url, {
        method: 'PUT',
        headers: { 'content-type': 'image/jpeg' },
        body: new Blob([bytes], { type: 'image/jpeg' }),
      });
    } catch {
      throw new Adiar('sem_rede');
    }
    if (envio.ok || duplicadoNoStorage(envio.status, await corpoDe(envio))) return destino.caminho;
    // O Storage fora do ar ou a URL vencida no meio do caminho: tenta de novo.
    throw new Adiar(`storage_${envio.status}`);
  }

  return async (op: OperacaoNaFila): Promise<ResultadoDoEnvio> => {
    if (op.usuarioId !== c.usuarioId()) return { tipo: 'tentar_depois', motivo: 'outra_sessao' };
    const f = op.dados as FotoNaFila;
    try {
      const caminho = await subir(f, f.arquivoId, f.foto);
      const miniaturaCaminho = await subir(f, f.miniaturaArquivoId, f.miniatura);
      const r = await chamar('/api/v1/anexos', { caminho, miniaturaCaminho, nome: f.nome });
      if (r.status === 201 || r.status === 200) return { tipo: 'aceita' };
      const codigo = erroDa(r.corpo)?.codigo;
      if (r.status === 409 && codigo === 'anexo_ja_registrado') return { tipo: 'aceita' };
      if (vaiTentarDeNovo(r.status)) return { tipo: 'tentar_depois', motivo: `http_${r.status}` };
      return { tipo: 'recusada', codigo: codigo ?? `http_${r.status}` };
    } catch (e) {
      if (e instanceof Adiar) return { tipo: 'tentar_depois', motivo: e.motivo };
      if (e instanceof Recusar) return { tipo: 'recusada', codigo: e.codigo };
      // Resposta fora do contrato: reenviar não adianta.
      return { tipo: 'recusada', codigo: 'entrada_invalida' };
    }
  };
}
