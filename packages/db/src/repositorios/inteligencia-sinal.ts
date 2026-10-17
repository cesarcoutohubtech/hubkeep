// O sinal do hóspede do Intelligence (ADR-047, migração 0052), pelo hk_app com
// o contexto de quem pede: a RLS da app.sinal_hospede deixa ler, importar e
// classificar só quem decide insight no hotel. Aqui só IO; as regras (a
// validação da linha, quem importa e classifica, a coerência da
// classificação) são do packages/inteligencia, que este pacote não importa
// (ADR-037).
//
// A importação grava as linhas do lote com on conflict do nothing: a mesma
// avaliação (hotel, fonte e código externo) entra uma vez, e a reimportação
// não muda a que existe. Uma auditoria por lote, com as contagens, e o evento
// sinal_hospede.importado (a importação em que nada entrou não grava nenhum
// dos dois). A classificação grava com a trava de versão, uma
// auditoria e o evento sinal_hospede.classificado. As auditorias vão sem
// hotel_id e sem o texto do hóspede, como a do insight (Cesar, 10/10/2026):
// a RLS da app.auditoria deixaria quem não decide insight lê-las. O INSERT
// dessa auditoria sem hotel é o caso nomeado da migração 0053.
import { NaoEncontrado, conflitoDeVersao } from '@hubkeep/dominio';
import { sql } from 'kysely';
import type { Tx } from '../conexao';
import { novoId } from '../ids';
import { transacaoDe, type UnidadeDeTrabalho } from '../unidade-de-trabalho';

export interface HotelDoSinalNoBanco {
  id: string;
  bandeiraId: string | null;
}

export interface SinalNovoNoBanco {
  fonte: string;
  idExterno: string;
  ocorridoEm: Date;
  nota: number | null;
  escala: number | null;
  texto: string | null;
  idioma: string | null;
  uhCitada: string | null;
}

export interface ImportacaoNoBanco {
  hotelId: string;
  importadoPor: string;
  em: Date;
  sinais: readonly SinalNovoNoBanco[];
}

export interface SinalParaClassificarNoBanco {
  id: string;
  hotelId: string;
  bandeiraId: string | null;
  versao: number;
}

export interface ReferenciasDaClassificacaoNoBanco {
  ativo: {
    id: string;
    hotelId: string;
    categoriaId: string | null;
    desativadoEm: Date | null;
  } | null;
  uh: { id: string; hotelId: string; tipo: string } | null;
  categoria: { id: string } | null;
}

export interface ClassificacaoNoBanco {
  sinalId: string;
  versaoEsperada: number;
  manutencao: boolean;
  categoriaId: string | null;
  uhId: string | null;
  ativoId: string | null;
  ligacao: string;
  classificadoPor: string;
  em: Date;
}

const data = (v: Date | string): Date => (v instanceof Date ? v : new Date(v));

export async function hotelDoSinal(tx: Tx, id: string): Promise<HotelDoSinalNoBanco | null> {
  const h = await tx
    .selectFrom('app.hotel')
    .select(['id', 'bandeira_id'])
    .where('id', '=', id)
    .executeTakeFirst();
  return h ? { id: h.id, bandeiraId: h.bandeira_id } : null;
}

/** As linhas do lote; devolve o lote e as chaves (`fonte|idExterno`) que entraram. */
export async function gravarSinaisNoBanco(
  uow: UnidadeDeTrabalho,
  i: ImportacaoNoBanco,
): Promise<{ loteId: string; inseridos: string[] }> {
  const tx = transacaoDe(uow);
  const loteId = novoId();
  const inseridos = i.sinais.length
    ? await tx
        .insertInto('app.sinal_hospede')
        .values(
          i.sinais.map((s) => ({
            id: novoId(),
            tenant_id: uow.tenantId,
            hotel_id: i.hotelId,
            lote_id: loteId,
            fonte: s.fonte,
            id_externo: s.idExterno,
            ocorrido_em: s.ocorridoEm,
            nota: s.nota,
            escala: s.escala,
            texto: s.texto,
            idioma: s.idioma,
            uh_citada: s.uhCitada,
            importado_por: i.importadoPor,
            criado_em: i.em,
            atualizado_em: i.em,
          })),
        )
        .onConflict((oc) =>
          oc.columns(['tenant_id', 'hotel_id', 'fonte', 'id_externo']).doNothing(),
        )
        .returning(['fonte', 'id_externo'])
        .execute()
    : [];
  const chaves = inseridos.map((r) => `${r.fonte}|${r.id_externo}`);
  // Nada entrou (tudo repetido): nada mudou, e não há auditoria nem evento.
  // A policy da auditoria (0053) confere o lote pelas reclamações dele.
  if (!chaves.length) return { loteId, inseridos: chaves };
  const contagens = { entraram: chaves.length, repetidas: i.sinais.length - chaves.length };
  uow.auditar({
    entidade: 'sinal_hospede',
    registroId: loteId,
    acao: 'importar',
    hotelId: null,
    depois: { hotelId: i.hotelId, ...contagens },
  });
  uow.publicar({
    tipo: 'sinal_hospede.importado',
    entidade: 'sinal_hospede',
    registroId: loteId,
    payload: { hotelId: i.hotelId, ...contagens },
  });
  return { loteId, inseridos: chaves };
}

export async function sinalParaClassificar(
  tx: Tx,
  id: string,
): Promise<SinalParaClassificarNoBanco | null> {
  const s = await tx
    .selectFrom('app.sinal_hospede as s')
    .innerJoin('app.hotel as h', 'h.id', 's.hotel_id')
    .select(['s.id', 's.hotel_id', 'h.bandeira_id', 's.versao'])
    .where('s.id', '=', id)
    .executeTakeFirst();
  return s ? { id: s.id, hotelId: s.hotel_id, bandeiraId: s.bandeira_id, versao: s.versao } : null;
}

export async function referenciasDaClassificacao(
  tx: Tx,
  r: { ativoId: string | null; uhId: string | null; categoriaId: string | null },
): Promise<ReferenciasDaClassificacaoNoBanco> {
  const [ativo, uh, categoria] = await Promise.all([
    r.ativoId
      ? tx
          .selectFrom('app.ativo')
          .select(['id', 'hotel_id', 'categoria_id', 'desativado_em'])
          .where('id', '=', r.ativoId)
          .executeTakeFirst()
      : undefined,
    r.uhId
      ? tx
          .selectFrom('app.local')
          .select(['id', 'hotel_id', 'tipo'])
          .where('id', '=', r.uhId)
          .executeTakeFirst()
      : undefined,
    r.categoriaId
      ? tx
          .selectFrom('app.categoria_ativo')
          .select(['id'])
          .where('id', '=', r.categoriaId)
          .executeTakeFirst()
      : undefined,
  ]);
  return {
    ativo: ativo
      ? {
          id: ativo.id,
          hotelId: ativo.hotel_id,
          categoriaId: ativo.categoria_id,
          desativadoEm: ativo.desativado_em === null ? null : data(ativo.desativado_em),
        }
      : null,
    uh: uh ? { id: uh.id, hotelId: uh.hotel_id, tipo: uh.tipo } : null,
    categoria: categoria ? { id: categoria.id } : null,
  };
}

export async function classificarSinalNoBanco(
  uow: UnidadeDeTrabalho,
  c: ClassificacaoNoBanco,
): Promise<{ versao: number }> {
  const tx = transacaoDe(uow);
  // O FOR UPDATE aplica também a policy de UPDATE: fora do escopo, não há linha.
  const antes = await tx
    .selectFrom('app.sinal_hospede')
    .select(['manutencao', 'categoria_id', 'uh_id', 'ativo_id', 'ligacao', 'hotel_id', 'versao'])
    .where('id', '=', c.sinalId)
    .forUpdate()
    .executeTakeFirst();
  if (!antes) throw new NaoEncontrado('sinal_nao_encontrado', 'Reclamação não encontrada.');
  if (antes.versao !== c.versaoEsperada) throw conflitoDeVersao(antes.versao);
  const r = await tx
    .updateTable('app.sinal_hospede')
    .set({
      manutencao: c.manutencao,
      categoria_id: c.categoriaId,
      uh_id: c.uhId,
      ativo_id: c.ativoId,
      ligacao: c.ligacao,
      classificado_em: c.em,
      classificado_por: c.classificadoPor,
      versao: sql<number>`versao + 1`,
      atualizado_em: c.em,
    })
    .where('id', '=', c.sinalId)
    .returning('versao')
    .executeTakeFirstOrThrow();
  const depois = {
    manutencao: c.manutencao,
    categoriaId: c.categoriaId,
    uhId: c.uhId,
    ativoId: c.ativoId,
    ligacao: c.ligacao,
    versao: r.versao,
  };
  uow.auditar({
    entidade: 'sinal_hospede',
    registroId: c.sinalId,
    acao: 'classificar',
    hotelId: null,
    antes: {
      manutencao: antes.manutencao,
      categoriaId: antes.categoria_id,
      uhId: antes.uh_id,
      ativoId: antes.ativo_id,
      ligacao: antes.ligacao,
      versao: antes.versao,
    },
    depois,
  });
  uow.publicar({
    tipo: 'sinal_hospede.classificado',
    entidade: 'sinal_hospede',
    registroId: c.sinalId,
    payload: { hotelId: antes.hotel_id, ...depois },
  });
  return { versao: r.versao };
}
