// Portas da ativação de hotéis (fase 1a, A1). Implementadas por packages/db,
// com o contexto do usuário: o que cada uma devolve ou grava passa pela RLS
// (só o Admin do grupo lê o staging e cria ou altera hotel).
import type { Contexto, SaldoDeHoteis, SaldoDeUhs, StatusDeHotel } from '@hubkeep/dominio';

/** Um hotel como chegou do sistema hoteleiro (staging, entidade 'hotel'). */
export interface HotelDoStaging {
  fonte: string;
  chave: string;
  dados: Record<string, unknown>;
  recebidoEm: Date;
}

export interface HotelCadastrado {
  id: string;
  status: StatusDeHotel;
  nome: string;
  fuso: string;
  sistemaOrigem: string | null;
  codExterno: string | null;
}

export interface UsoDaLicenca {
  hoteis: SaldoDeHoteis;
  uhs: SaldoDeUhs;
}

/**
 * O que a ativação grava, numa unit of work só. A porta trava a licença do
 * tenant antes de abrir a sessão: duas ativações (ou a promoção de UHs do
 * worker) não leem o mesmo saldo ao mesmo tempo.
 */
export interface SessaoDeHoteis {
  usoDaLicenca(): Promise<UsoDaLicenca>;
  hotel(id: string): Promise<HotelCadastrado | null>;
  hotelPorCodigo(fonte: string, chave: string): Promise<HotelCadastrado | null>;
  hotelDoStaging(fonte: string, chave: string): Promise<HotelDoStaging | null>;
  /** Cria o hotel em implantação (sem consumir licença). */
  criarHotel(h: { nome: string; fuso: string; fonte: string; chave: string }): Promise<string>;
  ativarHotel(id: string): Promise<void>;
  /** UHs do hotel pendentes de licença, na ordem em que serão liberadas. */
  uhsPendentes(hotelId: string): Promise<{ id: string }[]>;
  liberarUh(hotelId: string, localId: string): Promise<void>;
  /** Tentativa sem saldo: auditoria e evento licenca.sem_saldo (a EasyGov é avisada). */
  registrarAtivacaoBloqueada(hotelId: string, uso: UsoDaLicenca): Promise<void>;
}

export interface PortaHoteisDoStaging {
  listar(ctx: Contexto): Promise<{
    staging: HotelDoStaging[];
    cadastrados: HotelCadastrado[];
    uso: UsoDaLicenca;
  }>;
  emSessao<T>(ctx: Contexto, fn: (s: SessaoDeHoteis) => Promise<T>): Promise<T>;
}
