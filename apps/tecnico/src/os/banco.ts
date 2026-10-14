// Fila do dia no aparelho (fase 1a, C4b; ADR-025): as OS do técnico e das
// equipes dele, como a API as deu da última vez que houve rede
// (GET /api/v1/os/do-dia). Um registro por usuário, com o tenant em que foi
// lido: outro tenant ou outra pessoa no aparelho não o enxergam. Sair apaga o
// registro de quem sai (saida.ts). O que o técnico fez sem rede não muda o
// guardado: a tela projeta a fila de operações por cima (projecao.ts), e o
// guardado só troca quando a API responde de novo.
import type { OsDoDiaApi } from '@hubkeep/contratos';

/**
 * A guardada antes da I8 não tem as fotos "depois" nem a política da foto
 * (opcionais). A OS preventiva (PV3c) vem sem chamado e com a `preventiva`; a
 * guardada antes dela não tem o campo `preventiva`, e é sempre corretiva.
 */
export type OsGuardada = OsDoDiaApi;

export interface OsDoDiaGuardadas {
  usuarioId: string;
  tenantId: string;
  os: OsGuardada[];
  /** Milissegundos desde 1970. */
  lidaEm: number;
}

const NOME = 'hubkeep-tecnico-os';
const VERSAO = 1;
const LOJA = 'os_do_dia';

const pedido = <T>(r: IDBRequest<T>) =>
  new Promise<T>((ok, falha) => {
    r.onsuccess = () => ok(r.result);
    r.onerror = () => falha(r.error);
  });

export function abrirOsDoDia(fabrica: IDBFactory = indexedDB): Promise<OsDoDiaDoAparelho> {
  return new Promise((ok, falha) => {
    const r = fabrica.open(NOME, VERSAO);
    r.onupgradeneeded = () => {
      r.result.createObjectStore(LOJA, { keyPath: 'usuarioId' });
    };
    r.onsuccess = () => ok(new OsDoDiaDoAparelho(r.result));
    r.onerror = () => falha(r.error);
  });
}

export class OsDoDiaDoAparelho {
  private readonly db: IDBDatabase;
  constructor(db: IDBDatabase) {
    this.db = db;
  }

  private loja(modo: IDBTransactionMode) {
    return this.db.transaction(LOJA, modo).objectStore(LOJA);
  }

  /** As OS do usuário no tenant ativo; null se não há ou são de outro tenant. */
  async ler(usuarioId: string, tenantId: string): Promise<OsDoDiaGuardadas | null> {
    const r = (await pedido(this.loja('readonly').get(usuarioId))) as OsDoDiaGuardadas | undefined;
    return r && r.tenantId === tenantId ? r : null;
  }

  async gravar(r: OsDoDiaGuardadas): Promise<void> {
    await pedido(this.loja('readwrite').put(r));
  }

  /** Ao sair: apaga as OS de quem sai. */
  async apagarDoUsuario(usuarioId: string): Promise<void> {
    await pedido(this.loja('readwrite').delete(usuarioId));
  }

  fechar(): void {
    this.db.close();
  }
}
