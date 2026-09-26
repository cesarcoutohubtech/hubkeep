// Fila de operações offline no IndexedDB (F0-11, ADR-025). Cada operação nasce
// com a chave de idempotência que vai ao servidor (a chave é também a chave
// primária aqui) e com o usuário que a criou: só é lida, mostrada e enviada na
// sessão desse usuário. Se outra pessoa entrar no mesmo aparelho, as operações
// da anterior ficam fora do alcance dela. A fila sobrevive a fechar o app e só
// perde a operação quando o servidor confirma, quando o técnico dispensa uma
// recusada ou quando ele sai (apagarDoUsuario).
import type { PedidoDeOperacaoOffline } from '@hubkeep/contratos';

export type EstadoDaOperacao = 'pendente' | 'rejeitada';

export interface OperacaoNaFila {
  chave: string;
  /** Quem criou a operação (sub do token). Só a sessão dele a envia. */
  usuarioId: string;
  tipo: PedidoDeOperacaoOffline['tipo'];
  dados: PedidoDeOperacaoOffline['dados'];
  /** Milissegundos desde 1970, para ordenar e para o backoff. */
  criadaEm: number;
  estado: EstadoDaOperacao;
  tentativas: number;
  proximaTentativaEm: number;
  /** Código do erro da API (rejeitada) ou da última falha de rede. */
  ultimoErro: string | null;
}

const NOME = 'hubkeep-tecnico';
// Versão 2: a operação passou a guardar o usuário (ADR-025, ajuste (a)). O
// app não tinha sido publicado; a loja da versão 1 é descartada.
const VERSAO = 2;
const LOJA = 'operacoes';

const pedido = <T>(r: IDBRequest<T>) =>
  new Promise<T>((ok, falha) => {
    r.onsuccess = () => ok(r.result);
    r.onerror = () => falha(r.error);
  });

export function abrirFila(fabrica: IDBFactory = indexedDB): Promise<FilaDeOperacoes> {
  return new Promise((ok, falha) => {
    const r = fabrica.open(NOME, VERSAO);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (db.objectStoreNames.contains(LOJA)) db.deleteObjectStore(LOJA);
      const loja = db.createObjectStore(LOJA, { keyPath: 'chave' });
      loja.createIndex('usuarioECriacao', ['usuarioId', 'criadaEm']);
    };
    r.onsuccess = () => ok(new FilaDeOperacoes(r.result));
    r.onerror = () => falha(r.error);
  });
}

export class FilaDeOperacoes {
  private readonly db: IDBDatabase;
  constructor(db: IDBDatabase) {
    this.db = db;
  }

  private loja(modo: IDBTransactionMode) {
    return this.db.transaction(LOJA, modo).objectStore(LOJA);
  }

  /** Nova operação do usuário da sessão, com chave gerada no aparelho. */
  async enfileirar(
    op: Pick<OperacaoNaFila, 'usuarioId' | 'tipo' | 'dados'>,
    agora: number,
    novaChave: () => string = () => crypto.randomUUID(),
  ): Promise<OperacaoNaFila> {
    const completa: OperacaoNaFila = {
      ...op,
      chave: novaChave(),
      criadaEm: agora,
      estado: 'pendente',
      tentativas: 0,
      proximaTentativaEm: agora,
      ultimoErro: null,
    };
    await pedido(this.loja('readwrite').add(completa));
    return completa;
  }

  /** As operações de um usuário, da mais antiga para a mais nova. */
  async doUsuario(usuarioId: string): Promise<OperacaoNaFila[]> {
    const faixa = IDBKeyRange.bound([usuarioId, -Infinity], [usuarioId, Infinity]);
    return pedido(
      this.loja('readonly').index('usuarioECriacao').getAll(faixa) as IDBRequest<OperacaoNaFila[]>,
    );
  }

  async atualizar(op: OperacaoNaFila): Promise<void> {
    await pedido(this.loja('readwrite').put(op));
  }

  async remover(chave: string): Promise<void> {
    await pedido(this.loja('readwrite').delete(chave));
  }

  /** Ao sair: apaga tudo o que é do usuário neste aparelho. */
  async apagarDoUsuario(usuarioId: string): Promise<void> {
    const faixa = IDBKeyRange.bound([usuarioId, -Infinity], [usuarioId, Infinity]);
    const transacao = this.db.transaction(LOJA, 'readwrite');
    // Cursor na mesma transação: apaga uma a uma sem deixar a transação fechar.
    const cursor = transacao.objectStore(LOJA).index('usuarioECriacao').openCursor(faixa);
    cursor.onsuccess = () => {
      const atual = cursor.result;
      if (!atual) return;
      atual.delete();
      atual.continue();
    };
    await new Promise<void>((ok, falha) => {
      transacao.oncomplete = () => ok();
      transacao.onerror = () => falha(transacao.error);
      transacao.onabort = () => falha(transacao.error);
    });
  }

  fechar(): void {
    this.db.close();
  }
}
