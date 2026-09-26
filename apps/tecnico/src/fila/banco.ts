// Fila de operações offline no IndexedDB (F0-11, ADR-025). Cada operação nasce
// com a chave de idempotência que vai ao servidor; a chave é também a chave
// primária aqui. A fila sobrevive a fechar o app, desligar o aparelho e trocar
// de rede: só sai daqui quando o servidor confirma (ou recusa) a operação.
import type { PedidoDeOperacaoOffline } from '@hubkeep/contratos';

export type EstadoDaOperacao = 'pendente' | 'rejeitada';

export interface OperacaoNaFila {
  chave: string;
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
const VERSAO = 1;
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
      const loja = r.result.createObjectStore(LOJA, { keyPath: 'chave' });
      loja.createIndex('criadaEm', 'criadaEm');
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

  /** Nova operação, com chave gerada no aparelho. */
  async enfileirar(
    op: Pick<OperacaoNaFila, 'tipo' | 'dados'>,
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

  /** Todas, da mais antiga para a mais nova (a ordem em que foram feitas). */
  async todas(): Promise<OperacaoNaFila[]> {
    return pedido(this.loja('readonly').index('criadaEm').getAll() as IDBRequest<OperacaoNaFila[]>);
  }

  async atualizar(op: OperacaoNaFila): Promise<void> {
    await pedido(this.loja('readwrite').put(op));
  }

  async remover(chave: string): Promise<void> {
    await pedido(this.loja('readwrite').delete(chave));
  }

  fechar(): void {
    this.db.close();
  }
}
