// Aceite e reabertura da OS (fase 1a, C6), na unit of work, com auditoria e
// evento. A RLS decide por último (app_update de app.os e app.chamado,
// migração 0026): fora de quem abriu o chamado, com escrita no hotel, e da
// gestão do hotel, o UPDATE não acha linha (404). Toda gravação confere a
// versão (ADR-029). A reabertura não tem coluna própria: o motivo fica na
// auditoria e no evento.
import type { ReflexoNoChamado } from '@hubkeep/aplicacao';
import { sql } from 'kysely';
import { transacaoDe, type UnidadeDeTrabalho } from '../unidade-de-trabalho';
import { refletirNoChamado, semLinha } from './triagem';

async function decidirAceite(
  uow: UnidadeDeTrabalho,
  acao: 'aceitar' | 'reabrir',
  g: {
    osId: string;
    versao: number;
    situacaoId: string;
    motivo: string | null;
    chamado: ReflexoNoChamado;
  },
): Promise<{ versao: number; versaoDoChamado: number }> {
  const tx = transacaoDe(uow);
  const antes = await tx
    .selectFrom('app.os')
    .select(['estado', 'situacao_id', 'versao'])
    .where('id', '=', g.osId)
    .executeTakeFirst();
  const r = await tx
    .updateTable('app.os')
    .set({
      estado: acao === 'aceitar' ? 'aceita' : 'em_execucao',
      situacao_id: g.situacaoId,
      versao: sql<number>`versao + 1`,
      atualizado_em: sql`now()`,
    })
    .where('id', '=', g.osId)
    .where('versao', '=', g.versao)
    .returning(['hotel_id', 'chamado_id', 'versao'])
    .executeTakeFirst();
  if (!r) return semLinha(tx, 'app.os', g.osId, g.versao);
  const chamado = await refletirNoChamado(uow, g.chamado);
  uow.auditar({
    entidade: 'os',
    registroId: g.osId,
    acao,
    hotelId: r.hotel_id,
    antes,
    depois: {
      ...(g.motivo !== null ? { motivo: g.motivo } : {}),
      situacaoId: g.situacaoId,
      versao: r.versao,
      estadoDoChamado: g.chamado.estado,
    },
  });
  uow.publicar({
    tipo: acao === 'aceitar' ? 'os.aceita' : 'os.reaberta',
    entidade: 'os',
    registroId: g.osId,
    payload: {
      hotelId: r.hotel_id,
      chamadoId: r.chamado_id,
      ...(g.motivo !== null ? { motivo: g.motivo } : {}),
    },
  });
  return { versao: r.versao, versaoDoChamado: chamado.versao };
}

export const aceitarOs = (
  uow: UnidadeDeTrabalho,
  g: { osId: string; versao: number; situacaoId: string; chamado: ReflexoNoChamado },
) => decidirAceite(uow, 'aceitar', { ...g, motivo: null });

export const reabrirOs = (
  uow: UnidadeDeTrabalho,
  g: {
    osId: string;
    versao: number;
    situacaoId: string;
    motivo: string;
    chamado: ReflexoNoChamado;
  },
) => decidirAceite(uow, 'reabrir', g);
