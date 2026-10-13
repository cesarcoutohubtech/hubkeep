// Triagem e OS (fase 1a, C3), na unit of work, com auditoria e evento. A RLS
// decide por último (policies de app.os e app_update de app.chamado, migração
// 0022): fora dos papéis da triagem, o INSERT é recusado (42501) e o UPDATE
// não acha linha. Toda gravação confere a versão (ADR-029). Na I4, a OS
// guarda quem executa (equipe interna ou fornecedor do grupo), o chamado, o
// impacto no hóspede, e o cancelamento do chamado libera a UH. Na 1c
// (ADR-042), a troca de prioridade grava os prazos refeitos, com os de antes
// na auditoria. No arrendado (ADR-045), a OS guarda a marca de quem responde
// por ela; o aviso ao locador grava a hora, entra na auditoria (a linha do
// tempo) e publica os.locador_avisado, uma vez por OS.
import type { MudancaNoChamado, ReflexoNoChamado } from '@hubkeep/aplicacao';
import {
  Conflito,
  type EstadoDaOs,
  NaoEncontrado,
  type QuemExecuta,
  type Responsavel,
  type ResponsavelDoArrendamento,
  conflitoDeVersao,
} from '@hubkeep/dominio';
import { sql } from 'kysely';
import { novoId } from '../ids';
import type { Tx } from '../conexao';
import { transacaoDe, type UnidadeDeTrabalho } from '../unidade-de-trabalho';
import { agoraNaGravacao, datasDaCriacao } from './instante-do-roteiro';
import { registrarTransicao } from './transicoes';
import { liberarUhDoChamadoCancelado } from './uh-indisponivel';

/** O índice os_uma_ativa_por_chamado recusou: outra triagem gerou a OS antes. */
function osEmAndamento(e: unknown): never {
  const { code, constraint } = e as { code?: string; constraint?: string };
  if (code === '23505' && constraint === 'os_uma_ativa_por_chamado') {
    throw new Conflito('os_em_andamento', 'O chamado já tem uma OS em andamento.');
  }
  throw e;
}

/**
 * A hora do aviso é sempre a do banco, como a da auditoria e a do outbox: diz
 * quando o aviso saiu de fato, também na montagem com o relógio do roteiro.
 */
const avisadoAgora = sql<Date>`now()`;

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
      atualizado_em: agoraNaGravacao(uow),
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
    .select([
      'estado',
      'situacao_id',
      'prioridade_id',
      'categoria_id',
      'impacto_hospede',
      'prazo_atendimento',
      'prazo_solucao',
      'versao',
    ])
    .where('id', '=', chamadoId)
    .executeTakeFirst();
  const r = await tx
    .updateTable('app.chamado')
    .set({
      ...(m.estado !== undefined ? { estado: m.estado } : {}),
      ...(m.situacaoId !== undefined ? { situacao_id: m.situacaoId } : {}),
      ...(m.prioridadeId !== undefined ? { prioridade_id: m.prioridadeId } : {}),
      ...(m.categoriaId !== undefined ? { categoria_id: m.categoriaId } : {}),
      ...(m.motivoCancelamento !== undefined ? { motivo_cancelamento: m.motivoCancelamento } : {}),
      ...(m.impactoHospede !== undefined ? { impacto_hospede: m.impactoHospede } : {}),
      ...(m.prazoAtendimento !== undefined ? { prazo_atendimento: m.prazoAtendimento } : {}),
      ...(m.prazoSolucao !== undefined ? { prazo_solucao: m.prazoSolucao } : {}),
      versao: sql<number>`versao + 1`,
      atualizado_em: agoraNaGravacao(uow),
    })
    .where('id', '=', chamadoId)
    .where('versao', '=', versaoEsperada)
    .returning(['hotel_id', 'versao'])
    .executeTakeFirst();
  if (!r) return semLinha(tx, 'app.chamado', chamadoId, versaoEsperada);
  const { encerrarUhEm, ...mudanca } = m;
  uow.auditar({
    entidade: 'chamado',
    registroId: chamadoId,
    acao: m.acao,
    hotelId: r.hotel_id,
    antes,
    depois: { ...mudanca, versao: r.versao },
  });
  if (encerrarUhEm !== undefined) {
    await liberarUhDoChamadoCancelado(uow, {
      chamadoId,
      hotelId: r.hotel_id,
      fim: encerrarUhEm,
    });
  }
  const tipo = {
    triar: 'chamado.triado',
    priorizar: 'chamado.prioridade_alterada',
    categorizar: 'chamado.categoria_alterada',
    cancelar: 'chamado.cancelado',
    informar_impacto: 'chamado.impacto_informado',
  }[m.acao];
  uow.publicar({
    tipo,
    entidade: 'chamado',
    registroId: chamadoId,
    payload: {
      hotelId: r.hotel_id,
      versao: r.versao,
      ...(m.prioridadeId !== undefined ? { prioridadeId: m.prioridadeId } : {}),
      ...(m.categoriaId !== undefined ? { categoriaId: m.categoriaId } : {}),
      ...(m.impactoHospede !== undefined ? { impactoHospede: m.impactoHospede } : {}),
    },
  });
  return { versao: r.versao };
}

export async function gerarOs(
  uow: UnidadeDeTrabalho,
  g: {
    chamado: ReflexoNoChamado;
    hotelId: string;
    localId: string;
    chamadoAbertoPor: string;
    situacaoId: string;
    responsavel: Responsavel;
    execucao: QuemExecuta;
    arrendamento: ResponsavelDoArrendamento | null;
    avisarLocador: boolean;
  },
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
      local_id: g.localId,
      chamado_aberto_por: g.chamadoAbertoPor,
      estado: 'atribuida',
      situacao_id: g.situacaoId,
      ...colunasDoResponsavel(g.responsavel),
      executado_por: g.execucao.executadoPor,
      fornecedor_id: g.execucao.fornecedorId,
      responsavel_arrendamento: g.arrendamento,
      locador_avisado_em: g.avisarLocador ? avisadoAgora : null,
      criado_por: uow.usuarioId,
      ...datasDaCriacao(uow),
    })
    .execute()
    .catch(osEmAndamento);
  await registrarTransicao(uow, {
    osId: id,
    hotelId: g.hotelId,
    acao: 'gerar',
    de: null,
    para: 'atribuida',
  });
  const chamado = await refletirNoChamado(uow, g.chamado);
  uow.auditar({
    entidade: 'os',
    registroId: id,
    acao: 'gerar',
    hotelId: g.hotelId,
    depois: {
      chamadoId: g.chamado.id,
      responsavel: g.responsavel,
      situacaoId: g.situacaoId,
      ...g.execucao,
      ...(g.arrendamento === null ? {} : { responsavelArrendamento: g.arrendamento }),
    },
  });
  if (g.avisarLocador)
    avisarLocador(uow, { osId: id, hotelId: g.hotelId, chamadoId: g.chamado.id });
  uow.publicar({
    tipo: 'os.atribuida',
    entidade: 'os',
    registroId: id,
    payload: {
      hotelId: g.hotelId,
      chamadoId: g.chamado.id,
      acao: 'gerar',
      responsavel: g.responsavel,
      ...g.execucao,
    },
  });
  return { id, versao: 1, versaoDoChamado: chamado.versao };
}

/**
 * O aviso ao locador (ADR-045, decisão 8): a auditoria leva à linha do tempo
 * da OS, e o evento, ao e-mail do proprietário, quando a comunicação (item 5
 * da 1c) tiver o manipulador. Quem chama já gravou locador_avisado_em.
 */
function avisarLocador(
  uow: UnidadeDeTrabalho,
  a: { osId: string; hotelId: string; chamadoId: string },
): void {
  uow.auditar({
    entidade: 'os',
    registroId: a.osId,
    acao: 'avisar_locador',
    hotelId: a.hotelId,
    depois: { chamadoId: a.chamadoId },
  });
  uow.publicar({
    tipo: 'os.locador_avisado',
    entidade: 'os',
    registroId: a.osId,
    payload: { hotelId: a.hotelId, chamadoId: a.chamadoId },
  });
}

/**
 * Ajusta a marca do arrendamento (ADR-045), com a versão conferida e o motivo
 * na auditoria. Com o aviso, a hora fica gravada mesmo que a marca volte.
 */
export async function ajustarArrendamento(
  uow: UnidadeDeTrabalho,
  g: {
    osId: string;
    versao: number;
    arrendamento: ResponsavelDoArrendamento;
    motivo: string;
    avisarLocador: boolean;
  },
): Promise<{ versao: number }> {
  const tx = transacaoDe(uow);
  const antes = await tx
    .selectFrom('app.os')
    .select(['responsavel_arrendamento', 'versao'])
    .where('id', '=', g.osId)
    .executeTakeFirst();
  const r = await tx
    .updateTable('app.os')
    .set({
      responsavel_arrendamento: g.arrendamento,
      ...(g.avisarLocador ? { locador_avisado_em: avisadoAgora } : {}),
      versao: sql<number>`versao + 1`,
      atualizado_em: agoraNaGravacao(uow),
    })
    .where('id', '=', g.osId)
    .where('versao', '=', g.versao)
    .returning(['hotel_id', 'chamado_id', 'versao'])
    .executeTakeFirst();
  if (!r) return semLinha(tx, 'app.os', g.osId, g.versao);
  uow.auditar({
    entidade: 'os',
    registroId: g.osId,
    acao: 'ajustar_arrendamento',
    hotelId: r.hotel_id,
    antes: antes && {
      responsavelArrendamento: antes.responsavel_arrendamento,
      versao: antes.versao,
    },
    depois: { responsavelArrendamento: g.arrendamento, motivo: g.motivo, versao: r.versao },
  });
  uow.publicar({
    tipo: 'os.arrendamento_ajustado',
    entidade: 'os',
    registroId: g.osId,
    payload: {
      hotelId: r.hotel_id,
      chamadoId: r.chamado_id,
      responsavelArrendamento: g.arrendamento,
    },
  });
  if (g.avisarLocador) {
    avisarLocador(uow, { osId: g.osId, hotelId: r.hotel_id, chamadoId: r.chamado_id });
  }
  return { versao: r.versao };
}

/** Corrige quem executa a OS (I4), com a versão conferida. */
export async function definirQuemExecuta(
  uow: UnidadeDeTrabalho,
  g: { osId: string; versao: number; execucao: QuemExecuta },
): Promise<{ versao: number }> {
  const tx = transacaoDe(uow);
  const antes = await tx
    .selectFrom('app.os')
    .select(['executado_por', 'fornecedor_id', 'versao'])
    .where('id', '=', g.osId)
    .executeTakeFirst();
  const r = await tx
    .updateTable('app.os')
    .set({
      executado_por: g.execucao.executadoPor,
      fornecedor_id: g.execucao.fornecedorId,
      versao: sql<number>`versao + 1`,
      atualizado_em: agoraNaGravacao(uow),
    })
    .where('id', '=', g.osId)
    .where('versao', '=', g.versao)
    .returning(['hotel_id', 'chamado_id', 'versao'])
    .executeTakeFirst();
  if (!r) return semLinha(tx, 'app.os', g.osId, g.versao);
  uow.auditar({
    entidade: 'os',
    registroId: g.osId,
    acao: 'definir_executor',
    hotelId: r.hotel_id,
    antes,
    depois: { ...g.execucao, versao: r.versao },
  });
  uow.publicar({
    tipo: 'os.executor_definido',
    entidade: 'os',
    registroId: g.osId,
    payload: { hotelId: r.hotel_id, chamadoId: r.chamado_id, ...g.execucao },
  });
  return { versao: r.versao };
}

export async function reatribuirOs(
  uow: UnidadeDeTrabalho,
  g: {
    osId: string;
    versao: number;
    de: EstadoDaOs;
    situacaoId: string;
    responsavel: Responsavel;
  },
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
      atualizado_em: agoraNaGravacao(uow),
    })
    .where('id', '=', g.osId)
    .where('versao', '=', g.versao)
    .returning(['hotel_id', 'chamado_id', 'versao'])
    .executeTakeFirst();
  if (!r) return semLinha(tx, 'app.os', g.osId, g.versao);
  await registrarTransicao(uow, {
    osId: g.osId,
    hotelId: r.hotel_id,
    acao: 'reatribuir',
    de: g.de,
    para: 'atribuida',
  });
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
    de: EstadoDaOs;
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
      atualizado_em: agoraNaGravacao(uow),
    })
    .where('id', '=', g.osId)
    .where('versao', '=', g.versao)
    .returning(['hotel_id', 'chamado_id', 'versao'])
    .executeTakeFirst();
  if (!r) return semLinha(tx, 'app.os', g.osId, g.versao);
  await registrarTransicao(uow, {
    osId: g.osId,
    hotelId: r.hotel_id,
    acao: 'cancelar',
    de: g.de,
    para: 'cancelada',
  });
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
