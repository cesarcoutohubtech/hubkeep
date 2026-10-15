// Consumo do outbox (ADR-007): eventos de domínio gravados pela unit of work,
// processados depois do commit por um job com hk_worker, um tenant por
// transação. A rota de cron, o laço por todos os tenants e a política de
// backoff definitiva são da F0-09; aqui fica o núcleo que o convite (ADR-018)
// já precisa.
//
// - `for update skip locked`: duas execuções simultâneas não pegam o mesmo evento.
// - Só tipos com manipulador: evento sem consumidor fica pendente para quando
//   o consumidor existir, em vez de ser marcado como processado sem efeito.
// - Falha: tentativas + 1, erro registrado e disponivel_em empurrado (backoff).
import type { EventoPendente, Manipulador } from '@hubkeep/aplicacao';
import { sql } from 'kysely';
import type { AcessoBanco } from '../acesso';

export interface ResultadoOutbox {
  processados: number;
  falhas: number;
}

/** Atraso até a próxima tentativa: 30 s, 1 min, 2 min... até 1 h. */
export const atrasoDaTentativa = (tentativas: number): number =>
  Math.min(30 * 2 ** Math.max(tentativas - 1, 0), 3600);

export async function processarOutbox(
  banco: AcessoBanco,
  tenantId: string,
  manipuladores: Record<string, Manipulador>,
  opcoes: { limite?: number } = {},
): Promise<ResultadoOutbox> {
  const tipos = Object.keys(manipuladores);
  if (tipos.length === 0) return { processados: 0, falhas: 0 };

  return banco.withSistema({ tenantId }, async (tx) => {
    const pendentes = await tx
      .selectFrom('app.evento_dominio')
      .select(['id', 'tenant_id', 'tipo', 'registro_id', 'payload', 'tentativas'])
      .where('processado_em', 'is', null)
      .where('disponivel_em', '<=', sql<Date>`now()`)
      .where('tipo', 'in', tipos)
      .orderBy('criado_em')
      .limit(opcoes.limite ?? 50)
      .forUpdate()
      .skipLocked()
      .execute();

    const resultado: ResultadoOutbox = { processados: 0, falhas: 0 };
    for (const linha of pendentes) {
      const evento: EventoPendente = {
        id: linha.id,
        tenantId: linha.tenant_id,
        tipo: linha.tipo,
        registroId: linha.registro_id,
        payload: (linha.payload ?? {}) as Record<string, unknown>,
      };
      try {
        await manipuladores[linha.tipo]?.(evento);
        await tx
          .updateTable('app.evento_dominio')
          .set({ processado_em: sql`now()`, erro: null })
          .where('id', '=', linha.id)
          .execute();
        resultado.processados++;
      } catch (e) {
        const tentativas = linha.tentativas + 1;
        await tx
          .updateTable('app.evento_dominio')
          .set({
            tentativas,
            erro: (e as Error).message.slice(0, 1000),
            disponivel_em: sql`now() + make_interval(secs => ${atrasoDaTentativa(tentativas)})`,
          })
          .where('id', '=', linha.id)
          .execute();
        resultado.falhas++;
      }
    }
    return resultado;
  });
}
