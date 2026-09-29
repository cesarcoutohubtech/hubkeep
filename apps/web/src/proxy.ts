// Proxy do Next 16 (antigo middleware), em toda requisição que não é estático:
//
//   1. recusa por origem (CSRF) a requisição que muda estado com cookie e vem
//      de outro site (seguranca.ts, S1), e o corpo declarado acima do teto
//      (ADR-032);
//   2. mantém a sessão do Supabase viva, renovando o access token pelo refresh
//      token quando está para vencer e devolvendo os cookies novos, HttpOnly
//      (servidor/sessao-supabase.ts). Não autoriza nada: autorização é dos
//      handlers (token verificado + contexto) e da RLS;
//   3. põe a CSP com nonce na requisição (o Next aplica o nonce aos scripts
//      dele) e na resposta; na API, a política fechada e Cache-Control
//      no-store. Os demais cabeçalhos fixos vêm do next.config.ts.
import { CODIGOS_HTTP, LIMITE_BYTES_MAXIMO } from '@hubkeep/contratos';
import { type NextRequest, NextResponse } from 'next/server';
import {
  POLITICA_DA_API,
  corpoAcimaDoTeto,
  novoNonce,
  origemAceita,
  politicaDeConteudo,
} from './seguranca';
import { registrarNoConsole } from './servidor/log';
import { type CookieParaGravar, clienteDeSessao } from './servidor/sessao-supabase';

const CSP = 'content-security-policy';

export async function proxy(request: NextRequest) {
  const caminho = request.nextUrl.pathname;
  if (
    !origemAceita({
      metodo: request.method,
      caminho,
      origemDoSite: request.nextUrl.origin,
      cabecalhos: request.headers,
    })
  ) {
    const requestId = crypto.randomUUID();
    // Evento de segurança: muitos destes seguidos pedem olhar (docs/09).
    registrarNoConsole('warn', 'origem_recusada', {
      request_id: requestId,
      metodo: request.method,
      rota: caminho,
      origem: request.headers.get('origin'),
      status: 403,
    });
    return recusa(403, CODIGOS_HTTP.origemRecusada, {}, requestId);
  }
  if (corpoAcimaDoTeto(request.headers, LIMITE_BYTES_MAXIMO)) {
    const requestId = crypto.randomUUID();
    registrarNoConsole('warn', 'corpo_grande', {
      request_id: requestId,
      metodo: request.method,
      rota: caminho,
      status: 413,
    });
    return recusa(413, CODIGOS_HTTP.corpoGrande, { limiteBytes: LIMITE_BYTES_MAXIMO }, requestId);
  }

  const gravados: CookieParaGravar[] = [];
  const url = process.env['NEXT_PUBLIC_SUPABASE_URL'];
  const chave = process.env['NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'];
  if (url && chave) {
    const supabase = clienteDeSessao(url, chave, request, gravados);
    // getUser() consulta o Auth e dispara a renovação se preciso. O resultado
    // não é usado para autorizar: os handlers verificam o token pelo JWKS.
    await supabase.auth.getUser();
    // Os handlers desta mesma requisição leem o cookie já renovado.
    for (const { name, value } of gravados) request.cookies.set(name, value);
  }

  const ehApi = caminho.startsWith('/api/');
  const politica = ehApi
    ? POLITICA_DA_API
    : politicaDeConteudo({
        nonce: novoNonce(),
        urlSupabase: url,
        desenvolvimento: process.env['NODE_ENV'] === 'development',
      });
  const cabecalhos = new Headers(request.headers);
  cabecalhos.set(CSP, politica);
  const resposta = NextResponse.next({ request: { headers: cabecalhos } });
  for (const { name, value, options } of gravados) resposta.cookies.set(name, value, options);
  resposta.headers.set(CSP, politica);
  // Resposta da API é dado de um usuário e tenant: nenhum cache a guarda.
  if (ehApi) resposta.headers.set('cache-control', 'no-store');
  return resposta;
}

function recusa(
  status: number,
  codigo: string,
  parametros: Record<string, unknown>,
  requestId: string,
) {
  return NextResponse.json(
    { erro: { codigo, parametros, requestId } },
    { status, headers: { [CSP]: POLITICA_DA_API, 'cache-control': 'no-store' } },
  );
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
