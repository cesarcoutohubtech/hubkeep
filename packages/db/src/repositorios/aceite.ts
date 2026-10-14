// Aceite e reabertura da OS (fase 1a, C6), na unit of work, com auditoria e
// evento. A RLS decide por último (app_update de app.os e app.chamado,
// migração 0026): fora de quem abriu o chamado, com escrita no hotel, e da
// gestão do hotel, o UPDATE não acha linha (404). Toda gravação confere a
// versão (ADR-029). A reabertura grava o motivo na OS (motivo_reabertura, o
// último; o histórico fica na auditoria e no evento) e, com o equipamento
// parado, abre a parada do ativo no mesmo chamado, na mesma unit of work. O
// aceite grava o custo informado (I4), quando vem, e os três códigos de
// falha, causa e solução (I6), quando quem aceita os manda. Com a assinatura
// (I8), o anexo é registrado antes, na mesma unit of work, e a OS guarda o id
// (FK para um anexo da própria OS, migração 0041); sem ela, a OS fica sem
// (a de um aceite anterior, antes da reabertura, fica no anexo e na auditoria).
import type { AssinaturaDoAceite, ReflexoNoChamado } from '@hubkeep/aplicacao';
import { sql } from 'kysely';
import { transacaoDe, type UnidadeDeTrabalho } from '../unidade-de-trabalho';
import type { CodigosDaOs, EstadoDaOs } from '@hubkeep/dominio';
import { registrarAnexo } from './anexos';
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
    /** null na preventiva, que não tem chamado (PV3c). */
    chamado: ReflexoNoChamado | null;
    /** Só no aceite (I4); null: não informado. */
    custoInformado?: number | null;
    /** Só no aceite (I6); null: ficam os da OS. */
    codigos?: CodigosDaOs | null;
    /** Só no aceite (I8): o anexo da assinatura; null: sem assinatura. */
    assinaturaId?: string | null;
  },
): Promise<{ versao: number; versaoDoChamado: number | null }> {
  const tx = transacaoDe(uow);
  const custo = g.custoInformado ?? null;
  const codigos = g.codigos ?? null;
  const assinaturaId = g.assinaturaId ?? null;
  const para = acao === 'aceitar' ? 'aceita' : 'em_execucao';
  const antes = await tx
    .selectFrom('app.os')
    .select([
      'estado',
      'situacao_id',
      'motivo_reabertura',
      'custo_informado',
      'codigo_falha_id',
      'codigo_causa_id',
      'codigo_solucao_id',
      'assinatura_aceite_id',
      'versao',
    ])
    .where('id', '=', g.osId)
    .executeTakeFirst();
  const r = await tx
    .updateTable('app.os')
    .set({
      estado: para,
      situacao_id: g.situacaoId,
      ...(g.motivo !== null ? { motivo_reabertura: g.motivo } : {}),
      ...(custo !== null ? { custo_informado: custo.toFixed(2) } : {}),
      ...(codigos !== null
        ? {
            codigo_falha_id: codigos.falhaId,
            codigo_causa_id: codigos.causaId,
            codigo_solucao_id: codigos.solucaoId,
          }
        : {}),
      ...(acao === 'aceitar' ? { assinatura_aceite_id: assinaturaId } : {}),
      versao: sql<number>`versao + 1`,
      atualizado_em: sql`now()`,
    })
    .where('id', '=', g.osId)
    .where('versao', '=', g.versao)
    .returning(['hotel_id', 'chamado_id', 'versao'])
    .executeTakeFirst();
  if (!r) return semLinha(tx, 'app.os', g.osId, g.versao);
  await registrarTransicao(uow, { osId: g.osId, hotelId: r.hotel_id, acao, de: g.de, para });
  const chamado = g.chamado ? await refletirNoChamado(uow, g.chamado) : null;
  uow.auditar({
    entidade: 'os',
    registroId: g.osId,
    acao,
    hotelId: r.hotel_id,
    antes,
    depois: {
      ...(g.motivo !== null ? { motivo: g.motivo } : {}),
      ...(custo !== null ? { custoInformado: custo } : {}),
      ...(codigos !== null ? { codigos } : {}),
      ...(assinaturaId !== null ? { assinaturaId } : {}),
      situacaoId: g.situacaoId,
      versao: r.versao,
      estadoDoChamado: g.chamado?.estado ?? null,
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
      ...(custo !== null ? { custoInformado: custo } : {}),
      ...(assinaturaId !== null ? { assinaturaId } : {}),
    },
  });
  return { versao: r.versao, versaoDoChamado: chamado?.versao ?? null };
}

export async function aceitarOs(
  uow: UnidadeDeTrabalho,
  g: {
    osId: string;
    versao: number;
    de: EstadoDaOs;
    situacaoId: string;
    /** null na preventiva, que não tem chamado (PV3c). */
    chamado: ReflexoNoChamado | null;
    custoInformado: number | null;
    codigos: CodigosDaOs | null;
    assinatura: AssinaturaDoAceite | null;
  },
): Promise<{ versao: number; versaoDoChamado: number | null }> {
  const { assinatura, ...resto } = g;
  const anexo = assinatura
    ? await registrarAnexo(
        uow,
        {
          hotelId: assinatura.hotelId,
          entidade: 'os',
          registroId: g.osId,
          caminho: assinatura.caminho,
          miniaturaCaminho: null,
          tipo: 'image/png',
          nome: null,
          momento: null,
        },
        { assinatura: true },
      )
    : null;
  return decidirAceite(uow, 'aceitar', { ...resto, motivo: null, assinaturaId: anexo?.id ?? null });
}

export async function reabrirOs(
  uow: UnidadeDeTrabalho,
  g: {
    osId: string;
    versao: number;
    de: EstadoDaOs;
    situacaoId: string;
    motivo: string;
    /** null na preventiva, que não tem chamado (PV3c). */
    chamado: ReflexoNoChamado | null;
    parada: { hotelId: string; ativoId: string; inicio: Date } | null;
  },
): Promise<{ versao: number; versaoDoChamado: number | null; paradaId: string | null }> {
  const r = await decidirAceite(uow, 'reabrir', g);
  // A parada encerrada não reabre: nasce outra, no mesmo chamado e na OS reaberta.
  // A preventiva não tem chamado nem parada (o caso de uso recusa antes).
  const parada =
    g.parada && g.chamado
      ? await pararNaAbertura(uow, { ...g.parada, chamadoId: g.chamado.id, osId: g.osId })
      : null;
  return { ...r, paradaId: parada?.id ?? null };
}
