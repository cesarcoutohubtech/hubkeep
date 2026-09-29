// Situações e prioridades do tenant (fase 1a, C1; ADR-027), na unit of work,
// com auditoria e evento. A RLS decide por último: só o Admin do grupo grava.
import { NaoEncontrado } from '@hubkeep/dominio';
import { sql } from 'kysely';
import { novoId } from '../ids';
import { transacaoDe, type UnidadeDeTrabalho } from '../unidade-de-trabalho';

export async function criarSituacao(
  uow: UnidadeDeTrabalho,
  s: {
    entidade: 'chamado' | 'os';
    estado: string;
    chavePadrao: string | null;
    nomes: object;
    ordem: number;
    cor: string;
  },
): Promise<{ id: string }> {
  const id = novoId();
  await transacaoDe(uow)
    .insertInto('app.situacao')
    .values({
      id,
      tenant_id: uow.tenantId,
      entidade: s.entidade,
      estado: s.estado,
      chave_padrao: s.chavePadrao,
      nomes: JSON.stringify(s.nomes),
      ordem: s.ordem,
      cor: s.cor,
    })
    .execute();
  uow.auditar({ entidade: 'situacao', registroId: id, acao: 'criar', depois: s });
  uow.publicar({
    tipo: 'situacao.criada',
    entidade: 'situacao',
    registroId: id,
    payload: { entidade: s.entidade, estado: s.estado, chavePadrao: s.chavePadrao },
  });
  return { id };
}

export async function alterarSituacao(
  uow: UnidadeDeTrabalho,
  id: string,
  mudanca: { nomes: object; ordem: number; cor: string } | { ativa: boolean },
): Promise<void> {
  const tx = transacaoDe(uow);
  const antes = await tx
    .selectFrom('app.situacao')
    .select(['nomes', 'ordem', 'cor', 'ativa'])
    .where('id', '=', id)
    .executeTakeFirst();
  const valores =
    'ativa' in mudanca
      ? { ativa: mudanca.ativa }
      : { nomes: JSON.stringify(mudanca.nomes), ordem: mudanca.ordem, cor: mudanca.cor };
  const r = await tx
    .updateTable('app.situacao')
    .set({ ...valores, atualizado_em: sql`now()` })
    .where('id', '=', id)
    .returning(['id'])
    .executeTakeFirst();
  if (!r || !antes) throw new NaoEncontrado('situacao_nao_encontrada', 'Situação não encontrada.');
  const acao = 'ativa' in mudanca ? (mudanca.ativa ? 'reativar' : 'desativar') : 'alterar';
  uow.auditar({ entidade: 'situacao', registroId: id, acao, antes, depois: mudanca });
  uow.publicar({
    tipo: 'situacao.alterada',
    entidade: 'situacao',
    registroId: id,
    payload: { acao },
  });
}

export async function criarPrioridade(
  uow: UnidadeDeTrabalho,
  p: { chavePadrao: string | null; nomes: object; ordem: number; peso: number },
): Promise<{ id: string }> {
  const id = novoId();
  await transacaoDe(uow)
    .insertInto('app.prioridade')
    .values({
      id,
      tenant_id: uow.tenantId,
      chave_padrao: p.chavePadrao,
      nomes: JSON.stringify(p.nomes),
      ordem: p.ordem,
      peso: p.peso,
    })
    .execute();
  uow.auditar({ entidade: 'prioridade', registroId: id, acao: 'criar', depois: p });
  uow.publicar({
    tipo: 'prioridade.criada',
    entidade: 'prioridade',
    registroId: id,
    payload: { chavePadrao: p.chavePadrao },
  });
  return { id };
}

export async function alterarPrioridade(
  uow: UnidadeDeTrabalho,
  id: string,
  mudanca: { nomes: object; ordem: number; peso: number } | { ativa: boolean },
): Promise<void> {
  const tx = transacaoDe(uow);
  const antes = await tx
    .selectFrom('app.prioridade')
    .select(['nomes', 'ordem', 'peso', 'ativa'])
    .where('id', '=', id)
    .executeTakeFirst();
  const valores =
    'ativa' in mudanca
      ? { ativa: mudanca.ativa }
      : { nomes: JSON.stringify(mudanca.nomes), ordem: mudanca.ordem, peso: mudanca.peso };
  const r = await tx
    .updateTable('app.prioridade')
    .set({ ...valores, atualizado_em: sql`now()` })
    .where('id', '=', id)
    .returning(['id'])
    .executeTakeFirst();
  if (!r || !antes)
    throw new NaoEncontrado('prioridade_nao_encontrada', 'Prioridade não encontrada.');
  const acao = 'ativa' in mudanca ? (mudanca.ativa ? 'reativar' : 'desativar') : 'alterar';
  uow.auditar({ entidade: 'prioridade', registroId: id, acao, antes, depois: mudanca });
  uow.publicar({
    tipo: 'prioridade.alterada',
    entidade: 'prioridade',
    registroId: id,
    payload: { acao },
  });
}
