// Porta da configuração do tenant e do hotel e das políticas (fase 1a, A7;
// ADR-026). Implementada por packages/db, com o contexto do usuário: leitura
// por escopo (a do hotel, quem lê o hotel), gravação só do Admin do grupo (RLS).
import type { Contexto, ModeloContratual } from '@hubkeep/dominio';
import type { Idioma } from '@hubkeep/i18n';

export interface ConfiguracaoDoTenant {
  nome: string;
  pais: string;
  subdivisao: string | null;
  moeda: string;
  idiomaPadrao: Idioma;
}

export interface ConfiguracaoDoHotel {
  id: string;
  nome: string;
  fuso: string;
  /** Nulo: herda do tenant. */
  pais: string | null;
  subdivisao: string | null;
  moeda: string | null;
  idiomaPadrao: Idioma | null;
  /** Modelo contratual (I2); nulo: não informado. */
  modeloContratual: ModeloContratual | null;
}

/**
 * O que a configuração do hotel grava. O modelo contratual é opcional:
 * ausente (undefined), fica o gravado; null volta a "não informado".
 */
export type MudancaDaConfiguracaoDoHotel = Omit<
  ConfiguracaoDoHotel,
  'id' | 'nome' | 'modeloContratual'
> & { modeloContratual?: ModeloContratual | null | undefined };

export type EscopoDePolitica = { tipo: 'grupo' } | { tipo: 'hotel'; hotelId: string };

export interface PoliticaGravada {
  chave: string;
  escopo: EscopoDePolitica;
  valor: unknown;
}

export interface PortaConfiguracao {
  tenant(ctx: Contexto): Promise<ConfiguracaoDoTenant | null>;
  hotel(ctx: Contexto, hotelId: string): Promise<ConfiguracaoDoHotel | null>;
  /** Políticas ativas do grupo e, se pedido, do hotel. */
  politicas(ctx: Contexto, hotelId?: string): Promise<PoliticaGravada[]>;
  /** Na unit of work, com auditoria. Nada alterado (RLS): NaoEncontrado. */
  configurarTenant(ctx: Contexto, c: Omit<ConfiguracaoDoTenant, 'nome'>): Promise<void>;
  configurarHotel(ctx: Contexto, hotelId: string, c: MudancaDaConfiguracaoDoHotel): Promise<void>;
  /** Grava (ou, com valor null, desativa: volta a herdar) a política do escopo. */
  gravarPolitica(
    ctx: Contexto,
    chave: string,
    escopo: EscopoDePolitica,
    valor: unknown | null,
  ): Promise<void>;
}
