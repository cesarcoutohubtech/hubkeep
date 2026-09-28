// Dados de referência do técnico no aparelho (fase 1a, B3b): hotéis, locais,
// categorias e ativos, lidos da API quando há rede, para cadastrar e alterar
// ativo sem rede (ADR-025). Um registro por usuário, com o tenant em que foi
// lido: outro tenant ou outra pessoa no aparelho não o enxergam. Sair apaga o
// registro de quem sai (saida.ts, ajuste (b)). Banco separado da fila, para a
// atualização de um não mexer no outro.
import type { ValorDeCampo } from '@hubkeep/dominio';

export interface HotelGuardado {
  id: string;
  nome: string;
}

export interface LocalGuardado {
  id: string;
  nome: string;
  status: 'ativo' | 'pendente_licenca' | 'inativo';
}

export interface CampoGuardado {
  chave: string;
  tipo: 'texto' | 'numero' | 'data' | 'lista' | 'sim_nao';
  obrigatorio: boolean;
  rotulos: Partial<Record<string, string>>;
  unidade: string | null;
  opcoes: { chave: string; rotulos: Partial<Record<string, string>> }[];
}

export interface CategoriaGuardada {
  id: string;
  chavePadrao: string | null;
  nomes: Partial<Record<string, string>>;
  campos: CampoGuardado[];
  ativa: boolean;
}

export interface AtivoGuardado {
  id: string;
  localId: string;
  categoriaId: string | null;
  nome: string;
  fabricante: string | null;
  modelo: string | null;
  numeroSerie: string | null;
  campos: Record<string, ValorDeCampo>;
  versao: number;
  ativo: boolean;
}

export interface Referencia {
  usuarioId: string;
  tenantId: string;
  hoteis: HotelGuardado[];
  /** Por hotel. */
  locais: Record<string, LocalGuardado[]>;
  /** Por hotel. */
  ativos: Record<string, AtivoGuardado[]>;
  idiomaPadrao: string;
  categorias: CategoriaGuardada[];
  /** Milissegundos desde 1970. */
  lidaEm: number;
}

const NOME = 'hubkeep-tecnico-referencia';
const VERSAO = 1;
const LOJA = 'referencia';

const pedido = <T>(r: IDBRequest<T>) =>
  new Promise<T>((ok, falha) => {
    r.onsuccess = () => ok(r.result);
    r.onerror = () => falha(r.error);
  });

export function abrirReferencia(fabrica: IDBFactory = indexedDB): Promise<ReferenciaDoAparelho> {
  return new Promise((ok, falha) => {
    const r = fabrica.open(NOME, VERSAO);
    r.onupgradeneeded = () => {
      r.result.createObjectStore(LOJA, { keyPath: 'usuarioId' });
    };
    r.onsuccess = () => ok(new ReferenciaDoAparelho(r.result));
    r.onerror = () => falha(r.error);
  });
}

export class ReferenciaDoAparelho {
  private readonly db: IDBDatabase;
  constructor(db: IDBDatabase) {
    this.db = db;
  }

  private loja(modo: IDBTransactionMode) {
    return this.db.transaction(LOJA, modo).objectStore(LOJA);
  }

  /** A referência do usuário no tenant ativo; null se não há ou é de outro tenant. */
  async ler(usuarioId: string, tenantId: string): Promise<Referencia | null> {
    const r = (await pedido(this.loja('readonly').get(usuarioId))) as Referencia | undefined;
    return r && r.tenantId === tenantId ? r : null;
  }

  async gravar(r: Referencia): Promise<void> {
    await pedido(this.loja('readwrite').put(r));
  }

  /** Ao sair: apaga a referência de quem sai. */
  async apagarDoUsuario(usuarioId: string): Promise<void> {
    await pedido(this.loja('readwrite').delete(usuarioId));
  }

  fechar(): void {
    this.db.close();
  }
}
