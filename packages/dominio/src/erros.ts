// Erros de domínio. Cada um carrega um código estável (para a API mapear em
// HTTP e o front traduzir) e uma mensagem clara para quem pediu a ação.

export abstract class ErroDeDominio extends Error {
  abstract readonly codigo: string;
}

/** Quem pediu não tem permissão para esta ação (vira 403). */
export class PermissaoNegada extends ErroDeDominio {
  readonly codigo = 'sem_permissao';
  constructor(mensagem: string) {
    super(mensagem);
    this.name = 'PermissaoNegada';
  }
}

/** A ação é permitida para quem pediu, mas o pedido viola uma regra (vira 422). */
export class RegraViolada extends ErroDeDominio {
  constructor(
    readonly codigo: string,
    mensagem: string,
  ) {
    super(mensagem);
    this.name = 'RegraViolada';
  }
}

/** O alvo da ação não existe ou não é visível para quem pediu (vira 404). */
export class NaoEncontrado extends ErroDeDominio {
  readonly codigo = 'nao_encontrado';
  constructor(mensagem: string) {
    super(mensagem);
    this.name = 'NaoEncontrado';
  }
}

/** O pedido colide com o estado atual (vira 409) — ex.: convidar quem já é membro. */
export class Conflito extends ErroDeDominio {
  constructor(
    readonly codigo: string,
    mensagem: string,
  ) {
    super(mensagem);
    this.name = 'Conflito';
  }
}
