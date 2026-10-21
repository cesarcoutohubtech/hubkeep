// Contratos de entrada e saída da API /api/v1. A validação acontece no handler
// (entrada) e antes da resposta (saída); o OpenAPI é gerado destes schemas.
//
// Identificadores usam z.guid() (qualquer UUID no formato 8-4-4-4-12): o banco
// aceita todas as versões, e a checagem de existência e de escopo é da RLS.
import { z } from 'zod';

/**
 * Papéis aceitos pela API. Repete a lista do domínio porque contratos não
 * depende de dominio (o conector só conhece contratos); tests/contratos-dominio
 * falha se as duas divergirem.
 */
export const PAPEIS_API = [
  'admin_grupo',
  'gestor_csc',
  'implantador',
  'gerente_hotel',
  'tecnico',
  'solicitante',
  'proprietario',
] as const;

export const STATUS_HOTEL_API = ['em_implantacao', 'ativo', 'desativado'] as const;

/** Modelo contratual do hotel (I2); os mesmos de MODELOS_CONTRATUAIS do domínio. */
export const MODELOS_CONTRATUAIS_API = [
  'proprio',
  'administrado',
  'arrendado',
  'afiliado',
] as const;

// ---------------------------------------------------------------------------
// POST /api/v1/convites
// ---------------------------------------------------------------------------
export const PedidoDeConvite = z
  .object({
    // Normalizado (sem espaços, minúsculo) antes de validar o formato.
    email: z.string().trim().toLowerCase().max(320).pipe(z.email()).meta({ format: 'email' }),
    nome: z.string().trim().min(1).max(200),
    papel: z.enum(PAPEIS_API),
    /** Sem hotel, o papel vale para o grupo inteiro. */
    hotelId: z.guid().nullish(),
    /** Só com o papel proprietario: o escopo é o do proprietário (A4). */
    proprietarioId: z.guid().nullish(),
    /** Obrigatória para o Implantador (regra do domínio). */
    validoAte: z.iso.datetime({ offset: true }).nullish(),
  })
  .meta({ id: 'PedidoDeConvite' });
export type PedidoDeConvite = z.infer<typeof PedidoDeConvite>;

export const RespostaDeConvite = z
  .object({ usuarioId: z.guid() })
  .meta({ id: 'RespostaDeConvite' });

// ---------------------------------------------------------------------------
// GET /api/v1/hoteis
// ---------------------------------------------------------------------------
export const HotelVisivel = z
  .object({
    id: z.guid(),
    nome: z.string(),
    status: z.enum(STATUS_HOTEL_API),
    bandeiraId: z.guid().nullable(),
  })
  .meta({ id: 'HotelVisivel' });

export const RespostaDeHoteis = z
  .object({ hoteis: z.array(HotelVisivel) })
  .meta({ id: 'RespostaDeHoteis' });

// ---------------------------------------------------------------------------
// GET /api/v1/sessao
// ---------------------------------------------------------------------------
export const RespostaDeSessao = z
  .object({
    usuarioId: z.guid(),
    email: z.string().nullable(),
    /** Sugestão para a tela de escolha de tenant; quem decide o acesso é o banco. */
    tenants: z.array(z.guid()),
  })
  .meta({ id: 'RespostaDeSessao' });

// ---------------------------------------------------------------------------
// /auth/sessao e /auth/senha (S1, ADR-032): fora da /api/v1, sem OpenAPI.
// ---------------------------------------------------------------------------
/** Tokens que o login no navegador obteve do Auth; o servidor os guarda em cookie HttpOnly. */
export const PedidoDeSessao = z.object({
  accessToken: z.string().min(1).max(8192),
  refreshToken: z.string().min(1).max(1024),
});

/** Senha nova. O Auth aplica a política dele; aqui, só os limites (bcrypt usa 72 bytes). */
export const LIMITE_MINIMO_DA_SENHA = 8;
export const PedidoDeSenha = z.object({
  senha: z.string().min(LIMITE_MINIMO_DA_SENHA).max(72),
});

/**
 * "Minha conta → Segurança" (SP1, ADR-049): os fatores do próprio usuário,
 * pelas rotas /auth/segundo-fator, com a sessão do cookie.
 */
export const RespostaDeFatores = z.object({
  /** Algum papel do usuário exige o segundo fator. */
  exigido: z.boolean(),
  fatores: z.array(
    z.object({ id: z.guid(), nome: z.string().nullable(), criadoEm: z.iso.datetime() }),
  ),
});

export const PedidoDeCadastroDeFator = z.object({
  /** O nome do aparelho, para a lista; vazio fica sem nome. */
  nome: z.string().trim().max(60).optional(),
});

export const RespostaDeCadastroDeFator = z.object({
  fatorId: z.guid(),
  /** O QR do cadastro, como data: (SVG). */
  qr: z.string().startsWith('data:image/svg+xml'),
  segredo: z.string().min(16).max(128),
});

export const PedidoDeVerificacaoDeFator = z.object({
  fatorId: z.guid(),
  codigo: z.string().regex(/^\d{6}$/),
});

export const PedidoDeRemocaoDeFator = z.object({ fatorId: z.guid() });

/** O pedido do e-mail de recuperação de senha (C9): só o e-mail. */
export const PedidoDeRecuperacaoDeSenha = z
  .object({ email: z.email().max(254) })
  .meta({ id: 'PedidoDeRecuperacaoDeSenha' });
