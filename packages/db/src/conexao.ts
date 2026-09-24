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

export type PapelAplicacao = 'hk_app' | 'hk_worker';

/**
 * Guarda de papel (ADR-016). A RLS só protege se quem conecta não a ignora:
 * uma URL trocada por engano pela do dono (BYPASSRLS) faria o withContext
 * "funcionar" enxergando todos os tenants, sem erro nenhum. Por isso a
 * primeira conexão de cada pool confere, antes de qualquer uso:
 *   - session_user e current_user iguais ao papel esperado (session_user pega o
 *     dono que fez SET ROLE: um RESET ROLE devolveria o acesso dele);
 *   - o papel não é superusuário nem tem BYPASSRLS.
 */
export async function verificarPapel(db: Kysely<DB>, esperado: PapelAplicacao): Promise<void> {
  const r = await sql<{ sessao: string; atual: string; superusuario: boolean; bypassrls: boolean }>`
    select session_user::text as sessao, current_user::text as atual,
           r.rolsuper as superusuario, r.rolbypassrls as bypassrls
    from pg_roles r where r.rolname = current_user`.execute(db);
  const linha = r.rows[0];
  const problemas: string[] = [];
  if (!linha) problemas.push('papel da conexão não encontrado em pg_roles');
  else {
    if (linha.sessao !== esperado || linha.atual !== esperado) {
      problemas.push(
        `conectado como ${linha.sessao} (current_user ${linha.atual}), esperado ${esperado}`,
      );
    }
    if (linha.superusuario) problemas.push('o papel é superusuário');
    if (linha.bypassrls) problemas.push('o papel tem BYPASSRLS');
  }
  if (problemas.length > 0) {
    throw new Error(`Acesso ao banco recusado: ${problemas.join('; ')}.`);
  }
}

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
