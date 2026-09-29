// QR individual do ativo no PWA (fase 1a, B5): o QR impresso leva a
// /q/<codigo>. Com o ativo na referência guardada, abre sem rede; senão, com
// rede, pergunta à API, que respeita o escopo (código de outro tenant ou fora
// do escopo dá 404, sem distinguir). Sem rede e sem o ativo no aparelho, avisa.
import { RespostaDeAtivoDoQr } from '@hubkeep/contratos';
import { lerCodigoQr } from '@hubkeep/dominio';
import { type Credenciais, baseDaApi, cabecalhos } from './api';
import type { AtivoGuardado, Referencia } from './referencia/banco';

export type ResultadoDoQr =
  | { tipo: 'ok'; hotelId: string; ativo: AtivoGuardado }
  | { tipo: 'erro'; codigo: 'ativo_nao_encontrado' | 'qr_sem_rede' | 'qr_falhou' };

/** O código cru de /q/<codigo>; null para qualquer outro caminho. */
export function codigoDoCaminho(caminho: string): string | null {
  const m = /^\/q\/([^/]{1,40})\/?$/.exec(caminho);
  if (!m?.[1]) return null;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return null;
  }
}

/** O ativo do código na referência do aparelho, em qualquer hotel dela. */
export function noAparelho(
  referencia: Referencia | null,
  codigo: string,
): { hotelId: string; ativo: AtivoGuardado } | null {
  for (const [hotelId, ativos] of Object.entries(referencia?.ativos ?? {})) {
    const ativo = ativos.find((a) => a.codigoQr === codigo);
    if (ativo) return { hotelId, ativo };
  }
  return null;
}

export async function abrirQr(
  texto: string,
  deps: {
    referencia: Referencia | null;
    online: boolean;
    credenciais: Credenciais;
    requisitar?: typeof fetch;
  },
): Promise<ResultadoDoQr> {
  const codigo = lerCodigoQr(texto);
  if (codigo === null) return { tipo: 'erro', codigo: 'ativo_nao_encontrado' };
  const local = noAparelho(deps.referencia, codigo);
  if (local) return { tipo: 'ok', ...local };
  if (!deps.online) return { tipo: 'erro', codigo: 'qr_sem_rede' };
  const h = await cabecalhos(deps.credenciais);
  if (!h) return { tipo: 'erro', codigo: 'qr_falhou' };
  try {
    const r = await (deps.requisitar ?? fetch)(`${baseDaApi()}/api/v1/ativos/qr/${codigo}`, {
      headers: h,
    });
    if (r.status === 404) return { tipo: 'erro', codigo: 'ativo_nao_encontrado' };
    if (!r.ok) return { tipo: 'erro', codigo: 'qr_falhou' };
    const { hotelId, ativo } = RespostaDeAtivoDoQr.parse(await r.json());
    return { tipo: 'ok', hotelId, ativo };
  } catch {
    return { tipo: 'erro', codigo: 'qr_falhou' };
  }
}
