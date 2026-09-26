// Erros de domínio. Cada um carrega um código estável e os parâmetros que a
// tela precisa para montar a frase no idioma de quem lê (ADR-022): a API
// devolve só código e parâmetros. A mensagem em pt-BR é para log e para quem
// lê o código; nunca chega à tela.

/** Valores que a tela interpola na mensagem traduzida (ICU). */
export type Parametros = Readonly<Record<string, string | number | boolean | null>>;

export abstract class ErroDeDominio extends Error {
  abstract readonly codigo: string;
  readonly parametros: Parametros;
  constructor(mensagem: string, parametros: Parametros = {}) {
    super(mensagem);
    this.parametros = parametros;
  }
}

/** Quem pediu não tem permissão para esta ação (vira 403). */
export class PermissaoNegada extends ErroDeDominio {
  readonly codigo: string;
  constructor(codigo: string, mensagem: string, parametros?: Parametros) {
    super(mensagem, parametros);
    this.codigo = codigo;
    this.name = 'PermissaoNegada';
  }
}

/** A ação é permitida para quem pediu, mas o pedido viola uma regra (vira 422). */
export class RegraViolada extends ErroDeDominio {
  readonly codigo: string;
  constructor(codigo: string, mensagem: string, parametros?: Parametros) {
    super(mensagem, parametros);
    this.codigo = codigo;
    this.name = 'RegraViolada';
  }
}

/** O alvo da ação não existe ou não é visível para quem pediu (vira 404). */
export class NaoEncontrado extends ErroDeDominio {
  readonly codigo: string;
  constructor(codigo: string, mensagem: string, parametros?: Parametros) {
    super(mensagem, parametros);
    this.codigo = codigo;
    this.name = 'NaoEncontrado';
  }
}

/** O pedido colide com o estado atual (vira 409) — ex.: convidar quem já é membro. */
export class Conflito extends ErroDeDominio {
  readonly codigo: string;
  constructor(codigo: string, mensagem: string, parametros?: Parametros) {
    super(mensagem, parametros);
    this.codigo = codigo;
    this.name = 'Conflito';
  }
}
