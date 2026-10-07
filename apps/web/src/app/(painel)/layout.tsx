import { cookies } from 'next/headers';
import type { ReactNode } from 'react';
import { Moldura } from '../../cliente/moldura';
import { COOKIE_TEMA, temaDoCookie } from '../../tema';

// Telas autenticadas: todas dentro da moldura (menu lateral e barra superior).
// O grupo de rotas (painel) não entra na URL.
export default async function LayoutDoPainel({ children }: { children: ReactNode }) {
  const tema = temaDoCookie((await cookies()).get(COOKIE_TEMA)?.value);
  return <Moldura temaInicial={tema}>{children}</Moldura>;
}
