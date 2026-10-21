// CSP do PWA do técnico (SP2, P5 do docs/09; condição 4 do ADR-032).
//
//   - a parte de script é fixa e vai no cabeçalho do vercel.json: script e
//     service worker só da própria origem, sem 'unsafe-inline' nem
//     'unsafe-eval' (o Vite não gera script inline, e o Zod roda sem JIT:
//     @hubkeep/contratos/sem-eval, o primeiro import do src/main.tsx);
//   - a de conexão depende do ambiente (a API e o Supabase do build, em
//     VITE_API_URL e VITE_SUPABASE_URL) e vai num <meta> que o build põe no
//     HTML. As duas políticas valem juntas: o navegador aplica as duas.
//
// O vite.config.ts usa este arquivo no Node; ele não importa nada do app.

/** A origem de uma URL do build: https, ou http só no próprio aparelho. */
export function origemDoBuild(nome: string, url: string): string {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new Error(`${nome} não é uma URL: ${url}`);
  }
  const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1';
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && local)) {
    throw new Error(`${nome} precisa ser https: ${url}`);
  }
  return u.origin;
}

/** O connect-src do build: a própria origem, a da API e a do Supabase, sem repetir. */
export function politicaDeConexao(env: {
  VITE_API_URL?: string | undefined;
  VITE_SUPABASE_URL?: string | undefined;
}): string {
  const origens = new Set(["'self'"]);
  if (env.VITE_API_URL) origens.add(origemDoBuild('VITE_API_URL', env.VITE_API_URL));
  if (env.VITE_SUPABASE_URL) {
    origens.add(origemDoBuild('VITE_SUPABASE_URL', env.VITE_SUPABASE_URL));
  }
  return `connect-src ${[...origens].join(' ')}`;
}
