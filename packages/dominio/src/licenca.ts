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
