// Modelos de ativo (fase 1b, M1; migração 0050), na unit of work, com
// auditoria e evento. A alteração só grava se a versão ainda for a esperada,
// e incrementa (ADR-029). A RLS decide por último: só o Admin do grupo grava.
import type { MudancaDeModeloDeAtivo } from '@hubkeep/aplicacao';
import { type DadosDoModeloDeAtivo, NaoEncontrado, conflitoDeVersao } from '@hubkeep/dominio';
import { sql } from 'kysely';
import { novoId } from '../ids';
import { transacaoDe, type UnidadeDeTrabalho } from '../unidade-de-trabalho';

const colunasDeDados = (d: DadosDoModeloDeAtivo) => ({
  categoria_id: d.categoriaId,
  nome: d.nome,
  fabricante: d.fabricante,
  modelo: d.modelo,
  campos: JSON.stringify(d.campos),
  checklist_modelo_id: d.checklistModeloId,
  plano_sugerido: d.planoSugerido ? JSON.stringify(d.planoSugerido) : null,
});

export async function criarModeloDeAtivo(
  uow: UnidadeDeTrabalho,
  dados: DadosDoModeloDeAtivo,
): Promise<{ id: string }> {
  const id = novoId();
  await transacaoDe(uow)
    .insertInto('app.modelo_ativo')
    .values({ id, tenant_id: uow.tenantId, ...colunasDeDados(dados) })
    .execute();
  uow.auditar({ entidade: 'modelo_ativo', registroId: id, acao: 'criar', depois: dados });
  uow.publicar({
    tipo: 'modelo_ativo.criado',
    entidade: 'modelo_ativo',
    registroId: id,
    payload: { categoriaId: dados.categoriaId },
  });
  return { id };
}

export async function alterarModeloDeAtivo(
  uow: UnidadeDeTrabalho,
  id: string,
  versaoEsperada: number,
  mudanca: MudancaDeModeloDeAtivo,
): Promise<{ versao: number }> {
  const tx = transacaoDe(uow);
  const antes = await tx
    .selectFrom('app.modelo_ativo')
    .select([
      'categoria_id',
      'nome',
      'fabricante',
      'modelo',
      'campos',
      'checklist_modelo_id',
      'plano_sugerido',
      'versao',
      'ativa',
    ])
    .where('id', '=', id)
    .executeTakeFirst();
  const valores = 'ativa' in mudanca ? { ativa: mudanca.ativa } : colunasDeDados(mudanca);
  const r = await tx
    .updateTable('app.modelo_ativo')
    .set({ ...valores, versao: sql<number>`versao + 1`, atualizado_em: sql`now()` })
    .where('id', '=', id)
    .where('versao', '=', versaoEsperada)
    .returning(['versao'])
    .executeTakeFirst();
  if (!r) {
    // Visível e com outra versão: alguém gravou antes (ADR-029). Relê depois
    // do UPDATE, como no ativo. Sem linha visível, ou visível sem escrita
    // (RLS), é "não encontrado".
    const atual = await tx
      .selectFrom('app.modelo_ativo')
      .select('versao')
      .where('id', '=', id)
      .executeTakeFirst();
    if (atual && atual.versao !== versaoEsperada) throw conflitoDeVersao(atual.versao);
    throw new NaoEncontrado('modelo_ativo_nao_encontrado', 'Modelo de ativo não encontrado.');
  }
  const acao = 'ativa' in mudanca ? (mudanca.ativa ? 'reativar' : 'desativar') : 'alterar';
  uow.auditar({
    entidade: 'modelo_ativo',
    registroId: id,
    acao,
    antes,
    depois: { ...mudanca, versao: r.versao },
  });
  uow.publicar({
    tipo: 'modelo_ativo.alterado',
    entidade: 'modelo_ativo',
    registroId: id,
    payload: { acao, versao: r.versao },
  });
  return { versao: r.versao };
}
