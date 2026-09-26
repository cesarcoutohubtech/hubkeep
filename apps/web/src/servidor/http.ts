// Invólucro das rotas da API (F0-07). Cada rota ganha:
//   - request_id: o x-request-id recebido, se for um UUID, ou um novo; volta no
//     cabeçalho da resposta, no corpo do erro e em toda linha de log;
//   - contexto e usuário resolvidos por aqui, para o log saber tenant e usuário;
//   - entrada e saída validadas pelos contratos (packages/contratos);
//   - formato único de erro: { erro: { codigo, parametros, requestId } }, sem
//     frase (ADR-022); a frase do domínio fica só no log;
//   - uma linha de log por requisição e, em erro inesperado, o Sentry.
import { CODIGOS_HTTP, problemasDe, z } from '@hubkeep/contratos';
import type { UsuarioVerificado } from '@hubkeep/aplicacao';
import type { Contexto } from '@hubkeep/db';
import {
  Conflito,
  ErroDeDominio,
  NaoEncontrado,
  type Parametros,
  PermissaoNegada,
} from '@hubkeep/dominio';
import { resolverContexto, usuarioDaRequisicao } from './contexto';
import { ErroHttp } from './erro-http';
import { type Registrador, registrarNoConsole } from './log';
import { type Relator, relatarAoSentry } from './sentry';

export { ErroHttp } from './erro-http';

export const CABECALHO_REQUEST_ID = 'x-request-id';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface Dependencias {
  resolverContexto: (req: Request) => Promise<Contexto>;
  usuarioDaRequisicao: (req: Request) => Promise<UsuarioVerificado>;
  registrar: Registrador;
  relatar: Relator;
}

const PADRAO: Dependencias = {
  resolverContexto,
  usuarioDaRequisicao,
  registrar: registrarNoConsole,
  relatar: relatarAoSentry,
};

export interface Requisicao {
  req: Request;
  requestId: string;
  /** Usuário (token verificado) e tenant ativo. */
  contexto(): Promise<Contexto>;
  /** Só o usuário, para rota que não depende de tenant. */
  usuario(): Promise<UsuarioVerificado>;
  /** Corpo JSON validado pelo contrato; inválido vira 422 entrada_invalida. */
  corpo<T extends z.ZodType>(contrato: T): Promise<z.output<T>>;
  /** Resposta validada pelo contrato: o que sai é o que o OpenAPI promete. */
  responder<T extends z.ZodType>(status: number, contrato: T, dados: z.input<T>): Response;
  /** Resposta sem contrato (ex.: o próprio OpenAPI). */
  json(status: number, dados: unknown): Response;
}

interface Falha {
  status: number;
  codigo: string;
  parametros: Parametros | Record<string, unknown>;
  inesperada: boolean;
}

function falhaDe(e: unknown): Falha {
  if (e instanceof ErroHttp) {
    return { status: e.status, codigo: e.codigo, parametros: e.parametros, inesperada: false };
  }
  if (e instanceof ErroDeDominio) {
    const status =
      e instanceof PermissaoNegada
        ? 403
        : e instanceof NaoEncontrado
          ? 404
          : e instanceof Conflito
            ? 409
            : 422;
    return { status, codigo: e.codigo, parametros: e.parametros, inesperada: false };
  }
  const codigoPg = (e as { code?: unknown }).code;
  // 42501: a RLS recusou a escrita — é permissão, não defeito.
  if (codigoPg === '42501') {
    return { status: 403, codigo: CODIGOS_HTTP.semPermissao, parametros: {}, inesperada: false };
  }
  // 23503/23514: referência de outro escopo ou combinação que a integridade recusa.
  if (codigoPg === '23503' || codigoPg === '23514') {
    return { status: 422, codigo: CODIGOS_HTTP.integridade, parametros: {}, inesperada: false };
  }
  return { status: 500, codigo: CODIGOS_HTTP.erroInterno, parametros: {}, inesperada: true };
}

const comRequestId = (resposta: Response, requestId: string) => {
  resposta.headers.set(CABECALHO_REQUEST_ID, requestId);
  return resposta;
};

/**
 * Envolve o handler de uma rota. `nome` identifica a rota nos logs e no Sentry
 * (ex.: 'convites.criar'). `deps` só é passado nos testes.
 */
export function rota(
  nome: string,
  fn: (r: Requisicao) => Promise<Response>,
  deps: Partial<Dependencias> = {},
): (req: Request) => Promise<Response> {
  const d: Dependencias = { ...PADRAO, ...deps };
  return async (req) => {
    const inicio = performance.now();
    const recebido = req.headers.get(CABECALHO_REQUEST_ID);
    const requestId = recebido && UUID.test(recebido) ? recebido : crypto.randomUUID();
    const escopo: { tenant_id: string | null; usuario_id: string | null } = {
      tenant_id: null,
      usuario_id: null,
    };

    const r: Requisicao = {
      req,
      requestId,
      async contexto() {
        const ctx = await d.resolverContexto(req);
        escopo.tenant_id = ctx.tenantId;
        escopo.usuario_id = ctx.usuarioId;
        return ctx;
      },
      async usuario() {
        const u = await d.usuarioDaRequisicao(req);
        escopo.usuario_id = u.usuarioId;
        return u;
      },
      async corpo(contrato) {
        const bruto: unknown = await req.json().catch(() => undefined);
        if (bruto === undefined) {
          throw new ErroHttp(422, CODIGOS_HTTP.entradaInvalida, { motivo: 'json_invalido' });
        }
        const lido = contrato.safeParse(bruto);
        if (!lido.success) {
          throw new ErroDeEntrada(problemasDe(lido.error));
        }
        return lido.data;
      },
      responder(status, contrato, dados) {
        return Response.json(contrato.parse(dados), { status });
      },
      json(status, dados) {
        return Response.json(dados, { status });
      },
    };

    let resposta: Response;
    let falha: Falha | null = null;
    try {
      resposta = await fn(r);
    } catch (e) {
      falha =
        e instanceof ErroDeEntrada
          ? {
              status: 422,
              codigo: CODIGOS_HTTP.entradaInvalida,
              parametros: { problemas: e.problemas },
              inesperada: false,
            }
          : falhaDe(e);
      if (falha.inesperada) {
        d.relatar(e, { rota: nome, request_id: requestId, ...escopo });
        d.registrar('error', 'erro_inesperado', {
          rota: nome,
          request_id: requestId,
          ...escopo,
          erro: e instanceof Error ? { nome: e.name, mensagem: e.message } : String(e),
        });
      }
      resposta = Response.json(
        { erro: { codigo: falha.codigo, parametros: falha.parametros, requestId } },
        { status: falha.status },
      );
    }

    d.registrar(falha?.inesperada ? 'error' : 'info', 'http', {
      rota: nome,
      metodo: req.method,
      status: resposta.status,
      duracao_ms: Math.round(performance.now() - inicio),
      request_id: requestId,
      ...escopo,
      ...(falha && { codigo: falha.codigo }),
    });
    return comRequestId(resposta, requestId);
  };
}

/** Entrada que não passou no contrato; vira 422 com os problemas por campo. */
class ErroDeEntrada extends Error {
  readonly problemas: ReturnType<typeof problemasDe>;
  constructor(problemas: ReturnType<typeof problemasDe>) {
    super(CODIGOS_HTTP.entradaInvalida);
    this.problemas = problemas;
    this.name = 'ErroDeEntrada';
  }
}
