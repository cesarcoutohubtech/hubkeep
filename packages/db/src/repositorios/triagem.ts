// Triagem e OS (fase 1a, C3), na unit of work, com auditoria e evento. A RLS
// decide por último (policies de app.os e app_update de app.chamado, migração
// 0022): fora dos papéis da triagem, o INSERT é recusado (42501) e o UPDATE
// não acha linha. Toda gravação confere a versão (ADR-029).
import type { MudancaNoChamado, ReflexoNoChamado } from '@hubkeep/aplicacao';
import { Conflito, NaoEncontrado, type Responsavel, conflitoDeVersao } from '@hubkeep/dominio';
import { sql } from 'kysely';
import { novoId } from '../ids';
import type { Tx } from '../conexao';
import { transacaoDe, type UnidadeDeTrabalho } from '../unidade-de-trabalho';

/** O índice os_uma_ativa_por_chamado recusou: outra triagem gerou a OS antes. */
function osEmAndamento(e: unknown): never {
  const { code, constraint } = e as { code?: string; constraint?: string };
  if (code === '23505' && constraint === 'os_uma_ativa_por_chamado') {
    throw new Conflito('os_em_andamento', 'O chamado já tem uma OS em andamento.');
  }
  throw e;
}

const colunasDoResponsavel = (r: Responsavel) =>
  r.tipo === 'tecnico'
    ? { tecnico_id: r.usuarioId, equipe_id: null }
    : { tecnico_id: null, equipe_id: r.equipeId };

/**
 * Sem linha no UPDATE: visível com outra versão é conflito (relido depois do
 * UPDATE, porque uma gravação simultânea pode ter terminado enquanto este
 * esperava a trava); invisível, ou visível sem escrita (RLS), é 404.
 */
export async function semLinha(
  tx: Tx,
  tabela: 'app.chamado' | 'app.os',
  id: string,
  versaoEsperada: number,
): Promise<never> {
  const atual = await tx
    .selectFrom(tabela)
    .select('versao')
    .where('id', '=', id)
    .executeTakeFirst();
  if (atual && atual.versao !== versaoEsperada) throw conflitoDeVersao(atual.versao);
  throw tabela === 'app.os'
    ? new NaoEncontrado('os_nao_encontrada', 'Ordem de serviço não encontrada.')
    : new NaoEncontrado('chamado_nao_encontrado', 'Chamado não encontrado.');
}

export async function refletirNoChamado(
  uow: UnidadeDeTrabalho,
  c: ReflexoNoChamado,
): Promise<{ hotelId: string; versao: number }> {
  const tx = transacaoDe(uow);
  const r = await tx
    .updateTable('app.chamado')
    .set({
      estado: c.estado,
      situacao_id: c.situacaoId,
      versao: sql<number>`versao + 1`,
      atualizado_em: sql`now()`,
    })
    .where('id', '=', c.id)
    .where('versao', '=', c.versao)
    .returning(['hotel_id', 'versao'])
    .executeTakeFirst();
  if (!r) return semLinha(tx, 'app.chamado', c.id, c.versao);
  return { hotelId: r.hotel_id, versao: r.versao };
}

export async function alterarChamadoNaTriagem(
  uow: UnidadeDeTrabalho,
  chamadoId: string,
  versaoEsperada: number,
  m: MudancaNoChamado,
): Promise<{ versao: number }> {
  const tx = transacaoDe(uow);
  const antes = await tx
    .selectFrom('app.chamado')
    .select(['estado', 'situacao_id', 'prioridade_id', 'versao'])
    .where('id', '=', chamadoId)
    .executeTakeFirst();
  const r = await tx
    .updateTable('app.chamado')
    .set({
      ...(m.estado !== undefined ? { estado: m.estado } : {}),
      ...(m.situacaoId !== undefined ? { situacao_id: m.situacaoId } : {}),
      ...(m.prioridadeId !== undefined ? { prioridade_id: m.prioridadeId } : {}),
      ...(m.motivoCancelamento !== undefined ? { motivo_cancelamento: m.motivoCancelamento } : {}),
      versao: sql<number>`versao + 1`,
      atualizado_em: sql`now()`,
    })
    .where('id', '=', chamadoId)
    .where('versao', '=', versaoEsperada)
    .returning(['hotel_id', 'versao'])
    .executeTakeFirst();
  if (!r) return semLinha(tx, 'app.chamado', chamadoId, versaoEsperada);
  uow.auditar({
    entidade: 'chamado',
    registroId: chamadoId,
    acao: m.acao,
    hotelId: r.hotel_id,
    antes,
    depois: { ...m, versao: r.versao },
  });
  const tipo = {
    triar: 'chamado.triado',
    priorizar: 'chamado.prioridade_alterada',
    cancelar: 'chamado.cancelado',
  }[m.acao];
  uow.publicar({
    tipo,
    entidade: 'chamado',
    registroId: chamadoId,
    payload: {
      hotelId: r.hotel_id,
      versao: r.versao,
      ...(m.prioridadeId !== undefined ? { prioridadeId: m.prioridadeId } : {}),
    },
  });
  return { versao: r.versao };
}

export async function gerarOs(
  uow: UnidadeDeTrabalho,
  g: { chamado: ReflexoNoChamado; hotelId: string; situacaoId: string; responsavel: Responsavel },
): Promise<{ id: string; versao: number; versaoDoChamado: number }> {
  if (!uow.usuarioId) throw new Error('Geração de OS exige usuário no contexto.');
  const id = novoId();
  // A OS antes do chamado: numa triagem simultânea, a segunda espera no
  // índice único e recebe os_em_andamento, em vez de gravar o chamado.
  await transacaoDe(uow)
    .insertInto('app.os')
    .values({
      id,
      tenant_id: uow.tenantId,
      hotel_id: g.hotelId,
      chamado_id: g.chamado.id,
      estado: 'atribuida',
      situacao_id: g.situacaoId,
      ...colunasDoResponsavel(g.responsavel),
      criado_por: uow.usuarioId,
    })
    .execute()
    .catch(osEmAndamento);
  const chamado = await refletirNoChamado(uow, g.chamado);
  uow.auditar({
    entidade: 'os',
    registroId: id,
    acao: 'gerar',
    hotelId: g.hotelId,
    depois: { chamadoId: g.chamado.id, responsavel: g.responsavel, situacaoId: g.situacaoId },
  });
  uow.publicar({
    tipo: 'os.atribuida',
    entidade: 'os',
    registroId: id,
    payload: {
      hotelId: g.hotelId,
      chamadoId: g.chamado.id,
      acao: 'gerar',
      responsavel: g.responsavel,
    },
  });
  return { id, versao: 1, versaoDoChamado: chamado.versao };
}

export async function reatribuirOs(
  uow: UnidadeDeTrabalho,
  g: { osId: string; versao: number; situacaoId: string; responsavel: Responsavel },
): Promise<{ versao: number }> {
  const tx = transacaoDe(uow);
  const antes = await tx
    .selectFrom('app.os')
    .select(['estado', 'situacao_id', 'tecnico_id', 'equipe_id', 'versao'])
    .where('id', '=', g.osId)
    .executeTakeFirst();
  const r = await tx
    .updateTable('app.os')
    .set({
      estado: 'atribuida',
      situacao_id: g.situacaoId,
      ...colunasDoResponsavel(g.responsavel),
      versao: sql<number>`versao + 1`,
      atualizado_em: sql`now()`,
    })
    .where('id', '=', g.osId)
    .where('versao', '=', g.versao)
    .returning(['hotel_id', 'chamado_id', 'versao'])
    .executeTakeFirst();
  if (!r) return semLinha(tx, 'app.os', g.osId, g.versao);
  uow.auditar({
    entidade: 'os',
    registroId: g.osId,
    acao: 'reatribuir',
    hotelId: r.hotel_id,
    antes,
    depois: { responsavel: g.responsavel, situacaoId: g.situacaoId, versao: r.versao },
  });
  uow.publicar({
    tipo: 'os.atribuida',
    entidade: 'os',
    registroId: g.osId,
    payload: {
      hotelId: r.hotel_id,
      chamadoId: r.chamado_id,
      acao: 'reatribuir',
      responsavel: g.responsavel,
    },
  });
  return { versao: r.versao };
}

export async function cancelarOs(
  uow: UnidadeDeTrabalho,
  g: {
    osId: string;
    versao: number;
    situacaoId: string;
    motivo: string;
    chamado: ReflexoNoChamado;
  },
): Promise<{ versao: number; versaoDoChamado: number }> {
  const tx = transacaoDe(uow);
  const r = await tx
    .updateTable('app.os')
    .set({
      estado: 'cancelada',
      situacao_id: g.situacaoId,
      motivo_cancelamento: g.motivo,
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
    acao: 'cancelar',
    hotelId: r.hotel_id,
    depois: { motivo: g.motivo, versao: r.versao, estadoDoChamado: g.chamado.estado },
  });
  uow.publicar({
    tipo: 'os.cancelada',
    entidade: 'os',
    registroId: g.osId,
    payload: { hotelId: r.hotel_id, chamadoId: r.chamado_id },
  });
  return { versao: r.versao, versaoDoChamado: chamado.versao };
}
