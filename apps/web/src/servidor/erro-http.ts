// Erro da camada HTTP (autenticação, tenant, entrada). Como os de domínio, só
// código e parâmetros: a tela traduz (ADR-022). Fica fora de http.ts para o
// contexto.ts poder usá-lo sem import circular.
import type { Parametros } from '@hubkeep/dominio';

export class ErroHttp extends Error {
  readonly status: number;
  readonly codigo: string;
  readonly parametros: Parametros;
  constructor(status: number, codigo: string, parametros: Parametros = {}) {
    super(codigo);
    this.status = status;
    this.codigo = codigo;
    this.parametros = parametros;
    this.name = 'ErroHttp';
  }
}
