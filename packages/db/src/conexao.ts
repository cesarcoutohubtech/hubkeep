// Conexões do HubKeep com o banco. Módulo interno do pacote: nada daqui sai
// pelo index. Quem usa o banco recebe withContext/withSistema/executar, nunca
// um pool nem um Kysely solto (docs/02 — "O pool csc_app não é exportado").
import { AsyncLocalStorage } from 'node:async_hooks';
import {
  CompiledQuery,
  type DatabaseConnection,
  Kysely,
  PostgresDialect,
  PostgresDriver,
  type Transaction,
  type TransactionSettings,
  sql,
} from 'kysely';
import pg from 'pg';
import type { DB } from './tipos-banco';
import { tlsVerificado } from './tls';

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
  /**
   * TLS, com o certificado conferido contra a CA do Supabase; a CI conecta sem
   * TLS ao Postgres do runner. Quem monta a config decide com tlsDaConexao
   * (./tls), que só aceita sem TLS com host local.
   */
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

/**
 * Quanto uma conexão do pool pode ficar ociosa antes de ser fechada (P1b).
 *
 * Conexão nova ao pooler custa de 130 a 270 ms (TLS e autenticação), contra
 * cerca de 22 ms de uma ida e volta numa conexão aberta. Com 10 s, quem
 * navegava com pausas de leitura pagava a conexão nova em quase todo pedido.
 *
 * Por que 2 minutos não pesa:
 *   - na Vercel (fluid compute) a instância da função atende muitos pedidos e
 *     fica viva entre eles; o pool é dela, com no máximo `max` conexões;
 *   - a conexão é com o Supavisor em modo transação (6543): conexão de cliente
 *     ociosa não segura backend do Postgres, que só é ocupado durante a
 *     transação. O que ela ocupa é uma vaga de cliente do pooler, folgada para
 *     o número de instâncias do piloto;
 *   - quando a instância é congelada ou o pooler derruba a conexão, o pool
 *     descarta o cliente com erro (pool.on('error') abaixo) e abre outro.
 */
export const OCIOSO_MS = 120_000;

export function criarPool(cfg: ConfigConexao): pg.Pool {
  const pool = new pg.Pool({
    connectionString: cfg.url,
    max: cfg.max ?? 5,
    idleTimeoutMillis: OCIOSO_MS,
    // Conexão ociosa não segura o processo vivo: script e teste que esquecerem
    // o encerrar() terminam mesmo assim. Na Vercel não muda nada.
    allowExitOnIdle: true,
    // Keepalive do TCP: conexão morta durante a ociosidade (instância congelada,
    // NAT, pooler reiniciado) é notada pelo socket, e não no próximo pedido.
    keepAlive: true,
    // Certificado conferido contra a CA do Supabase e pelo nome do host (./tls).
    ...(cfg.ssl ? { ssl: tlsVerificado(cfg.url) } : {}),
  });
  // Cliente ocioso que cai (pooler reiniciado, rede) emite 'error' no pool; sem
  // ouvinte, o evento derrubaria o processo. O pg-pool já tira esse cliente do
  // pool, e o próximo pedido abre outro.
  pool.on('error', () => undefined);
  return pool;
}

/**
 * Início de transação pendente: o contexto que o próximo BEGIN deste fluxo
 * assíncrono deve fixar no mesmo envio (ver DriverDoHubKeep).
 */
interface InicioPendente {
  usuarioId: string;
  tenantId: string;
  usado: boolean;
}
const inicioPendente = new AsyncLocalStorage<InicioPendente>();

/** Valor do contexto como literal SQL: só UUID ou vazio, nada mais passa. */
function literalDoContexto(valor: string, campo: string): string {
  if (valor !== '' && !UUID.test(valor)) {
    throw new Error(`${campo} não é um UUID: contexto recusado.`);
  }
  return `'${valor}'`;
}

/**
 * BEGIN e contexto num só comando (P1b): `begin; select set_config(...)`.
 *
 * Vai pelo protocolo simples do Postgres (sem parâmetros), o único que aceita
 * mais de um comando por envio; por isso os valores entram como literais, e
 * literalDoContexto só aceita UUID ou vazio — não há como injetar SQL.
 * set_config(..., true) continua local à transação (ADR-003).
 *
 * Exportada para os testes.
 */
export function inicioComContexto(
  ajustes: TransactionSettings,
  usuarioId: string,
  tenantId: string,
): string {
  // Mesmo texto de início que o PostgresDriver do Kysely monta.
  let inicio = 'begin';
  if (ajustes.isolationLevel || ajustes.accessMode) {
    inicio = 'start transaction';
    if (ajustes.isolationLevel) inicio += ` isolation level ${ajustes.isolationLevel}`;
    if (ajustes.accessMode) inicio += ` ${ajustes.accessMode}`;
  }
  return (
    `${inicio}; select set_config('app.usuario_id', ${literalDoContexto(usuarioId, 'usuarioId')}, true), ` +
    `set_config('app.tenant_id', ${literalDoContexto(tenantId, 'tenantId')}, true)`
  );
}

/**
 * O driver do Kysely para Postgres, com uma diferença: quando a transação é
 * aberta por emTransacao, o BEGIN leva junto o set_config do contexto, numa
 * ida e volta só ao pooler em vez de duas.
 *
 * Seguro com o Supavisor em modo transação: ele prende o backend ao cliente
 * enquanto o ReadyForQuery diz "em transação", e o envio único termina
 * exatamente nesse estado, como o BEGIN sozinho terminaria.
 */
class DriverDoHubKeep extends PostgresDriver {
  override async beginTransaction(
    conexao: DatabaseConnection,
    ajustes: TransactionSettings,
  ): Promise<void> {
    const pendente = inicioPendente.getStore();
    if (!pendente || pendente.usado) return super.beginTransaction(conexao, ajustes);
    pendente.usado = true;
    const comando = inicioComContexto(ajustes, pendente.usuarioId, pendente.tenantId);
    try {
      await conexao.executeQuery(CompiledQuery.raw(comando));
    } catch (e) {
      // O BEGIN pode ter passado e o set_config não: o Kysely não manda
      // ROLLBACK de início que falhou, então a conexão não volta ao pool em
      // transação aberta.
      await conexao.executeQuery(CompiledQuery.raw('rollback')).catch(() => undefined);
      throw e;
    }
  }
}

class DialetoDoHubKeep extends PostgresDialect {
  readonly #pool: pg.Pool;
  constructor(pool: pg.Pool) {
    super({ pool });
    this.#pool = pool;
  }
  override createDriver() {
    return new DriverDoHubKeep({ pool: this.#pool });
  }
}

export const criarKysely = (pool: pg.Pool) =>
  new Kysely<DB>({ dialect: new DialetoDoHubKeep(pool) });

export type PapelAplicacao = 'hk_app' | 'hk_worker' | 'hk_ingestao';

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

export interface AjustesDaTransacao {
  /** `start transaction read only`: escrita na transação falha (25006). */
  somenteLeitura?: boolean;
}

/**
 * Abre uma transação e fixa o contexto nela, no mesmo envio do BEGIN
 * (DriverDoHubKeep). set_config(..., true) é local à transação: morre no
 * COMMIT/ROLLBACK e não vaza para a próxima requisição que pegar a mesma
 * conexão do pool (ADR-003).
 *
 * Idas e voltas ao pooler: BEGIN+contexto, as consultas de `fn` e o COMMIT
 * (antes da P1b, o contexto era uma ida e volta a mais).
 */
export async function emTransacao<T>(
  db: Kysely<DB>,
  usuarioId: string,
  tenantId: string,
  fn: (tx: Tx) => Promise<T>,
  ajustes: AjustesDaTransacao = {},
): Promise<T> {
  // Confere antes de pegar conexão; o driver confere de novo ao montar o SQL.
  literalDoContexto(usuarioId, 'usuarioId');
  literalDoContexto(tenantId, 'tenantId');
  const construtor = ajustes.somenteLeitura
    ? db.transaction().setAccessMode('read only')
    : db.transaction();
  return inicioPendente.run({ usuarioId, tenantId, usado: false }, () => construtor.execute(fn));
}
