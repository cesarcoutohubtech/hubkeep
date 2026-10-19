// Dados de referência do técnico no aparelho (fase 1a, B3b): hotéis, locais,
// categorias e ativos, lidos da API quando há rede, para cadastrar e alterar
// ativo sem rede (ADR-025). Um registro por usuário, com o tenant em que foi
// lido: outro tenant ou outra pessoa no aparelho não o enxergam. Sair apaga o
// registro de quem sai (saida.ts, ajuste (b)). Banco separado da fila, para a
// atualização de um não mexer no outro. Na I6, também os códigos de falha,
// causa e solução, para o técnico sugerir na conclusão sem rede. Na M1, os
// modelos de ativo, para preencher o cadastro sem rede.
import type { ValorDeCampo } from '@hubkeep/dominio';

export interface HotelGuardado {
  id: string;
  nome: string;
}

export interface LocalGuardado {
  id: string;
  nome: string;
  status: 'ativo' | 'pendente_licenca' | 'inativo';
  /** UH ou área comum (I4: só a UH fica indisponível). Opcional: a referência guardada antes da I4 não tem. */
  tipo?: 'uh' | 'area_comum';
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
  /** O modelo de que o ativo nasceu (M1). Opcional: a referência guardada antes da M1 não tem. */
  modeloId?: string | null | undefined;
  nome: string;
  fabricante: string | null;
  modelo: string | null;
  numeroSerie: string | null;
  campos: Record<string, ValorDeCampo>;
  versao: number;
  ativo: boolean;
  /** Código do QR (B5). Opcional: a referência guardada antes da B5 não tem. */
  codigoQr?: string;
  /** Início da parada aberta (C5). Opcional: a referência guardada antes da C5 não tem. */
  paradoDesde?: string | null;
  /** Compra, garantia (aaaa-mm-dd) e criticidade (1 a 5), da I1. Opcionais: a referência guardada antes da I1 não tem. */
  dataCompra?: string | null;
  garantiaAte?: string | null;
  criticidade?: number | null;
  /** A situação do cadastro (M4) e o motivo da recusa. Opcionais: a referência guardada antes da M4 não tem. */
  situacaoCadastro?: 'pendente' | 'aprovado' | 'recusado' | undefined;
  motivoDaRecusa?: string | null | undefined;
}

/** Um código de falha, causa ou solução do tenant (I6). */
export interface CodigoGuardado {
  id: string;
  tipo: 'falha' | 'causa' | 'solucao';
  categoriaId: string | null;
  chavePadrao: string | null;
  nomes: Partial<Record<string, string>>;
  ativa: boolean;
}

/** Um modelo de ativo do grupo (M1), para preencher o cadastro sem rede. */
export interface ModeloGuardado {
  id: string;
  categoriaId: string;
  nome: string;
  fabricante: string | null;
  modelo: string | null;
  campos: Record<string, ValorDeCampo>;
  ativa: boolean;
}

/** Nome de cada nível da criticidade por idioma (política ativo.criticidade do hotel, I1). */
export type NomesDeCriticidadeGuardados = Partial<Record<string, Partial<Record<string, string>>>>;

export interface Referencia {
  usuarioId: string;
  tenantId: string;
  hoteis: HotelGuardado[];
  /** Por hotel. */
  locais: Record<string, LocalGuardado[]>;
  /** Por hotel. */
  ativos: Record<string, AtivoGuardado[]>;
  /** Por hotel (I1). Opcional: a referência guardada antes da I1 não tem, e vale o catálogo. */
  nomesDeCriticidade?: Record<string, NomesDeCriticidadeGuardados>;
  idiomaPadrao: string;
  categorias: CategoriaGuardada[];
  /** Os códigos do tenant (I6). Opcional: a referência guardada antes da I6 não tem. */
  codigos?: CodigoGuardado[];
  /** Os modelos de ativo do grupo (M1). Opcional: a referência guardada antes da M1 não tem. */
  modelos?: ModeloGuardado[];
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
