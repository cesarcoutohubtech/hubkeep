// Aceite e reabertura da OS (fase 1a, C6), na unit of work, com auditoria e
// evento. A RLS decide por último (app_update de app.os e app.chamado,
// migração 0026): fora de quem abriu o chamado, com escrita no hotel, e da
// gestão do hotel, o UPDATE não acha linha (404). Toda gravação confere a
// versão (ADR-029). A reabertura grava o motivo na OS (motivo_reabertura, o
// último; o histórico fica na auditoria e no evento) e, com o equipamento
// parado, abre a parada do ativo no mesmo chamado, na mesma unit of work.
import type { ReflexoNoChamado } from '@hubkeep/aplicacao';
import { sql } from 'kysely';
import { transacaoDe, type UnidadeDeTrabalho } from '../unidade-de-trabalho';
import type { EstadoDaOs } from '@hubkeep/dominio';
import { pararNaAbertura } from './paradas';
import { registrarTransicao } from './transicoes';
import { refletirNoChamado, semLinha } from './triagem';

async function decidirAceite(
  uow: UnidadeDeTrabalho,
  acao: 'aceitar' | 'reabrir',
  g: {
    osId: string;
    versao: number;
    de: EstadoDaOs;
    situacaoId: string;
    motivo: string | null;
    chamado: ReflexoNoChamado;
  },
): Promise<{ versao: number; versaoDoChamado: number }> {
  const tx = transacaoDe(uow);
  const para = acao === 'aceitar' ? 'aceita' : 'em_execucao';
  const antes = await tx
    .selectFrom('app.os')
    .select(['estado', 'situacao_id', 'motivo_reabertura', 'versao'])
    .where('id', '=', g.osId)
    .executeTakeFirst();
  const r = await tx
    .updateTable('app.os')
    .set({
      estado: para,
      situacao_id: g.situacaoId,
      ...(g.motivo !== null ? { motivo_reabertura: g.motivo } : {}),
      versao: sql<number>`versao + 1`,
      atualizado_em: sql`now()`,
    })
    .where('id', '=', g.osId)
    .where('versao', '=', g.versao)
    .returning(['hotel_id', 'chamado_id', 'versao'])
    .executeTakeFirst();
  if (!r) return semLinha(tx, 'app.os', g.osId, g.versao);
  await registrarTransicao(uow, { osId: g.osId, hotelId: r.hotel_id, acao, de: g.de, para });
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
  g: {
    osId: string;
    versao: number;
    de: EstadoDaOs;
    situacaoId: string;
    chamado: ReflexoNoChamado;
  },
) => decidirAceite(uow, 'aceitar', { ...g, motivo: null });

export async function reabrirOs(
  uow: UnidadeDeTrabalho,
  g: {
    osId: string;
    versao: number;
    de: EstadoDaOs;
    situacaoId: string;
    motivo: string;
    chamado: ReflexoNoChamado;
    parada: { hotelId: string; ativoId: string; inicio: Date } | null;
  },
): Promise<{ versao: number; versaoDoChamado: number; paradaId: string | null }> {
  const r = await decidirAceite(uow, 'reabrir', g);
  // A parada encerrada não reabre: nasce outra, no mesmo chamado e na OS reaberta.
  const parada = g.parada
    ? await pararNaAbertura(uow, { ...g.parada, chamadoId: g.chamado.id, osId: g.osId })
    : null;
  return { ...r, paradaId: parada?.id ?? null };
}
