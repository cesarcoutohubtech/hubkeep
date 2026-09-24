// Fábrica do acesso ao banco, usada na raiz de composição de cada app. O pool
// fica preso neste closure: quem recebe o AcessoBanco só consegue ler e
// escrever através de withContext/withSistema/executar, sempre com contexto.
import {
  type ConfigConexao,
  type Contexto,
  type Tx,
  criarKysely,
  criarPool,
  emTransacao,
  validarUuid,
} from './conexao';
import { gravarAuditoriaEOutbox } from './repositorios/auditoria-outbox';
import { type UnidadeDeTrabalho, criarUnidade } from './unidade-de-trabalho';

export interface AcessoBanco {
  /** Leitura (e escrita via repositório) em nome do usuário, papel hk_app. */
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
  encerrar(): Promise<void>;
}

export interface ConfigAcessoBanco {
  app?: ConfigConexao;
  worker?: ConfigConexao;
}

export function criarAcessoBanco(cfg: ConfigAcessoBanco): AcessoBanco {
  const app = cfg.app ? criarKysely(criarPool(cfg.app)) : null;
  const worker = cfg.worker ? criarKysely(criarPool(cfg.worker)) : null;

  const exigir = <K>(db: K | null, papel: string): K => {
    if (!db) throw new Error(`Acesso ao banco criado sem conexão ${papel}.`);
    return db;
  };

  // async de propósito: contexto inválido vira Promise rejeitada, como qualquer
  // outra falha de banco, e não uma exceção síncrona que escapa do await.
  const withContext: AcessoBanco['withContext'] = async (ctx, fn) => {
    validarUuid(ctx.usuarioId, 'usuarioId');
    validarUuid(ctx.tenantId, 'tenantId');
    return emTransacao(exigir(app, 'hk_app'), ctx.usuarioId, ctx.tenantId, fn);
  };

  // O worker não age em nome de ninguém: app.usuario_id vazio, e as policies
  // de hk_worker leem só authz.tenant_sistema().
  const withSistema: AcessoBanco['withSistema'] = async (ctx, fn) => {
    validarUuid(ctx.tenantId, 'tenantId');
    return emTransacao(exigir(worker, 'hk_worker'), '', ctx.tenantId, fn);
  };

  return {
    withContext,
    withSistema,
    executar: (ctx, fn) =>
      withContext(ctx, async (tx) => {
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
      await Promise.all([app?.destroy(), worker?.destroy()]);
    },
  };
}
