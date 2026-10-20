// Pacote da bandeira (fase 1b, PB1; migração 0059): os planos do pacote, na
// unit of work, com auditoria e evento. A RLS decide por último: só o Admin
// do grupo grava (o INSERT de outro papel é recusado com 42501 e o UPDATE não
// acha linha). A bandeira não muda depois de criada (sem GRANT de UPDATE).
import type { DadosDoPlanoPadrao, MudancaDePlanoPadrao } from '@hubkeep/aplicacao';
import { NaoEncontrado, conflitoDeVersao } from '@hubkeep/dominio';
import { sql } from 'kysely';
import { novoId } from '../ids';
import { transacaoDe, type UnidadeDeTrabalho } from '../unidade-de-trabalho';

const colunasDeDados = (d: DadosDoPlanoPadrao) => ({
  categoria_id: d.categoriaId,
  nome: d.nome,
  intervalo: d.intervalo,
  unidade: d.unidade,
  checklist_modelo_id: d.checklistModeloId,
});

export async function criarPlanoPadrao(
  uow: UnidadeDeTrabalho,
  d: DadosDoPlanoPadrao & { bandeiraId: string | null },
): Promise<{ id: string }> {
  const id = novoId();
  await transacaoDe(uow)
    .insertInto('app.plano_padrao')
    .values({ id, tenant_id: uow.tenantId, bandeira_id: d.bandeiraId, ...colunasDeDados(d) })
    .execute();
  uow.auditar({ entidade: 'plano_padrao', registroId: id, acao: 'criar', depois: d });
  uow.publicar({
    tipo: 'plano_padrao.criado',
    entidade: 'plano_padrao',
    registroId: id,
    payload: { bandeiraId: d.bandeiraId, categoriaId: d.categoriaId },
  });
  return { id };
}

export async function alterarPlanoPadrao(
  uow: UnidadeDeTrabalho,
  id: string,
  versaoEsperada: number,
  mudanca: MudancaDePlanoPadrao,
): Promise<{ versao: number }> {
  const tx = transacaoDe(uow);
  const antes = await tx
    .selectFrom('app.plano_padrao')
    .select([
      'categoria_id',
      'nome',
      'intervalo',
      'unidade',
      'checklist_modelo_id',
      'ativa',
      'versao',
    ])
    .where('id', '=', id)
    .executeTakeFirst();
  const valores = 'ativa' in mudanca ? { ativa: mudanca.ativa } : colunasDeDados(mudanca);
  const r = await tx
    .updateTable('app.plano_padrao')
    .set({ ...valores, versao: sql<number>`versao + 1`, atualizado_em: sql`now()` })
    .where('id', '=', id)
    .where('versao', '=', versaoEsperada)
    .returning('versao')
    .executeTakeFirst();
  if (!r) {
    // Visível e com outra versão: alguém gravou antes (ADR-029). Sem linha
    // visível ou gravável (RLS), é "não encontrado".
    const atual = await tx
      .selectFrom('app.plano_padrao')
      .select('versao')
      .where('id', '=', id)
      .executeTakeFirst();
    if (atual && atual.versao !== versaoEsperada) throw conflitoDeVersao(atual.versao);
    throw new NaoEncontrado('plano_padrao_nao_encontrado', 'Plano do pacote não encontrado.');
  }
  const acao = 'ativa' in mudanca ? (mudanca.ativa ? 'reativar' : 'desativar') : 'alterar';
  uow.auditar({
    entidade: 'plano_padrao',
    registroId: id,
    acao,
    antes,
    depois: { ...mudanca, versao: r.versao },
  });
  uow.publicar({
    tipo: 'plano_padrao.alterado',
    entidade: 'plano_padrao',
    registroId: id,
    payload: { acao, versao: r.versao },
  });
  return { versao: r.versao };
}
