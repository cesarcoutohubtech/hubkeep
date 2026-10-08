// Fábrica do acesso ao banco, usada na raiz de composição de cada app. O pool
// fica preso neste closure: quem recebe o AcessoBanco só consegue ler e
// escrever através de withContext/withSistema/executar, sempre com contexto.
import type { Kysely } from 'kysely';
import {
  type ConfigConexao,
  type Contexto,
  type Tx,
  criarKysely,
  criarPool,
  emTransacao,
  validarUuid,
  verificarPapel,
} from './conexao';
import { noEscopoDeLeitura } from './escopo-de-leitura';
import { gravarAuditoriaEOutbox } from './repositorios/auditoria-outbox';
import type { DB } from './tipos-banco';
import { type UnidadeDeTrabalho, criarUnidade } from './unidade-de-trabalho';

export interface AcessoBanco {
  /**
   * Leitura em nome do usuário, papel hk_app. Dentro de um escopo de leitura
   * (emEscopoDeLeitura, P1b), usa a transação do escopo quando o contexto é o
   * mesmo; fora dele, abre a própria.
   */
  withContext<T>(ctx: Contexto, fn: (tx: Tx) => Promise<T>): Promise<T>;
  /** Job do sistema, papel hk_worker, um tenant por transação. */
  withSistema<T>(ctx: { tenantId: string }, fn: (tx: Tx) => Promise<T>): Promise<T>;
  /** Escrita de negócio em nome do usuário: mudança + auditoria + outbox. */
  executar<T>(ctx: Contexto, fn: (uow: UnidadeDeTrabalho) => Promise<T>): Promise<T>;
  /** Escrita de negócio de um job: mudança + auditoria (sem usuário) + outbox. */
  executarComoSistema<T>(
    ctx: { tenantId: string },
    fn: (uow: UnidadeDeTrabalho) => Promise<T>,
  ): Promise<T>;
  /**
   * Endpoint de ingestão, papel hk_ingestao, tenant do prefixo da credencial:
   * só o staging desse tenant (ADR-008). Staging não é dado de negócio, não
   * passa pela unit of work: a própria staging.carga é o registro do lote.
   */
  withIngestao<T>(ctx: { tenantId: string }, fn: (tx: Tx) => Promise<T>): Promise<T>;
  /**
   * Tenants para os jobs (hk_worker): a única leitura do worker sem tenant na
   * sessão. A policy worker_select de app.tenant libera a lista; tudo o mais do
   * worker é um tenant por transação (withSistema, ADR-007).
   */
  listarTenants(): Promise<string[]>;
  encerrar(): Promise<void>;
}

export interface ConfigAcessoBanco {
  app?: ConfigConexao;
  worker?: ConfigConexao;
  ingestao?: ConfigConexao;
}

/**
 * Assíncrona porque confere o papel de cada pool antes de devolver o acesso
 * (verificarPapel, ADR-016): com URL do papel errado, rejeita e não devolve
 * nada com que se possa consultar.
 */
export async function criarAcessoBanco(cfg: ConfigAcessoBanco): Promise<AcessoBanco> {
  const app = cfg.app ? criarKysely(criarPool(cfg.app)) : null;
  const worker = cfg.worker ? criarKysely(criarPool(cfg.worker)) : null;
  const ingestao = cfg.ingestao ? criarKysely(criarPool(cfg.ingestao)) : null;

  try {
    await Promise.all([
      app ? verificarPapel(app, 'hk_app') : undefined,
      worker ? verificarPapel(worker, 'hk_worker') : undefined,
      ingestao ? verificarPapel(ingestao, 'hk_ingestao') : undefined,
    ]);
  } catch (e) {
    await Promise.allSettled([app?.destroy(), worker?.destroy(), ingestao?.destroy()]);
    throw e;
  }

  return montarAcesso({ app, worker, ingestao });
}

/**
 * O AcessoBanco sobre os Kysely já conferidos. Separado da fábrica para os
 * testes de unidade, que montam o acesso sobre um pool falso.
 */
export function montarAcesso(dbs: {
  app: Kysely<DB> | null;
  worker: Kysely<DB> | null;
  ingestao: Kysely<DB> | null;
}): AcessoBanco {
  const { app, worker, ingestao } = dbs;
  const exigir = <K>(db: K | null, papel: string): K => {
    if (!db) throw new Error(`Acesso ao banco criado sem conexão ${papel}.`);
    return db;
  };

  // async de propósito: contexto inválido vira Promise rejeitada, como qualquer
  // outra falha de banco, e não uma exceção síncrona que escapa do await.
  // A escrita (executar) usa transacaoPropria: nunca entra no escopo de leitura.
  const transacaoPropria: AcessoBanco['withContext'] = async (ctx, fn) => {
    validarUuid(ctx.usuarioId, 'usuarioId');
    validarUuid(ctx.tenantId, 'tenantId');
    return emTransacao(exigir(app, 'hk_app'), ctx.usuarioId, ctx.tenantId, fn);
  };

  const withContext: AcessoBanco['withContext'] = async (ctx, fn) => {
    validarUuid(ctx.usuarioId, 'usuarioId');
    validarUuid(ctx.tenantId, 'tenantId');
    const db = exigir(app, 'hk_app');
    return (
      noEscopoDeLeitura(db, ctx.usuarioId, ctx.tenantId, fn) ??
      emTransacao(db, ctx.usuarioId, ctx.tenantId, fn)
    );
  };

  // O worker não age em nome de ninguém: app.usuario_id vazio, e as policies
  // de hk_worker leem só authz.tenant_sistema().
  const withSistema: AcessoBanco['withSistema'] = async (ctx, fn) => {
    validarUuid(ctx.tenantId, 'tenantId');
    return emTransacao(exigir(worker, 'hk_worker'), '', ctx.tenantId, fn);
  };

  // Como o worker: sem usuário, e as policies de hk_ingestao leem só
  // authz.tenant_sistema().
  const withIngestao: AcessoBanco['withIngestao'] = async (ctx, fn) => {
    validarUuid(ctx.tenantId, 'tenantId');
    return emTransacao(exigir(ingestao, 'hk_ingestao'), '', ctx.tenantId, fn);
  };

  // Contexto explicitamente vazio (usuário e tenant ''): nenhuma policy de
  // tenant libera nada, só a lista de app.tenant do worker.
  const listarTenants: AcessoBanco['listarTenants'] = () =>
    emTransacao(exigir(worker, 'hk_worker'), '', '', async (tx) =>
      (await tx.selectFrom('app.tenant').select('id').orderBy('id').execute()).map((t) => t.id),
    );

  return {
    withContext,
    withSistema,
    withIngestao,
    listarTenants,
    executar: (ctx, fn) =>
      transacaoPropria(ctx, async (tx) => {
        const uow = criarUnidade(tx, ctx.tenantId, ctx.usuarioId);
        const resultado = await fn(uow);
        await gravarAuditoriaEOutbox(uow);
        return resultado;
      }),
    executarComoSistema: (ctx, fn) =>
      withSistema(ctx, async (tx) => {
        const uow = criarUnidade(tx, ctx.tenantId, null);
        const resultado = await fn(uow);
        await gravarAuditoriaEOutbox(uow);
        return resultado;
      }),
    encerrar: async () => {
      await Promise.all([app?.destroy(), worker?.destroy(), ingestao?.destroy()]);
    },
  };
}
