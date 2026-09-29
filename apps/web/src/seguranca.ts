// Cabeçalhos de segurança e checagem de origem do web (S1, ADR-032). Funções
// puras, usadas pelo proxy.ts (a cada requisição) e pelos testes.
//
//   CSP com nonce: o Next aplica o nonce aos scripts dele quando o encontra no
//   cabeçalho Content-Security-Policy da requisição (o proxy o coloca lá).
//   'strict-dynamic' deixa os scripts carregados por eles rodarem; nenhum
//   script inline sem nonce e nenhum de outra origem. Estilo inline fica
//   liberado (as telas usam o atributo style, que não aceita nonce).
//
//   Origem (CSRF): a sessão do web é cookie, que o navegador manda sozinho.
//   Requisição que muda estado e não traz Authorization (Bearer do PWA, Agent
//   do conector, segredo do cron) só passa com Origin igual à do próprio site,
//   ou, sem Origin, com Sec-Fetch-Site same-origin. Sem nenhum dos dois, passa
//   só quem não tem cookie e não está em /auth: sem cookie não há credencial
//   que um site de fora pudesse usar.

const METODOS_SEGUROS = new Set(['GET', 'HEAD', 'OPTIONS']);

export interface OpcoesDaPolitica {
  nonce: string;
  /** URL do Supabase (Auth no login, Storage nas URLs assinadas). */
  urlSupabase: string | undefined;
  desenvolvimento: boolean;
}

const origemDe = (url: string | undefined): string | null => {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
};

/** Content-Security-Policy das páginas. */
export function politicaDeConteudo({ nonce, urlSupabase, desenvolvimento }: OpcoesDaPolitica) {
  const supabase = origemDe(urlSupabase);
  const externos = supabase ? [supabase] : [];
  const diretivas: [string, ...string[]][] = [
    ['default-src', "'self'"],
    // O modo dev do Next usa eval (React Refresh); o build de produção, não.
    [
      'script-src',
      "'self'",
      `'nonce-${nonce}'`,
      "'strict-dynamic'",
      ...(desenvolvimento ? ["'unsafe-eval'"] : []),
    ],
    ['style-src', "'self'", "'unsafe-inline'"],
    ['img-src', "'self'", 'data:', 'blob:', ...externos],
    ['font-src', "'self'"],
    ['connect-src', "'self'", ...externos],
    ['frame-src', "'none'"],
    ['object-src', "'none'"],
    ['base-uri', "'self'"],
    ['form-action', "'self'"],
    ['frame-ancestors', "'none'"],
    ...(desenvolvimento ? [] : ([['upgrade-insecure-requests']] as [string][])),
  ];
  return diretivas.map((d) => d.join(' ')).join('; ');
}

/** CSP das respostas da API: JSON não carrega nada nem é emoldurado. */
export const POLITICA_DA_API = "default-src 'none'; frame-ancestors 'none'";

/** Nonce novo por requisição (128 bits, base64). */
export function novoNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes));
}

export interface RequisicaoParaOrigem {
  metodo: string;
  caminho: string;
  /** Origem do próprio site, como o servidor a vê (request.nextUrl.origin). */
  origemDoSite: string;
  cabecalhos: { get(nome: string): string | null };
}

/** false quando a requisição deve ser recusada por origem (CSRF). */
export function origemAceita(r: RequisicaoParaOrigem): boolean {
  if (METODOS_SEGUROS.has(r.metodo.toUpperCase())) return true;
  // Authorization não vai sozinho: um site de fora só o manda com CORS, que o
  // web não libera. Quem o usa (PWA, conector, cron) não depende de cookie.
  if (r.cabecalhos.get('authorization')) return true;
  const origem = r.cabecalhos.get('origin');
  if (origem !== null) return origem === r.origemDoSite;
  const site = r.cabecalhos.get('sec-fetch-site');
  if (site !== null) return site === 'same-origin';
  return !r.cabecalhos.get('cookie') && !r.caminho.startsWith('/auth/');
}

/** Cabeçalhos fixos de toda resposta (o next.config.ts os aplica). */
export function cabecalhosFixos(desenvolvimento: boolean): { key: string; value: string }[] {
  return [
    // Dois anos, com subdomínios. Sem preload: entrar na lista dos navegadores
    // é decisão à parte, difícil de desfazer. No dev (http), fica de fora.
    ...(desenvolvimento
      ? []
      : [{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' }]),
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    // Redundante com frame-ancestors, para navegador antigo.
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
    {
      key: 'Permissions-Policy',
      value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
    },
  ];
}
