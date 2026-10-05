// O deploy de preview nunca aponta para o banco de produção ("Nunca faça" do
// CLAUDE.md; M2 do docs/11). A regra existia só em documento: uma variável da
// Vercel marcada para todos os ambientes poria o preview no banco de produção
// sem alarme. Aqui a inicialização falha fechada.
//
//   - fora do preview (produção, development, CI, máquina), nada é conferido;
//   - no preview, HK_REF_PRODUCAO (o project ref do Supabase de produção) é
//     obrigatória: sem ela o preview não tem como provar que não é produção;
//   - a string de conexão precisa dizer de que projeto é (usuário do Supavisor
//     `<papel>.<ref>` ou host `db.<ref>.supabase.co`), e esse projeto não pode
//     ser o de produção.
//
// O erro nunca carrega a string de conexão, que tem a senha.

const REF = /^[a-z0-9]{20}$/;

/** O project ref do Supabase numa string de conexão, ou null se ela não disser. */
export function refDaConexao(url: string): string | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const refs = new Set<string>();
  const usuario = decodeURIComponent(u.username);
  const doUsuario = usuario.includes('.') ? usuario.slice(usuario.lastIndexOf('.') + 1) : '';
  if (REF.test(doUsuario)) refs.add(doUsuario);
  // O `?host=` (aceito pelo pg) substitui o host da URL; os dois contam.
  for (const host of [u.hostname, ...u.searchParams.getAll('host')]) {
    const m = /^db\.([a-z0-9]{20})\.supabase\.co$/.exec(host);
    if (m?.[1]) refs.add(m[1]);
  }
  // Dois projetos na mesma string não provam nada.
  return refs.size === 1 ? ([...refs][0] ?? null) : null;
}

export interface AlvoDoBanco {
  /** VERCEL_ENV: production, preview ou development; vazia fora da Vercel. */
  vercelEnv: string | undefined;
  /** HK_REF_PRODUCAO: o project ref do Supabase de produção. */
  refProducao: string | undefined;
  /** Nome da variável da conexão, para a mensagem (nunca o valor). */
  nome: string;
  url: string;
}

export function conferirAlvoDoBanco(a: AlvoDoBanco): void {
  if (a.vercelEnv !== 'preview') return;
  if (!a.refProducao || !REF.test(a.refProducao)) {
    throw new Error(
      'Preview sem HK_REF_PRODUCAO válida: sem o project ref de produção, o preview não ' +
        'prova que não aponta para o banco de produção. Nada foi conectado.',
    );
  }
  const ref = refDaConexao(a.url);
  if (!ref) {
    throw new Error(
      `Preview com ${a.nome} sem project ref identificável (usuário <papel>.<ref> ou host ` +
        'db.<ref>.supabase.co): não dá para provar que não é o banco de produção. Nada foi conectado.',
    );
  }
  if (ref === a.refProducao) {
    throw new Error(
      `Preview com ${a.nome} apontando para o banco de produção. O preview usa só o ` +
        'Supabase de staging (F0-12). Nada foi conectado.',
    );
  }
}
