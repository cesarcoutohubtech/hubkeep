// Respostas HTTP da API. O formato único de erro, com request_id e log
// estruturado, é da F0-07; aqui fica o mínimo para os handlers da F0-05.

import { ErroDeDominio, NaoEncontrado, PermissaoNegada } from '@hubkeep/dominio';

export class ErroHttp extends Error {
  constructor(
    readonly status: number,
    readonly codigo: string,
    mensagem: string,
  ) {
    super(mensagem);
    this.name = 'ErroHttp';
  }
}

export const json = (status: number, corpo: unknown) => Response.json(corpo, { status });

/** Envolve um handler: ErroHttp vira resposta; qualquer outra coisa vira 500 sem detalhe. */
export function handler(fn: (req: Request) => Promise<Response>) {
  return async (req: Request): Promise<Response> => {
    try {
      return await fn(req);
    } catch (e) {
      if (e instanceof ErroHttp) {
        return json(e.status, { erro: { codigo: e.codigo, mensagem: e.message } });
      }
      if (e instanceof ErroDeDominio) {
        const status = e instanceof PermissaoNegada ? 403 : e instanceof NaoEncontrado ? 404 : 422;
        return json(status, { erro: { codigo: e.codigo, mensagem: e.message } });
      }
      const codigo = (e as { code?: string }).code;
      // 42501: a RLS recusou a escrita — é permissão, não defeito.
      if (codigo === '42501') {
        return json(403, {
          erro: { codigo: 'sem_permissao', mensagem: 'Operação não permitida.' },
        });
      }
      // 23503/23514: referência de outro escopo ou combinação que a integridade recusa.
      if (codigo === '23503' || codigo === '23514') {
        return json(422, {
          erro: { codigo: 'entrada_invalida', mensagem: 'Combinação recusada pela integridade.' },
        });
      }
      console.error(e);
      return json(500, { erro: { codigo: 'erro_interno', mensagem: 'Erro interno.' } });
    }
  };
}
