// Fornecedores do grupo (fase 1b, I3; ADR-029), na unit of work, com auditoria
// e evento. O fornecedor não tem hotel: a auditoria vai sem hotel_id, que a
// policy de app.auditoria aceita do Admin do grupo, do Gestor CSC e do Gerente
// para a entidade 'fornecedor' (migração 0033). O contato entra na auditoria
// como qualquer cadastro. A alteração só grava se a versão ainda for a
// esperada, e incrementa. A RLS decide por último: quem não grava fornecedor
// tem o INSERT recusado (42501) e o UPDATE sem linha.
import type { MudancaDeFornecedor } from '@hubkeep/aplicacao';
import {
  type DadosDeFornecedor,
  NaoEncontrado,
  cnpjDeFornecedorRepetido,
  conflitoDeVersao,
} from '@hubkeep/dominio';
import { sql } from 'kysely';
import { novoId } from '../ids';
import { transacaoDe, type UnidadeDeTrabalho } from '../unidade-de-trabalho';

/** CNPJ repetido no grupo (índice fornecedor_cnpj_unico) vira 409 com código. */
function cnpjRepetido(e: unknown): never {
  const { code, constraint } = e as { code?: string; constraint?: string };
  if (code === '23505' && constraint === 'fornecedor_cnpj_unico') {
    throw cnpjDeFornecedorRepetido();
  }
  throw e;
}

const colunasDeDados = (d: DadosDeFornecedor) => ({
  nome: d.nome,
  cnpj: d.cnpj,
  contato_nome: d.contatoNome,
  contato_telefone: d.contatoTelefone,
  contato_email: d.contatoEmail,
});

export async function criarFornecedor(
  uow: UnidadeDeTrabalho,
  dados: DadosDeFornecedor,
): Promise<{ id: string; versao: number }> {
  const id = novoId();
  await transacaoDe(uow)
    .insertInto('app.fornecedor')
    .values({ id, tenant_id: uow.tenantId, ...colunasDeDados(dados) })
    .execute()
    .catch(cnpjRepetido);
  uow.auditar({ entidade: 'fornecedor', registroId: id, acao: 'criar', depois: dados });
  uow.publicar({
    tipo: 'fornecedor.criado',
    entidade: 'fornecedor',
    registroId: id,
    payload: { fornecedorId: id },
  });
  return { id, versao: 1 };
}

export async function alterarFornecedor(
  uow: UnidadeDeTrabalho,
  id: string,
  versaoEsperada: number,
  mudanca: MudancaDeFornecedor,
): Promise<{ versao: number }> {
  const tx = transacaoDe(uow);
  const antes = await tx
    .selectFrom('app.fornecedor')
    .select([
      'nome',
      'cnpj',
      'contato_nome',
      'contato_telefone',
      'contato_email',
      'versao',
      'desativado_em',
    ])
    .where('id', '=', id)
    .executeTakeFirst();
  const valores =
    'desativado' in mudanca
      ? { desativado_em: mudanca.desativado ? sql<Date>`now()` : null }
      : colunasDeDados(mudanca);
  const r = await tx
    .updateTable('app.fornecedor')
    .set({ ...valores, versao: sql<number>`versao + 1`, atualizado_em: sql`now()` })
    .where('id', '=', id)
    .where('versao', '=', versaoEsperada)
    .returning('versao')
    .executeTakeFirst()
    .catch(cnpjRepetido);
  if (!r) {
    // Visível e com outra versão: alguém gravou antes (ADR-029). Relê depois
    // do UPDATE, como o ativo. Sem linha visível, ou visível sem escrita
    // (RLS), é "não encontrado".
    const atual = await tx
      .selectFrom('app.fornecedor')
      .select('versao')
      .where('id', '=', id)
      .executeTakeFirst();
    if (atual && atual.versao !== versaoEsperada) throw conflitoDeVersao(atual.versao);
    throw new NaoEncontrado('fornecedor_nao_encontrado', 'Fornecedor não encontrado.');
  }
  const acao =
    'desativado' in mudanca ? (mudanca.desativado ? 'desativar' : 'reativar') : 'alterar';
  uow.auditar({
    entidade: 'fornecedor',
    registroId: id,
    acao,
    antes,
    depois: { ...mudanca, versao: r.versao },
  });
  uow.publicar({
    tipo: 'fornecedor.alterado',
    entidade: 'fornecedor',
    registroId: id,
    payload: { fornecedorId: id, acao, versao: r.versao },
  });
  return { versao: r.versao };
}
