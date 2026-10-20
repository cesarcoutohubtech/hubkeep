// QR individual do ativo no PWA (fase 1a, B5): o QR impresso leva a
// /q/<codigo>. Com o ativo na referência guardada, abre sem rede; senão, com
// rede, pergunta à API, que respeita o escopo (código de outro tenant ou fora
// do escopo dá 404, sem distinguir). Sem rede e sem o ativo no aparelho, avisa
// e leva o código lido. A etiqueta reservada (M3): o código sem ativo que o
// servidor diz estar reservado e livre abre o cadastro com ele; sem rede, o
// aviso oferece cadastrar com o código, e o servidor confere ao receber.
import { RespostaDeAtivoDoQr, RespostaDeCodigoReservado } from '@hubkeep/contratos';
import { lerCodigoQr } from '@hubkeep/dominio';
import { type Credenciais, baseDaApi, cabecalhos } from './api';
import type { AtivoGuardado, Referencia } from './referencia/banco';

export type ResultadoDoQr =
  | { tipo: 'ok'; hotelId: string; ativo: AtivoGuardado }
  /** A etiqueta reservada e livre (M3): o cadastro abre no hotel dela, com o código. */
  | { tipo: 'reservado'; hotelId: string; codigo: string }
  /** Sem rede: o código lido, para oferecer o cadastro com ele (M3). */
  | { tipo: 'erro'; codigo: 'qr_sem_rede'; lido: string }
  | { tipo: 'erro'; codigo: 'ativo_nao_encontrado' | 'qr_falhou' };

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
  if (!deps.online) return { tipo: 'erro', codigo: 'qr_sem_rede', lido: codigo };
  const h = await cabecalhos(deps.credenciais);
  if (!h) return { tipo: 'erro', codigo: 'qr_falhou' };
  try {
    const r = await (deps.requisitar ?? fetch)(`${baseDaApi()}/api/v1/ativos/qr/${codigo}`, {
      headers: h,
    });
    if (r.status === 404) return await reservado(codigo, h, deps.requisitar ?? fetch);
    if (!r.ok) return { tipo: 'erro', codigo: 'qr_falhou' };
    const { hotelId, ativo } = RespostaDeAtivoDoQr.parse(await r.json());
    return { tipo: 'ok', hotelId, ativo };
  } catch {
    return { tipo: 'erro', codigo: 'qr_falhou' };
  }
}

/** O código sem ativo visível: a etiqueta reservada e livre abre o cadastro (M3). */
async function reservado(
  codigo: string,
  h: HeadersInit,
  requisitar: typeof fetch,
): Promise<ResultadoDoQr> {
  const r = await requisitar(`${baseDaApi()}/api/v1/qr-reservados/${codigo}`, { headers: h });
  if (r.status === 404) return { tipo: 'erro', codigo: 'ativo_nao_encontrado' };
  if (!r.ok) return { tipo: 'erro', codigo: 'qr_falhou' };
  const reserva = RespostaDeCodigoReservado.parse(await r.json());
  // Ligado, mas o ativo não é visível a quem lê: como o código desconhecido.
  return reserva.ligado
    ? { tipo: 'erro', codigo: 'ativo_nao_encontrado' }
    : { tipo: 'reservado', hotelId: reserva.hotelId, codigo: reserva.codigo };
}
