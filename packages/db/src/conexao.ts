// Conexões do HubKeep com o banco. Módulo interno do pacote: nada daqui sai
// pelo index. Quem usa o banco recebe withContext/withSistema/executar, nunca
// um pool nem um Kysely solto (docs/02 — "O pool csc_app não é exportado").
import { Kysely, PostgresDialect, type Transaction, sql } from 'kysely';
import pg from 'pg';
import type { DB } from './tipos-banco';

export type Tx = Transaction<DB>;

/** Usuário autenticado (sub do JWT validado no servidor) e tenant ativo. */
export interface Contexto {
  usuarioId: string;
  tenantId: string;
}

export interface ConfigConexao {
  /** String de conexão do papel. Na Vercel: Supavisor em modo transação (6543). */
  url: string;
  /** Tamanho máximo do pool deste processo. */
  max?: number;
  /** TLS: o pooler do Supabase exige; a CI conecta sem TLS ao Postgres do runner. */
  ssl?: boolean;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Recusa contexto malformado antes de abrir transação. O banco já falha
 * fechado com contexto inválido; isto troca o "não vê nada" silencioso por um
 * erro que aponta o defeito de quem chamou.
 */
export function validarUuid(valor: string, campo: string): void {
  if (!UUID.test(valor)) throw new Error(`${campo} não é um UUID: contexto recusado.`);
}

export function criarPool(cfg: ConfigConexao): pg.Pool {
  return new pg.Pool({
    connectionString: cfg.url,
    max: cfg.max ?? 5,
    // Na Vercel cada instância de função tem o próprio pool; conexão ociosa por
    // muito tempo só ocupa vaga do connection limit do papel (migração 0002).
    idleTimeoutMillis: 10_000,
    ...(cfg.ssl ? { ssl: { rejectUnauthorized: false } } : {}),
  });
}

export const criarKysely = (pool: pg.Pool) =>
  new Kysely<DB>({ dialect: new PostgresDialect({ pool }) });

/**
 * Abre uma transação e fixa o contexto nela. set_config(..., true) é local à
 * transação: morre no COMMIT/ROLLBACK e não vaza para a próxima requisição que
 * pegar a mesma conexão do pool (ADR-003).
 */
export async function emTransacao<T>(
  db: Kysely<DB>,
  usuarioId: string,
  tenantId: string,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  return db.transaction().execute(async (tx) => {
    await sql`select set_config('app.usuario_id', ${usuarioId}, true),
                     set_config('app.tenant_id', ${tenantId}, true)`.execute(tx);
    return fn(tx);
  });
}
