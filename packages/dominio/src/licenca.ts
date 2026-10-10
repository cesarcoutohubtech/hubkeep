// Regras de licença (docs/00, "Licença"; CLAUDE.md, regra 2: limite de licença
// é da aplicação, nunca do banco).
//
// Métrica provisória (pendência comercial): UH ativa conta, área comum não.
// É a mesma de licenca.uso(), que o backoffice lê; o teste de paridade da CI
// (packages/db/test/licenca.test.ts) falha se as duas contagens divergirem.

export type StatusDeHotel = 'em_implantacao' | 'ativo' | 'desativado';
export type TipoDeLocal = 'uh' | 'area_comum';
export type StatusDeLocal = 'ativo' | 'pendente_licenca' | 'inativo';

/** O que conta como uso da licença de UHs. */
export const contaComoUh = (local: { tipo: TipoDeLocal; status: StatusDeLocal }): boolean =>
  local.tipo === 'uh' && local.status === 'ativo';

export interface SaldoDeUhs {
  /** max_uhs do contrato; sem contrato, 0 (nada é ativado). */
  contratadas: number;
  /** UHs que já contam como uso. */
  emUso: number;
}

export const saldoDeUhs = (s: SaldoDeUhs): number => Math.max(0, s.contratadas - s.emUso);

/**
 * Status de uma UH nova vinda do sistema hoteleiro. Só entra ativa em hotel
 * ativo e com saldo; senão fica pendente_licenca, aparece para o Admin e não
 * recebe chamados (docs/00). Hotel em implantação não consome licença até ser
 * ativado.
 */
export function statusDaUhNova(hotel: StatusDeHotel, saldo: number): StatusDeLocal {
  return hotel === 'ativo' && saldo > 0 ? 'ativo' : 'pendente_licenca';
}

/** O que conta como uso da licença de hotéis: hotel ativo (mesma métrica de licenca.uso()). */
export const contaComoHotel = (hotel: { status: StatusDeHotel }): boolean =>
  hotel.status === 'ativo';

export interface SaldoDeHoteis {
  /** max_hoteis do contrato; sem contrato, 0 (nenhum hotel é ativado). */
  contratados: number;
  /** Hotéis que já contam como uso. */
  emUso: number;
}

export const saldoDeHoteis = (s: SaldoDeHoteis): number => Math.max(0, s.contratados - s.emUso);

/**
 * Ativação de hotel (fase 1a, A1). O hotel entra em implantação sem consumir
 * licença; ativar consome uma licença de hotel. Sem saldo, a ativação é
 * bloqueada e a EasyGov é avisada (docs/00). Ativar de novo um hotel ativo é
 * conflito, não erro silencioso.
 */
export type DecisaoDeAtivacao =
  | { ativar: true; uhsALiberar: number }
  | { ativar: false; motivo: 'ja_ativo' | 'sem_saldo_de_hoteis' };

export function decidirAtivacao(entrada: {
  status: StatusDeHotel;
  hoteis: SaldoDeHoteis;
  uhs: SaldoDeUhs;
  /** UHs do hotel que estão pendentes de licença, na ordem em que serão liberadas. */
  uhsPendentes: number;
}): DecisaoDeAtivacao {
  if (entrada.status === 'ativo') return { ativar: false, motivo: 'ja_ativo' };
  if (saldoDeHoteis(entrada.hoteis) <= 0) return { ativar: false, motivo: 'sem_saldo_de_hoteis' };
  // Ao ativar, as UHs pendentes do hotel entram até onde o saldo de UHs deixar.
  return { ativar: true, uhsALiberar: Math.min(entrada.uhsPendentes, saldoDeUhs(entrada.uhs)) };
}

/**
 * Módulos contratáveis (I7, licenca.modulo). O banco repete a lista no check
 * licenca_modulo_lista (migração 0037), e tests/valores-canonicos-banco.test.ts
 * confere a paridade. Se o módulo vale agora (a vigência) é regra daqui; a
 * regra entra com a montagem do servidor, no PR seguinte, fora da zona
 * protegida.
 */
export const MODULOS_CONTRATAVEIS = ['inteligencia'] as const;
export type ModuloContratavel = (typeof MODULOS_CONTRATAVEIS)[number];

export const ehModuloContratavel = (v: unknown): v is ModuloContratavel =>
  typeof v === 'string' && (MODULOS_CONTRATAVEIS as readonly string[]).includes(v);
