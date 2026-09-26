// Cliente da API /api/v1 para o PWA: o access token do Supabase no cabeçalho
// Authorization e o tenant em x-hubkeep-tenant (docs/01). O PWA fala só com a
// API; o navegador nunca acessa tabelas.
import { PedidoDeOperacaoOffline, RespostaDeOperacaoOffline } from '@hubkeep/contratos';
import type { OperacaoNaFila } from './fila/banco';
import { type Envio, type ResultadoDoEnvio, vaiTentarDeNovo } from './fila/sincronizar';

export interface Credenciais {
  token: () => Promise<string | null>;
  tenant: () => string | null;
}

/** Base da API: vazia no dev (o Vite repassa /api para o web) ou VITE_API_URL. */
export const baseDaApi = (): string => import.meta.env.VITE_API_URL ?? '';

async function cabecalhos(c: Credenciais): Promise<Record<string, string> | null> {
  const token = await c.token();
  const tenant = c.tenant();
  if (!token || !tenant) return null;
  return {
    'content-type': 'application/json',
    authorization: `Bearer ${token}`,
    'x-hubkeep-tenant': tenant,
  };
}

/** Envio de uma operação da fila; qualquer falha de rede vira tentar_depois. */
export function criarEnvio(c: Credenciais, requisitar: typeof fetch = fetch): Envio {
  return async (op: OperacaoNaFila): Promise<ResultadoDoEnvio> => {
    const h = await cabecalhos(c);
    if (!h) return { tipo: 'tentar_depois', motivo: 'sem_sessao' };
    // Fora do contrato não adianta reenviar: recusa aqui, sem travar a fila.
    const pedido = PedidoDeOperacaoOffline.safeParse({
      chave: op.chave,
      tipo: op.tipo,
      dados: op.dados,
    });
    if (!pedido.success) return { tipo: 'recusada', codigo: 'entrada_invalida' };
    const corpo = pedido.data;
    let r: Response;
    try {
      r = await requisitar(`${baseDaApi()}/api/v1/sincronizacao/operacoes`, {
        method: 'POST',
        headers: h,
        body: JSON.stringify(corpo),
      });
    } catch {
      return { tipo: 'tentar_depois', motivo: 'sem_rede' };
    }
    if (r.status === 200 || r.status === 201) {
      RespostaDeOperacaoOffline.parse(await r.json());
      return { tipo: 'aceita' };
    }
    if (vaiTentarDeNovo(r.status)) return { tipo: 'tentar_depois', motivo: `http_${r.status}` };
    const erro = (await r.json().catch(() => null)) as { erro?: { codigo?: string } } | null;
    return { tipo: 'recusada', codigo: erro?.erro?.codigo ?? `http_${r.status}` };
  };
}

export interface PreferenciasDoServidor {
  idioma: string;
  gravadas: { idioma: string | null; formatoRegional: string | null; fuso: string | null };
}

/** Preferências resolvidas do usuário; null sem rede ou sem sessão. */
export async function lerPreferencias(
  c: Credenciais,
  requisitar: typeof fetch = fetch,
): Promise<PreferenciasDoServidor | null> {
  const h = await cabecalhos(c);
  if (!h) return null;
  try {
    const r = await requisitar(`${baseDaApi()}/api/v1/preferencias`, { headers: h });
    return r.ok ? ((await r.json()) as PreferenciasDoServidor) : null;
  } catch {
    return null;
  }
}
