// Chamada à API /api/v1 pelas telas do web: o cookie de sessão e o tenant ativo
// (cookie hk_tenant) vão sozinhos. O erro volta como código e parâmetros, sem
// frase (ADR-022); quem exibe traduz com useMensagemDeErro.
export interface ErroDaApi {
  codigo: string;
  parametros: Record<string, unknown>;
}

export type RespostaDaApi<T> = { ok: true; dados: T } | { ok: false; erro: ErroDaApi };

/**
 * A sessão em aal1 de quem passou a exigir o segundo fator (SP1, ADR-049):
 * o papel foi concedido depois do login, ou a sessão é de antes da SP1. Sai e
 * volta ao login, que pede o código ou o cadastro do fator.
 */
export function voltarAoLoginPeloSegundoFator(): void {
  void fetch('/auth/sessao', { method: 'DELETE' })
    .catch(() => null)
    .finally(() => location.assign('/login?erro=segundo_fator'));
}

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
  if (r.status === 403 && erro?.codigo === 'segundo_fator_obrigatorio') {
    voltarAoLoginPeloSegundoFator();
  }
  return {
    ok: false,
    erro: { codigo: erro?.codigo ?? 'erro_interno', parametros: erro?.parametros ?? {} },
  };
}
