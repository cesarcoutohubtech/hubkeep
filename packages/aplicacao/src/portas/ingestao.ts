// Portas da ingestão do sistema hoteleiro (F0-08, ADR-008), implementadas em
// packages/db. Cada uma abre UMA transação com o papel certo e entrega ao caso
// de uso uma sessão: a regra (credencial, licença) fica aqui na aplicação, e
// tudo o que ela decide é gravado na mesma transação.
import type { Contexto, StatusDeHotel, StatusDeLocal } from '@hubkeep/dominio';

/** Aleatoriedade e hash, implementados em packages/db (node:crypto). */
export interface Criptografia {
  /** 32 bytes aleatórios em base64url (43 caracteres). */
  segredoAleatorio(): string;
  /** SHA-256 do texto em UTF-8, em hexadecimal. */
  sha256Hex(texto: string): Promise<string>;
}

export interface RegistroRecebido {
  chave: string;
  dados: Record<string, unknown>;
}

export interface LoteRecebido {
  fonte: string;
  entidade: string;
  registros: readonly RegistroRecebido[];
}

/** Registro com o hash do conteúdo (dados em JSON canônico). */
export interface RegistroComHash extends RegistroRecebido {
  hash: string;
}

export interface ResultadoDoLote {
  cargaId: string;
  novo: boolean;
}

/** Sessão de ingestão: papel hk_ingestao, tenant do prefixo da credencial. */
export interface SessaoDeIngestao {
  /** Hashes das credenciais NÃO revogadas do tenant (a RLS esconde as outras). */
  credenciaisAtivas(): Promise<{ id: string; hash: string }[]>;
  /**
   * Grava o lote no staging. Lote com o mesmo hash já recebido não é
   * reprocessado (novo: false); registro com o mesmo hash não é regravado.
   */
  registrarLote(
    lote: { fonte: string; entidade: string; registros: readonly RegistroComHash[] },
    loteHash: string,
  ): Promise<ResultadoDoLote>;
}

export interface PortaIngestao {
  emSessao<T>(tenantId: string, fn: (s: SessaoDeIngestao) => Promise<T>): Promise<T>;
}

/** Credenciais do agente, pelo Admin do grupo (hk_app, unit of work). */
export interface PortaCredenciaisDeAgente {
  criar(ctx: Contexto, credencial: { descricao: string; hash: string }): Promise<{ id: string }>;
  /** null se não existe no tenant ou já estava revogada. */
  revogar(ctx: Contexto, id: string): Promise<{ revogadaEm: Date } | null>;
}

export interface UhDoStaging {
  fonte: string;
  chave: string;
  dados: unknown;
}

export interface HotelParaPromocao {
  id: string;
  status: StatusDeHotel;
}

export interface LocalExistente {
  id: string;
  nome: string;
  andar: string | null;
}

/** Sessão de promoção: papel hk_worker, um tenant, uma unit of work. */
export interface SessaoDePromocao {
  uhsDoStaging(): Promise<UhDoStaging[]>;
  /** Hotéis do tenant por `${fonte}|${cod_externo}`. */
  hoteisPorCodigo(): Promise<Map<string, HotelParaPromocao>>;
  /** Locais já promovidos por `${hotel_id}|${cod_externo}`. */
  locaisPorCodigo(): Promise<Map<string, LocalExistente>>;
  /** max_uhs do contrato e UHs que já contam como uso. */
  usoDeLicenca(): Promise<{ contratadas: number; emUso: number }>;
  criarUh(uh: {
    hotelId: string;
    chave: string;
    nome: string;
    andar: string | null;
    status: StatusDeLocal;
  }): Promise<void>;
  atualizarUh(id: string, dados: { nome: string; andar: string | null }): Promise<void>;
}

export interface PortaPromocaoDeUhs {
  emSessao<T>(tenantId: string, fn: (s: SessaoDePromocao) => Promise<T>): Promise<T>;
}
