// Invólucro das rotas da API (F0-07). Cada rota ganha:
//   - request_id: o x-request-id recebido, se for um UUID, ou um novo; volta no
//     cabeçalho da resposta, no corpo do erro e em toda linha de log;
//   - contexto e usuário resolvidos por aqui, para o log saber tenant e usuário;
//   - entrada e saída validadas pelos contratos (packages/contratos);
//   - formato único de erro: { erro: { codigo, parametros, requestId } }, sem
//     frase (ADR-022); a frase do domínio fica só no log;
//   - uma linha de log por requisição e, em erro inesperado, o Sentry.
import { CODIGOS_HTTP, LIMITE_BYTES_PADRAO, problemasDe, z } from '@hubkeep/contratos';
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
  /**
   * Corpo JSON validado pelo contrato; inválido vira 422 entrada_invalida.
   * Corpo acima do limite vira 413 corpo_grande: `limiteBytes` ou, sem ele,
   * LIMITE_BYTES_PADRAO (ADR-032). Conferido no content-length e no que é lido,
   * que o cliente pode omitir o cabeçalho; a leitura para ao passar do limite.
   */
  corpo<T extends z.ZodType>(contrato: T, opcoes?: { limiteBytes?: number }): Promise<z.output<T>>;
  /** Tenant de quem não é usuário (ex.: o agente, pelo prefixo da credencial), para o log. */
  marcarTenant(tenantId: string): void;
  /**
   * Erro que a rota tratou sem falhar (ex.: um tenant do cron): vai para o log
   * e para o Sentry com o request_id, e a rota segue.
   */
  registrarErro(erro: unknown, campos: { tenant_id?: string | null }): void;
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
      async corpo(contrato, opcoes = {}) {
        const textoBruto = await lerTexto(req, opcoes.limiteBytes ?? LIMITE_BYTES_PADRAO);
        let bruto: unknown;
        try {
          bruto = JSON.parse(textoBruto);
        } catch {
          throw new ErroHttp(422, CODIGOS_HTTP.entradaInvalida, { motivo: 'json_invalido' });
        }
        const lido = contrato.safeParse(bruto);
        if (!lido.success) {
          throw new ErroDeEntrada(problemasDe(lido.error));
        }
        return lido.data;
      },
      marcarTenant(tenantId) {
        escopo.tenant_id = tenantId;
      },
      registrarErro(erro, campos) {
        const marcas = { rota: nome, request_id: requestId, ...escopo, ...campos };
        d.relatar(erro, marcas);
        d.registrar('error', 'erro_tratado', {
          ...marcas,
          erro: erro instanceof Error ? { nome: erro.name, mensagem: erro.message } : String(erro),
        });
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

const corpoGrande = (limite: number) =>
  new ErroHttp(413, CODIGOS_HTTP.corpoGrande, { limiteBytes: limite });

/**
 * Lê o corpo como texto até `limite` bytes. Passou, cancela a leitura e lança
 * 413: o resto do envio não chega à memória. Falha de leitura vira texto vazio
 * (e 422 json_invalido adiante), como antes.
 */
async function lerTexto(req: Request, limite: number): Promise<string> {
  if (Number(req.headers.get('content-length') ?? 0) > limite) throw corpoGrande(limite);
  if (!req.body) return '';
  const leitor = req.body.getReader();
  const decodificador = new TextDecoder();
  let texto = '';
  let lidos = 0;
  try {
    for (;;) {
      const { done, value } = await leitor.read();
      if (done) break;
      lidos += value.byteLength;
      if (lidos > limite) {
        await leitor.cancel().catch(() => {});
        throw corpoGrande(limite);
      }
      texto += decodificador.decode(value, { stream: true });
    }
  } catch (e) {
    if (e instanceof ErroHttp) throw e;
    return '';
  }
  return texto + decodificador.decode();
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
