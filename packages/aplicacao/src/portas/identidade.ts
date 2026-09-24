// Portas de identidade (ADR-001: o Supabase Auth fica atrás de portas, para
// poder ser trocado). Os casos de uso só conhecem estas interfaces.

/** Usuário que o servidor conseguiu provar pelo token — nunca pelo que o cliente disse. */
export interface UsuarioVerificado {
  usuarioId: string;
  email: string | null;
  /**
   * Tenants em que o usuário foi convidado, lidos do token assinado. É só
   * sugestão para a tela de escolha de tenant: quem decide o acesso é o banco
   * (membro ativo), e um tenant daqui sem vínculo vigente não mostra nada.
   */
  tenantsSugeridos: string[];
}

/**
 * Valida um access token e devolve o usuário. Implementação obrigatória:
 * assinatura conferida pelas chaves públicas do provedor (JWKS), emissor e
 * audiência conferidos, expiração respeitada. Token inválido rejeita com
 * TokenInvalido; não existe "usuário anônimo".
 */
export interface VerificadorDeToken {
  verificar(token: string): Promise<UsuarioVerificado>;
}

export class TokenInvalido extends Error {
  constructor(motivo: string) {
    super(`Token inválido: ${motivo}`);
    this.name = 'TokenInvalido';
  }
}

/**
 * Cria (ou reaproveita) a identidade do convidado no provedor e faz o convite
 * chegar a ele. Devolve o id do usuário, que o convite grava em app.membro na
 * mesma requisição (ADR-014).
 *
 * É a porta do envio: no dev, o adaptador usa o e-mail padrão do Supabase
 * (limite baixo de envio); para SMTP próprio, outro adaptador gera o link de
 * convite no provedor e o entrega por um EnviadorDeEmail — sem tocar no caso
 * de uso.
 */
export interface ProvedorDeConvite {
  convidar(pedido: PedidoDeConvite): Promise<{ usuarioId: string }>;
  /**
   * Acrescenta o tenant à lista de sugestão do usuário (tenantsSugeridos).
   * Chamado depois que o membro foi gravado.
   */
  vincularTenant(usuarioId: string, tenantId: string): Promise<void>;
}

export interface PedidoDeConvite {
  email: string;
  /** URL para onde o link do e-mail leva depois de validado (a tela de aceite). */
  redirecionarPara: string;
  /** Dados exibidos no e-mail. */
  nomeConvidado: string;
  nomeTenant: string;
}

/** Envio de e-mail transacional, para o adaptador de convite por SMTP próprio. */
export interface EnviadorDeEmail {
  enviar(mensagem: { para: string; assunto: string; texto: string; html?: string }): Promise<void>;
}
