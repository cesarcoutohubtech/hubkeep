// Monitor de SLA (fase 1c; ADR-043), na unit of work do hk_worker, um tenant
// por transação: os chamados em curso com prazo, com o que o domínio precisa
// (a OS que já existiu, a pausa em curso e os avisos já emitidos para os
// prazos de agora), e o aviso gravado uma vez por chamado, tipo e prazo, com
// o evento chamado.sla_alerta no outbox. O aviso não vai para a auditoria: a
// própria tabela, só de inserção, é o registro.
import type { SessaoDoMonitor } from '@hubkeep/aplicacao';
import { type EstadoDoChamado, ehMotivoDePausa, ehTipoDeAlertaDeSla } from '@hubkeep/dominio';
import { sql } from 'kysely';
import { novoId } from '../ids';
import { dadosDoCalendarioNaTransacao, niveisDaPoliticaNaTransacao } from '../leituras-do-hotel';
import { transacaoDe, type UnidadeDeTrabalho } from '../unidade-de-trabalho';

const ESTADOS_EM_CURSO = ['aberto', 'em_triagem', 'em_execucao'] as const;

export function sessaoDoMonitorDeSla(uow: UnidadeDeTrabalho): SessaoDoMonitor {
  const tx = transacaoDe(uow);
  return {
    chamadosEmCurso: async () =>
      (
        await tx
          .selectFrom('app.chamado as c')
          .select([
            'c.id',
            'c.hotel_id',
            'c.estado',
            'c.prioridade_id',
            'c.categoria_id',
            'c.politica_aplicada',
            'c.prazo_atendimento',
            'c.prazo_solucao',
            (eb) =>
              eb
                .exists(
                  eb
                    .selectFrom('app.os as o')
                    .select('o.id')
                    .whereRef('o.hotel_id', '=', 'c.hotel_id')
                    .whereRef('o.chamado_id', '=', 'c.id'),
                )
                .as('ja_teve_os'),
            (eb) =>
              eb
                .exists(
                  eb
                    .selectFrom('app.os as o')
                    .select('o.id')
                    .whereRef('o.hotel_id', '=', 'c.hotel_id')
                    .whereRef('o.chamado_id', '=', 'c.id')
                    .where('o.estado', '=', 'pausada'),
                )
                .as('os_pausada'),
            sql<string | null>`(select t.motivo_pausa from app.os o
                    join app.os_transicao t on t.hotel_id = o.hotel_id and t.os_id = o.id
                    where o.hotel_id = c.hotel_id and o.chamado_id = c.id
                      and o.estado = 'pausada' and t.acao = 'pausar'
                    order by t.quando desc, t.id desc limit 1)`.as('motivo_pausa'),
            sql<string[] | null>`(select array_agg(a.tipo order by a.tipo) from app.sla_alerta a
                    where a.hotel_id = c.hotel_id and a.chamado_id = c.id
                      and ((a.tipo in ('atendimento_em_risco', 'atendimento_vencido')
                            and a.prazo = c.prazo_atendimento)
                        or (a.tipo in ('solucao_em_risco', 'solucao_vencida')
                            and a.prazo = c.prazo_solucao)))`.as('emitidos'),
          ])
          .where('c.estado', 'in', ESTADOS_EM_CURSO)
          .where((eb) =>
            eb.or([
              eb('c.prazo_atendimento', 'is not', null),
              eb('c.prazo_solucao', 'is not', null),
            ]),
          )
          .orderBy('c.id')
          .execute()
      ).map((c) => ({
        id: c.id,
        hotelId: c.hotel_id,
        estado: c.estado as EstadoDoChamado,
        prioridadeId: c.prioridade_id,
        categoriaId: c.categoria_id,
        politicaAplicada: c.politica_aplicada,
        prazoAtendimento: c.prazo_atendimento,
        prazoSolucao: c.prazo_solucao,
        jaTeveOs: Boolean(c.ja_teve_os),
        pausaEmCurso: c.os_pausada
          ? { motivo: ehMotivoDePausa(c.motivo_pausa) ? c.motivo_pausa : null }
          : null,
        emitidos: (c.emitidos ?? []).filter(ehTipoDeAlertaDeSla),
      })),
    prioridades: async () =>
      (await tx.selectFrom('app.prioridade').select(['id', 'chave_padrao', 'peso']).execute()).map(
        (p) => ({ id: p.id, chavePadrao: p.chave_padrao, peso: p.peso }),
      ),
    politica: (hotelId, chave) => niveisDaPoliticaNaTransacao(tx, hotelId, chave),
    calendario: (hotelId) => dadosDoCalendarioNaTransacao(tx, hotelId),
    emitir: async (a) => {
      const r = await tx
        .insertInto('app.sla_alerta')
        .values({
          id: novoId(),
          tenant_id: uow.tenantId,
          hotel_id: a.hotelId,
          chamado_id: a.chamadoId,
          tipo: a.tipo,
          prazo: a.prazo,
        })
        .onConflict((oc) => oc.columns(['chamado_id', 'tipo', 'prazo']).doNothing())
        .returning('id')
        .executeTakeFirst();
      if (!r) return false;
      uow.publicar({
        tipo: 'chamado.sla_alerta',
        entidade: 'chamado',
        registroId: a.chamadoId,
        payload: {
          hotelId: a.hotelId,
          tipo: a.tipo,
          nivel: a.nivel,
          prazo: a.prazo.toISOString(),
          destinatarios: [...a.destinatarios],
        },
      });
      return true;
    },
  };
}
