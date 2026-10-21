// Portas de identidade (ADR-001: o Supabase Auth fica atrás de portas, para
// poder ser trocado). Os casos de uso só conhecem estas interfaces.
import type { NivelDaSessao } from '@hubkeep/dominio';

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
  /**
   * O nível da sessão, do token assinado: aal2 com o segundo fator verificado
   * (SP1, ADR-049). Claim ausente ou desconhecida conta como aal1.
   */
  nivel: NivelDaSessao;
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
 * Identidade do convidado no provedor (ADR-018). NENHUM método daqui envia
 * e-mail: o convite só é enviado depois que o acesso está gravado, pelo worker,
 * a partir do evento membro.convidado (EnvioDeConvite).
 */
export interface ProvedorDeIdentidade {
  /**
   * Cria o usuário, sem e-mail e sem confirmação, ou devolve o id de quem já
   * existe. `criadoAgora` diz se foi esta chamada que criou — só esse pode ser
   * removido na compensação.
   */
  garantirUsuario(pedido: {
    email: string;
    nome: string;
    tenantId: string;
    nomeTenant: string;
  }): Promise<{ usuarioId: string; criadoAgora: boolean }>;
  /** Compensação: remove o usuário criado nesta requisição, se a gravação do acesso falhou. */
  removerUsuario(usuarioId: string): Promise<void>;
  /** Acrescenta o tenant à lista de sugestão do usuário (idempotente). */
  vincularTenant(usuarioId: string, tenantId: string): Promise<void>;
}

/**
 * Envio do e-mail de convite — a porta que troca o e-mail padrão do Supabase
 * (dev, limite baixo) por SMTP próprio sem retrabalho. Chamada pelo worker.
 */
export interface EnvioDeConvite {
  enviarConvite(convite: PedidoDeConvite): Promise<{ enviado: boolean; motivo?: string }>;
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

/**
 * Administração do segundo fator (SP1, ADR-049 e adendo ao ADR-024): remove
 * os fatores de um usuário que perdeu o aparelho, para ele cadastrar de novo.
 * Chamada só depois de a aplicação conferir quem pede (Admin do grupo, em
 * aal2) e que o alvo é membro do tenant dele, pela RLS no hk_app.
 */
export interface AdministracaoDoSegundoFator {
  /** Remove todos os fatores do usuário e devolve quantos; o Auth encerra as sessões dele. */
  removerFatores(usuarioId: string): Promise<number>;
}
