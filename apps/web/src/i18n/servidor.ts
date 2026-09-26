// Idioma da tela, decidido no servidor a cada requisição (ADR-022):
//   1. cookie hk_idioma — gravado pela tela inicial com o idioma resolvido do
//      membro (GET /api/v1/preferencias) ou pelo seletor antes do login;
//   2. Accept-Language do navegador;
//   3. pt-BR.
// O cookie só escolhe entre idiomas da lista: não autoriza nada e não vem do
// banco. O pseudo-idioma só vale com HK_PSEUDO_IDIOMA=1 (dev e homologação).
import {
  IDIOMA_FONTE,
  type IdiomaDeExibicao,
  PSEUDO_IDIOMA,
  ehIdioma,
  idiomaDoNavegador,
} from '@hubkeep/i18n';
import { cookies, headers } from 'next/headers';

export const COOKIE_IDIOMA = 'hk_idioma';

export const pseudoIdiomaLiberado = () => process.env['HK_PSEUDO_IDIOMA'] === '1';

export function escolherIdioma(
  cookie: string | undefined,
  acceptLanguage: string | null,
  pseudoLiberado: boolean,
): IdiomaDeExibicao {
  if (ehIdioma(cookie)) return cookie;
  if (cookie === PSEUDO_IDIOMA && pseudoLiberado) return PSEUDO_IDIOMA;
  return idiomaDoNavegador(acceptLanguage) ?? IDIOMA_FONTE;
}

export async function idiomaDaRequisicao(): Promise<IdiomaDeExibicao> {
  const [c, h] = await Promise.all([cookies(), headers()]);
  return escolherIdioma(
    c.get(COOKIE_IDIOMA)?.value,
    h.get('accept-language'),
    pseudoIdiomaLiberado(),
  );
}
