// Avisos de SLA em aberto (fase 1c; ADR-043, M4). Só leitura, com
// withContext: a RLS de app.chamado decide que chamados o usuário lê, e a de
// app.sla_alerta só mostra os avisos à gestão do hotel (migração 0044). Os
// chamados em curso com algum prazo vêm com os avisos gravados; o domínio
// decide quais ainda estão em aberto (avisosEmAberto). A pausa em curso vem
// como no monitor (repositorios/monitor-sla.ts): a OS pausada e o motivo da
// última pausa, para a aplicação saber se o relógio parou.
import type { ChamadoComAvisos, PortaAvisosDeSla } from '@hubkeep/aplicacao';
import { type EstadoDoChamado, ehMotivoDePausa, ehTipoDeAlertaDeSla } from '@hubkeep/dominio';
import { sql } from 'kysely';
import type { AcessoBanco } from './acesso';
import type { Tx } from './conexao';

const ESTADOS_EM_CURSO = ['aberto', 'em_triagem', 'em_execucao'] as const;

type Linha = {
  id: string;
  hotel_id: string;
  descricao: string;
  estado: string;
  prioridade_id: string | null;
  categoria_id: string | null;
  politica_aplicada: unknown;
  os_pausada: boolean;
  motivo_pausa: string | null;
  prazo_atendimento: Date | null;
  prazo_solucao: Date | null;
  ja_teve_os: boolean;
  gravados: { tipo: string; prazo: string }[] | null;
};

const paraChamado = (c: Linha): ChamadoComAvisos => ({
  id: c.id,
  hotelId: c.hotel_id,
  descricao: c.descricao,
  estado: c.estado as EstadoDoChamado,
  prioridadeId: c.prioridade_id,
  categoriaId: c.categoria_id,
  politicaAplicada: c.politica_aplicada,
  pausaEmCurso: c.os_pausada
    ? { motivo: ehMotivoDePausa(c.motivo_pausa) ? c.motivo_pausa : null }
    : null,
  jaTeveOs: c.ja_teve_os,
  prazoAtendimento: c.prazo_atendimento,
  prazoSolucao: c.prazo_solucao,
  gravados: (c.gravados ?? []).flatMap((g) =>
    ehTipoDeAlertaDeSla(g.tipo) ? [{ tipo: g.tipo, prazo: new Date(g.prazo) }] : [],
  ),
});

const chamados = (tx: Tx) =>
  tx.selectFrom('app.chamado as c').select([
    'c.id',
    'c.hotel_id',
    'c.descricao',
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
    sql<{ tipo: string; prazo: string }[] | null>`(select json_agg(json_build_object(
              'tipo', a.tipo, 'prazo', a.prazo) order by a.tipo, a.prazo)
            from app.sla_alerta a
            where a.hotel_id = c.hotel_id and a.chamado_id = c.id)`.as('gravados'),
  ]);

export function criarPortaAvisosDeSla(banco: AcessoBanco): PortaAvisosDeSla {
  return {
    hotel: (ctx, hotelId) =>
      banco.withContext(ctx, async (tx) => {
        const h = await tx
          .selectFrom('app.hotel')
          .select(['id', 'bandeira_id'])
          .where('id', '=', hotelId)
          .executeTakeFirst();
        return h ? { id: h.id, bandeiraId: h.bandeira_id } : null;
      }),
    chamadosDoHotel: (ctx, hotelId) =>
      banco.withContext(ctx, async (tx) =>
        (
          await chamados(tx)
            .where('c.hotel_id', '=', hotelId)
            .where('c.estado', 'in', ESTADOS_EM_CURSO)
            .where((eb) =>
              eb.or([
                eb('c.prazo_atendimento', 'is not', null),
                eb('c.prazo_solucao', 'is not', null),
              ]),
            )
            .execute()
        ).map((c) => paraChamado(c as Linha)),
      ),
    chamado: (ctx, chamadoId) =>
      banco.withContext(ctx, async (tx) => {
        const c = await chamados(tx)
          .innerJoin('app.hotel as h', 'h.id', 'c.hotel_id')
          .select('h.bandeira_id')
          .where('c.id', '=', chamadoId)
          .executeTakeFirst();
        return c ? { ...paraChamado(c as Linha), bandeiraId: c.bandeira_id } : null;
      }),
  };
}
