// Chamada à API /api/v1 pelas telas do web: o cookie de sessão e o tenant ativo
// (cookie hk_tenant) vão sozinhos. O erro volta como código e parâmetros, sem
// frase (ADR-022); quem exibe traduz com useMensagemDeErro.
export interface ErroDaApi {
  codigo: string;
  parametros: Record<string, unknown>;
}

export type RespostaDaApi<T> = { ok: true; dados: T } | { ok: false; erro: ErroDaApi };

export async function chamarApi<T>(caminho: string, init?: RequestInit): Promise<RespostaDaApi<T>> {
  let r: Response;
  try {
    r = await fetch(caminho, {
      ...init,
      headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
    });
  } catch {
    return { ok: false, erro: { codigo: 'erro_interno', parametros: {} } };
  }
  const corpo = (await r.json().catch(() => null)) as unknown;
  if (r.ok) return { ok: true, dados: corpo as T };
  const erro = (corpo as { erro?: Partial<ErroDaApi> } | null)?.erro;
  return {
    ok: false,
    erro: { codigo: erro?.codigo ?? 'erro_interno', parametros: erro?.parametros ?? {} },
  };
}
