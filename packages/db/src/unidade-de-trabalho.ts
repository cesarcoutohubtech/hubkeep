// Unit of work (ADR-006): toda escrita de negócio acontece dentro de uma, e ela
// grava auditoria e eventos de domínio (outbox) na MESMA transação da mudança.
// Se qualquer parte falha, o ROLLBACK leva as três juntas.
//
// Os repositórios recebem a unidade, não a transação. A transação só é
// alcançável por transacaoDe(), que o index do pacote não exporta: fora de
// packages/db não há como escrever sem passar por aqui (e o lint proíbe
// insertInto/updateTable/deleteFrom fora de src/repositorios).
import type { Tx } from './conexao';

export interface RegistroAuditoria {
  entidade: string;
  registroId: string;
  acao: string;
  hotelId?: string | null;
  antes?: unknown;
  depois?: unknown;
}

export interface EventoDominio {
  tipo: string;
  entidade: string;
  registroId: string;
  payload: Record<string, unknown>;
}

export interface UnidadeDeTrabalho {
  readonly tenantId: string;
  /** null quando quem escreve é um job do sistema (hk_worker). */
  readonly usuarioId: string | null;
  auditar(registro: RegistroAuditoria): void;
  publicar(evento: EventoDominio): void;
}

const TX = Symbol('transacao');

export interface UnidadeInterna extends UnidadeDeTrabalho {
  readonly [TX]: Tx;
  readonly auditorias: readonly RegistroAuditoria[];
  readonly eventos: readonly EventoDominio[];
}

export function criarUnidade(tx: Tx, tenantId: string, usuarioId: string | null): UnidadeInterna {
  const auditorias: RegistroAuditoria[] = [];
  const eventos: EventoDominio[] = [];
  return {
    [TX]: tx,
    tenantId,
    usuarioId,
    auditorias,
    eventos,
    auditar: (r) => void auditorias.push(r),
    publicar: (e) => void eventos.push(e),
  };
}

/** Só para src/repositorios: a transação da unidade. */
export function transacaoDe(uow: UnidadeDeTrabalho): Tx {
  const tx = (uow as Partial<UnidadeInterna>)[TX];
  if (!tx) throw new Error('Unidade de trabalho inválida: escrita fora de executar().');
  return tx;
}
