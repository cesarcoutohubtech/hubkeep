// Ativos do hotel (fase 1a, B3; ADR-029), na unit of work, com auditoria e
// evento. A alteração só grava se a versão ainda for a esperada, e incrementa.
// A RLS decide por último: quem não tem escrita no hotel tem o INSERT recusado
// (42501) e o UPDATE sem linha. Mover (B3c) troca o local_id e grava a
// movimentação na mesma unit of work; a FK (hotel_id, local_id) recusa local
// de outro hotel. A importação por planilha (M2) cria com a chave da linha; o
// cadastro da etiqueta reservada (M3), com o código dela.
import type { DadosDeAtivo, MudancaDeAtivo } from '@hubkeep/aplicacao';
import { Conflito, NaoEncontrado, conflitoDeVersao } from '@hubkeep/dominio';
import { sql } from 'kysely';
import { novoCodigoQr, novoId } from '../ids';
import { transacaoDe, type UnidadeDeTrabalho } from '../unidade-de-trabalho';
import { agoraNaGravacao, datasDaCriacao } from './instante-do-roteiro';
import { colunasPesquisaveisDoAtivo } from './busca';

const colunasDeDados = (d: DadosDeAtivo) => ({
  categoria_id: d.categoriaId,
  modelo_id: d.modeloId,
  ...colunasPesquisaveisDoAtivo(d),
  data_compra: d.dataCompra,
  garantia_ate: d.garantiaAte,
  criticidade: d.criticidade,
  campos: JSON.stringify(d.campos),
});

export async function criarAtivo(
  uow: UnidadeDeTrabalho,
  hotelId: string,
  localId: string,
  dados: DadosDeAtivo,
  /** Com que situação o cadastro nasce (M4): pendente só pelo PWA com a política ligada. */
  situacao: 'pendente' | 'aprovado' = 'aprovado',
  /**
   * A chave da linha da planilha (M2), única por hotel. Repetida: Conflito
   * importacao_ja_importada, e a unit of work não grava nada.
   */
  chaveImportacao: string | null = null,
  /**
   * O código da etiqueta reservada (M3), já conferido pela aplicação; null: o
   * código é gerado. Já ligado a outro ativo nesse meio-tempo: Conflito
   * qr_ja_ligado, e a unit of work não grava nada.
   */
  codigoReservado: string | null = null,
): Promise<{ id: string; versao: number }> {
  const id = novoId();
  const codigoQr = codigoReservado ?? novoCodigoQr();
  try {
    await transacaoDe(uow)
      .insertInto('app.ativo')
      .values({
        id,
        tenant_id: uow.tenantId,
        hotel_id: hotelId,
        local_id: localId,
        codigo_qr: codigoQr,
        situacao_cadastro: situacao,
        chave_importacao: chaveImportacao,
        ...colunasDeDados(dados),
        ...datasDaCriacao(uow),
      })
      .execute();
  } catch (e) {
    const { code, constraint } = e as { code?: string; constraint?: string };
    if (code === '23505' && constraint === 'ativo_chave_importacao_unica') {
      throw new Conflito('importacao_ja_importada', 'A linha da planilha já foi importada.');
    }
    if (code === '23505' && constraint === 'ativo_codigo_qr_unico' && codigoReservado !== null) {
      throw new Conflito('qr_ja_ligado', 'O código já está ligado a um ativo.');
    }
    throw e;
  }
  uow.auditar({
    entidade: 'ativo',
    registroId: id,
    acao: chaveImportacao === null ? 'criar' : 'importar',
    hotelId,
    depois: {
      localId,
      codigoQr,
      situacaoCadastro: situacao,
      ...(chaveImportacao === null ? {} : { chaveImportacao }),
      ...dados,
    },
  });
  uow.publicar({
    tipo: 'ativo.criado',
    entidade: 'ativo',
    registroId: id,
    payload: { hotelId, localId, situacaoCadastro: situacao },
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
      'modelo_id',
      'nome',
      'fabricante',
      'modelo',
      'numero_serie',
      sql<string | null>`data_compra::text`.as('data_compra'),
      sql<string | null>`garantia_ate::text`.as('garantia_ate'),
      'criticidade',
      'campos',
      'versao',
      'desativado_em',
    ])
    .where('id', '=', id)
    .executeTakeFirst();
  const valores =
    'desativado' in mudanca
      ? { desativado_em: mudanca.desativado ? agoraNaGravacao(uow) : null }
      : colunasDeDados(mudanca);
  const r = await tx
    .updateTable('app.ativo')
    .set({ ...valores, versao: sql<number>`versao + 1`, atualizado_em: agoraNaGravacao(uow) })
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

/**
 * Descarta a sugestão de plano do ativo (M1, migração 0051): quem e quando
 * vêm do contexto, pela versão (ADR-029). O check da tabela exige as três
 * colunas juntas e o motivo não vazio.
 */
export async function descartarSugestaoDePlano(
  uow: UnidadeDeTrabalho,
  id: string,
  versaoEsperada: number,
  motivo: string,
): Promise<{ versao: number }> {
  if (!uow.usuarioId) throw new Error('Descartar a sugestão exige um usuário no contexto.');
  const tx = transacaoDe(uow);
  const r = await tx
    .updateTable('app.ativo')
    .set({
      sugestao_descartada_em: agoraNaGravacao(uow),
      sugestao_descartada_por: uow.usuarioId,
      sugestao_descarte_motivo: motivo,
      versao: sql<number>`versao + 1`,
      atualizado_em: agoraNaGravacao(uow),
    })
    .where('id', '=', id)
    .where('versao', '=', versaoEsperada)
    .returning(['hotel_id', 'versao'])
    .executeTakeFirst();
  if (!r) {
    const atual = await tx
      .selectFrom('app.ativo')
      .select('versao')
      .where('id', '=', id)
      .executeTakeFirst();
    if (atual && atual.versao !== versaoEsperada) throw conflitoDeVersao(atual.versao);
    throw new NaoEncontrado('ativo_nao_encontrado', 'Ativo não encontrado.');
  }
  uow.auditar({
    entidade: 'ativo',
    registroId: id,
    acao: 'descartar_sugestao',
    hotelId: r.hotel_id,
    depois: { sugestaoDescarteMotivo: motivo, versao: r.versao },
  });
  uow.publicar({
    tipo: 'ativo.alterado',
    entidade: 'ativo',
    registroId: id,
    payload: { hotelId: r.hotel_id, acao: 'descartar_sugestao', versao: r.versao },
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
      atualizado_em: agoraNaGravacao(uow),
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
