// Proxy do Next 16 (antigo middleware): mantém a sessão do Supabase viva,
// renovando o access token pelo refresh token quando está para vencer, e
// devolvendo os cookies novos. Não autoriza nada — autorização é dos handlers
// (token verificado + contexto) e da RLS.
import { createServerClient } from '@supabase/ssr';
import { type NextRequest, NextResponse } from 'next/server';

export async function proxy(request: NextRequest) {
  let resposta = NextResponse.next({ request });
  const url = process.env['NEXT_PUBLIC_SUPABASE_URL'];
  const chave = process.env['NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'];
  if (!url || !chave) return resposta;

  const supabase = createServerClient(url, chave, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (lista) => {
        for (const { name, value } of lista) request.cookies.set(name, value);
        resposta = NextResponse.next({ request });
        for (const { name, value, options } of lista) resposta.cookies.set(name, value, options);
      },
    },
  });
  // getUser() consulta o Auth e dispara a renovação se preciso. O resultado não
  // é usado para autorizar: os handlers verificam o token pelo JWKS.
  await supabase.auth.getUser();
  return resposta;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
