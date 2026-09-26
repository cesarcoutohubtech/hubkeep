// Idioma da tela, decidido no servidor a cada requisição (ADR-022):
//
//   com sessão e tenant  o perfil decide: membro → tenant, pela mesma
//                        resolução de GET /api/v1/preferencias. O cookie
//                        hk_idioma não passa por cima do perfil.
//   sem sessão           cookie hk_idioma (escolha no seletor do login) →
//                        Accept-Language → pt-BR.
//
// O cookie só escolhe entre idiomas da lista: não autoriza nada. O
// pseudo-idioma só existe com HK_PSEUDO_IDIOMA=1 e fora de produção
// (VERCEL_ENV=production o desliga mesmo com a variável ligada).
import {
  IDIOMA_FONTE,
  type Idioma,
  type IdiomaDeExibicao,
  PSEUDO_IDIOMA,
  ehIdioma,
  idiomaDoNavegador,
} from '@hubkeep/i18n';
import { cookies, headers } from 'next/headers';
import { cache } from 'react';
import { casosDeUsoDePreferencias } from '../servidor/composicao';
import { resolverContexto } from '../servidor/contexto';
import { ErroHttp } from '../servidor/erro-http';
import { registrarNoConsole } from '../servidor/log';

export const COOKIE_IDIOMA = 'hk_idioma';

export const pseudoIdiomaLiberado = (env: Record<string, string | undefined> = process.env) =>
  env['HK_PSEUDO_IDIOMA'] === '1' && env['VERCEL_ENV'] !== 'production';

export interface EntradaDoIdioma {
  /** Idioma resolvido pelo perfil (membro → tenant); null sem sessão ou sem tenant. */
  perfil: Idioma | null;
  cookie: string | undefined;
  acceptLanguage: string | null;
  pseudoLiberado: boolean;
}

export function escolherIdioma(e: EntradaDoIdioma): IdiomaDeExibicao {
  // Em dev, o pseudo-idioma escolhido no seletor vale por cima de tudo: é
  // ferramenta de teste de tela, nunca é gravado no perfil.
  if (e.cookie === PSEUDO_IDIOMA && e.pseudoLiberado) return PSEUDO_IDIOMA;
  if (e.perfil) return e.perfil;
  if (ehIdioma(e.cookie)) return e.cookie;
  return idiomaDoNavegador(e.acceptLanguage) ?? IDIOMA_FONTE;
}

/** Idioma do perfil, se a requisição tem sessão válida e tenant; senão null. */
async function idiomaDoPerfil(h: Headers, acceptLanguage: string | null): Promise<Idioma | null> {
  const req = new Request('http://hubkeep.interno/', { headers: h });
  try {
    const ctx = await resolverContexto(req);
    return (await (await casosDeUsoDePreferencias()).lerPreferencias(ctx, acceptLanguage)).idioma;
  } catch (e) {
    // Sem sessão ou sem tenant: tela antes do login ou escolha de grupo.
    if (e instanceof ErroHttp) return null;
    // Banco ou Auth fora: a tela sai no idioma sem perfil, e o erro fica no log.
    registrarNoConsole('warn', 'idioma.perfil_indisponivel', {
      erro: e instanceof Error ? e.name : 'desconhecido',
    });
    return null;
  }
}

/** Uma leitura do perfil por requisição (o layout e o generateMetadata pedem os dois). */
export const idiomaDaRequisicao = cache(async (): Promise<IdiomaDeExibicao> => {
  const [c, h] = await Promise.all([cookies(), headers()]);
  const acceptLanguage = h.get('accept-language');
  return escolherIdioma({
    perfil: await idiomaDoPerfil(new Headers(h), acceptLanguage),
    cookie: c.get(COOKIE_IDIOMA)?.value,
    acceptLanguage,
    pseudoLiberado: pseudoIdiomaLiberado(),
  });
});
