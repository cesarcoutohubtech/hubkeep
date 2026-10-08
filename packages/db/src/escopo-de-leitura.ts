// Escopo de leitura (P1b): uma transação para todas as leituras de um pedido.
//
// Sem escopo, cada chamada de withContext abre a própria transação (BEGIN com o
// contexto, consulta, COMMIT). Uma rota GET que chama três portas — ou um caso
// de uso que confere a atribuição e depois lê — pagava três vezes o BEGIN e o
// COMMIT, cada um uma ida e volta ao pooler.
//
// Dentro de emEscopoDeLeitura, o primeiro withContext abre UMA transação
// somente leitura com o contexto dele, e os seguintes com o MESMO contexto (e
// o mesmo acesso ao banco) usam essa transação. Ela fecha quando o escopo
// termina. O que não muda:
//   - autorização e escopo: é a mesma transação com o mesmo set_config local,
//     e a RLS decide cada consulta como antes; contexto diferente nunca reusa;
//   - escrita: executar (unit of work) não usa o escopo, abre a própria
//     transação de leitura e escrita, com auditoria e outbox juntas (ADR-006);
//     e a transação do escopo é `read only`, então escrita fora da unit of work
//     falharia ali (25006) em vez de passar;
//   - falha: se uma leitura do escopo falhar, o escopo para de ser reusado (a
//     transação pode ter abortado) e as leituras seguintes abrem a própria.
//
// Concorrência: Promise.all de leituras no escopo vira fila na mesma conexão.
// Ainda compensa: cada leitura custa uma ida e volta, contra três sem escopo.
import { AsyncLocalStorage } from 'node:async_hooks';
import type { Kysely } from 'kysely';
import { type Tx, emTransacao } from './conexao';
import type { DB } from './tipos-banco';

interface TransacaoDoEscopo {
  dono: Kysely<DB>;
  chave: string;
  tx: Promise<Tx>;
  /** Libera a transação: COMMIT com `ok`, ROLLBACK sem. */
  terminar(ok: boolean): Promise<void>;
}

interface Escopo {
  aberto: boolean;
  descartado: boolean;
  transacao?: TransacaoDoEscopo;
}

// Uma instância por processo, mesmo que o bundler duplique este módulo: a rota
// abre o escopo e o adaptador o lê, e os dois precisam ver o mesmo armazenamento.
const CHAVE_GLOBAL = Symbol.for('hubkeep.db.escopo-de-leitura');
const global = globalThis as { [CHAVE_GLOBAL]?: AsyncLocalStorage<Escopo> };
const escopos = (global[CHAVE_GLOBAL] ??= new AsyncLocalStorage<Escopo>());

/** Sinal interno para o ROLLBACK da transação do escopo quando o pedido falha. */
const DESFAZER = Symbol('desfazer');

/**
 * Roda `fn` num escopo de leitura. Escopo dentro de escopo usa o de fora.
 * Só para leitura: quem escreve continua em executar, que não usa o escopo.
 */
export async function emEscopoDeLeitura<T>(fn: () => Promise<T>): Promise<T> {
  if (escopos.getStore()?.aberto) return fn();
  const escopo: Escopo = { aberto: true, descartado: false };
  let resultado: T;
  try {
    resultado = await escopos.run(escopo, fn);
  } catch (e) {
    escopo.aberto = false;
    // O erro do pedido é o que importa; o do ROLLBACK não o substitui.
    await escopo.transacao?.terminar(false).catch(() => undefined);
    throw e;
  }
  escopo.aberto = false;
  await escopo.transacao?.terminar(true);
  return resultado;
}

function abrir(
  dono: Kysely<DB>,
  usuarioId: string,
  tenantId: string,
  chave: string,
): TransacaoDoEscopo {
  let liberar: (ok: boolean) => void = () => undefined;
  const fim = new Promise<boolean>((r) => {
    liberar = r;
  });
  let abriu = false;
  let execucao: Promise<unknown> = Promise.resolve(null);
  const tx = new Promise<Tx>((pronta, falhou) => {
    // Resolve com o erro (ou null) em vez de rejeitar: ninguém fica com uma
    // Promise rejeitada sem tratamento até o escopo terminar.
    execucao = emTransacao(
      dono,
      usuarioId,
      tenantId,
      async (t) => {
        abriu = true;
        pronta(t);
        if (!(await fim)) throw DESFAZER;
      },
      { somenteLeitura: true },
    ).then(
      () => null,
      (e: unknown) => {
        falhou(e);
        return e;
      },
    );
  });
  return {
    dono,
    chave,
    tx,
    async terminar(ok) {
      liberar(ok);
      const erro = await execucao;
      // Falha ao abrir já chegou a quem pediu a leitura; o DESFAZER é o pedido.
      if (erro !== null && erro !== DESFAZER && abriu) throw erro;
    },
  };
}

/**
 * Para o withContext do hk_app: roda `fn` na transação do escopo, se houver
 * escopo aberto e ele servir para este acesso e este contexto. Devolve null
 * quando não serve, e então quem chamou abre a própria transação.
 */
export function noEscopoDeLeitura<T>(
  dono: Kysely<DB>,
  usuarioId: string,
  tenantId: string,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> | null {
  const escopo = escopos.getStore();
  if (!escopo?.aberto || escopo.descartado) return null;
  const chave = `${usuarioId}/${tenantId}`;
  if (escopo.transacao) {
    if (escopo.transacao.dono !== dono || escopo.transacao.chave !== chave) return null;
  } else {
    escopo.transacao = abrir(dono, usuarioId, tenantId, chave);
  }
  const { tx } = escopo.transacao;
  return (async () => {
    try {
      return await fn(await tx);
    } catch (e) {
      escopo.descartado = true;
      throw e;
    }
  })();
}
