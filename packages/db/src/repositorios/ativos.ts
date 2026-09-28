// Ativos do hotel (fase 1a, B3; ADR-029), na unit of work, com auditoria e
// evento. A alteração só grava se a versão ainda for a esperada, e incrementa.
// A RLS decide por último: quem não tem escrita no hotel tem o INSERT recusado
// (42501) e o UPDATE sem linha. Mover (B3c) troca o local_id e grava a
// movimentação na mesma unit of work; a FK (hotel_id, local_id) recusa local
// de outro hotel.
import type { DadosDeAtivo, MudancaDeAtivo } from '@hubkeep/aplicacao';
import { NaoEncontrado, conflitoDeVersao } from '@hubkeep/dominio';
import { sql } from 'kysely';
import { novoId } from '../ids';
import { transacaoDe, type UnidadeDeTrabalho } from '../unidade-de-trabalho';

const colunasDeDados = (d: DadosDeAtivo) => ({
  categoria_id: d.categoriaId,
  nome: d.nome,
  fabricante: d.fabricante,
  modelo: d.modelo,
  numero_serie: d.numeroSerie,
  campos: JSON.stringify(d.campos),
});

export async function criarAtivo(
  uow: UnidadeDeTrabalho,
  hotelId: string,
  localId: string,
  dados: DadosDeAtivo,
): Promise<{ id: string; versao: number }> {
  const id = novoId();
  await transacaoDe(uow)
    .insertInto('app.ativo')
    .values({
      id,
      tenant_id: uow.tenantId,
      hotel_id: hotelId,
      local_id: localId,
      ...colunasDeDados(dados),
    })
    .execute();
  uow.auditar({
    entidade: 'ativo',
    registroId: id,
    acao: 'criar',
    hotelId,
    depois: { localId, ...dados },
  });
  uow.publicar({
    tipo: 'ativo.criado',
    entidade: 'ativo',
    registroId: id,
    payload: { hotelId, localId },
  });
  return { id, versao: 1 };
}

export async function alterarAtivo(
  uow: UnidadeDeTrabalho,
  id: string,
  versaoEsperada: number,
  mudanca: MudancaDeAtivo,
): Promise<{ versao: number }> {
  const tx = transacaoDe(uow);
  const antes = await tx
    .selectFrom('app.ativo')
    .select([
      'categoria_id',
      'nome',
      'fabricante',
      'modelo',
      'numero_serie',
      'campos',
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
    .updateTable('app.ativo')
    .set({ ...valores, versao: sql<number>`versao + 1`, atualizado_em: sql`now()` })
    .where('id', '=', id)
    .where('versao', '=', versaoEsperada)
    .returning(['hotel_id', 'versao'])
    .executeTakeFirst();
  if (!r) {
    // Visível e com outra versão: alguém gravou antes (ADR-029). Relê depois
    // do UPDATE, porque uma gravação simultânea pode ter terminado enquanto
    // este esperava a trava da linha. Sem linha visível, ou visível sem
    // escrita (RLS), é "não encontrado".
    const atual = await tx
      .selectFrom('app.ativo')
      .select('versao')
      .where('id', '=', id)
      .executeTakeFirst();
    if (atual && atual.versao !== versaoEsperada) throw conflitoDeVersao(atual.versao);
    throw new NaoEncontrado('ativo_nao_encontrado', 'Ativo não encontrado.');
  }
  const acao =
    'desativado' in mudanca ? (mudanca.desativado ? 'desativar' : 'reativar') : 'alterar';
  uow.auditar({
    entidade: 'ativo',
    registroId: id,
    acao,
    hotelId: r.hotel_id,
    antes,
    depois: { ...mudanca, versao: r.versao },
  });
  uow.publicar({
    tipo: 'ativo.alterado',
    entidade: 'ativo',
    registroId: id,
    payload: { hotelId: r.hotel_id, acao, versao: r.versao },
  });
  return { versao: r.versao };
}

export async function moverAtivo(
  uow: UnidadeDeTrabalho,
  id: string,
  versaoEsperada: number,
  localDestinoId: string,
): Promise<{ versao: number }> {
  if (!uow.usuarioId) throw new Error('Mover ativo exige um usuário no contexto.');
  const tx = transacaoDe(uow);
  // A trava da linha dá a origem certa mesmo com gravação simultânea. O FOR
  // UPDATE aplica também a policy de UPDATE: sem escrita no hotel, não há
  // linha, e é "não encontrado".
  const atual = await tx
    .selectFrom('app.ativo')
    .select(['hotel_id', 'local_id', 'versao'])
    .where('id', '=', id)
    .forUpdate()
    .executeTakeFirst();
  if (!atual) throw new NaoEncontrado('ativo_nao_encontrado', 'Ativo não encontrado.');
  if (atual.versao !== versaoEsperada) throw conflitoDeVersao(atual.versao);
  const r = await tx
    .updateTable('app.ativo')
    .set({
      local_id: localDestinoId,
      versao: sql<number>`versao + 1`,
      atualizado_em: sql`now()`,
    })
    .where('id', '=', id)
    .returning('versao')
    .executeTakeFirstOrThrow();
  await tx
    .insertInto('app.ativo_movimentacao')
    .values({
      id: novoId(),
      tenant_id: uow.tenantId,
      hotel_id: atual.hotel_id,
      ativo_id: id,
      local_origem_id: atual.local_id,
      local_destino_id: localDestinoId,
      usuario_id: uow.usuarioId,
    })
    .execute();
  uow.auditar({
    entidade: 'ativo',
    registroId: id,
    acao: 'mover',
    hotelId: atual.hotel_id,
    antes: { localId: atual.local_id, versao: atual.versao },
    depois: { localId: localDestinoId, versao: r.versao },
  });
  uow.publicar({
    tipo: 'ativo.movido',
    entidade: 'ativo',
    registroId: id,
    payload: {
      hotelId: atual.hotel_id,
      localOrigemId: atual.local_id,
      localDestinoId,
      versao: r.versao,
    },
  });
  return { versao: r.versao };
}
