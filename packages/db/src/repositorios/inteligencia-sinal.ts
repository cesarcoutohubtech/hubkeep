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
import { Conflito, NaoEncontrado, conflitoDeVersao } from '@hubkeep/dominio';
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

export interface SinalDaFilaNoBanco {
  id: string;
  hotelId: string;
  fonte: string;
  idExterno: string;
  ocorridoEm: Date;
  nota: number | null;
  escala: number | null;
  texto: string | null;
  textoApagadoEm: Date | null;
  idioma: string | null;
  uhCitada: string | null;
  manutencao: boolean | null;
  categoriaId: string | null;
  uhId: string | null;
  ativoId: string | null;
  ligacao: string;
  classificadoEm: Date | null;
  classificadoPor: string | null;
  importadoEm: Date;
  versao: number;
  /** O chamado aberto a partir da reclamação (0057); null sem ligação. */
  chamadoId: string | null;
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

const COLUNAS_DA_FILA = [
  'id',
  'hotel_id',
  'fonte',
  'id_externo',
  'ocorrido_em',
  'nota',
  'escala',
  'texto',
  'texto_apagado_em',
  'idioma',
  'uh_citada',
  'manutencao',
  'categoria_id',
  'uh_id',
  'ativo_id',
  'ligacao',
  'classificado_em',
  'classificado_por',
  'criado_em',
  'versao',
] as const;

function linhaDaFila(s: {
  id: string;
  hotel_id: string;
  fonte: string;
  id_externo: string;
  ocorrido_em: Date | string;
  nota: number | string | null;
  escala: number | null;
  texto: string | null;
  texto_apagado_em: Date | string | null;
  idioma: string | null;
  uh_citada: string | null;
  manutencao: boolean | null;
  categoria_id: string | null;
  uh_id: string | null;
  ativo_id: string | null;
  ligacao: string;
  classificado_em: Date | string | null;
  classificado_por: string | null;
  criado_em: Date | string;
  versao: number;
}): Omit<SinalDaFilaNoBanco, 'chamadoId'> {
  return {
    id: s.id,
    hotelId: s.hotel_id,
    fonte: s.fonte,
    idExterno: s.id_externo,
    ocorridoEm: data(s.ocorrido_em),
    nota: s.nota === null ? null : Number(s.nota),
    escala: s.escala,
    texto: s.texto,
    textoApagadoEm: s.texto_apagado_em === null ? null : data(s.texto_apagado_em),
    idioma: s.idioma,
    uhCitada: s.uh_citada,
    manutencao: s.manutencao,
    categoriaId: s.categoria_id,
    uhId: s.uh_id,
    ativoId: s.ativo_id,
    ligacao: s.ligacao,
    classificadoEm: s.classificado_em === null ? null : data(s.classificado_em),
    classificadoPor: s.classificado_por,
    importadoEm: data(s.criado_em),
    versao: s.versao,
  };
}

/** O chamado ligado a cada reclamação da lista (0057), pela RLS de quem pede. */
async function comChamados(
  tx: Tx,
  linhas: readonly Omit<SinalDaFilaNoBanco, 'chamadoId'>[],
): Promise<SinalDaFilaNoBanco[]> {
  const ligacoes = linhas.length
    ? await tx
        .selectFrom('app.sinal_hospede_chamado')
        .select(['sinal_id', 'chamado_id'])
        .where(
          'sinal_id',
          'in',
          linhas.map((l) => l.id),
        )
        .execute()
    : [];
  const chamado = new Map(ligacoes.map((l) => [l.sinal_id, l.chamado_id]));
  return linhas.map((l) => ({ ...l, chamadoId: chamado.get(l.id) ?? null }));
}

/**
 * A fila de classificação do hotel: as reclamações do recorte (sem
 * classificação, de manutenção, fora da manutenção ou todas), da data mais
 * recente para a mais antiga, até `limite`.
 */
export async function sinaisDoHotel(
  tx: Tx,
  hotelId: string,
  situacao: string,
  limite: number,
): Promise<SinalDaFilaNoBanco[]> {
  let q = tx
    .selectFrom('app.sinal_hospede')
    .select(COLUNAS_DA_FILA)
    .where('hotel_id', '=', hotelId);
  if (situacao === 'pendentes') q = q.where('manutencao', 'is', null);
  else if (situacao === 'manutencao') q = q.where('manutencao', '=', true);
  else if (situacao === 'fora') q = q.where('manutencao', '=', false);
  const linhas = await q
    .orderBy('ocorrido_em', 'desc')
    .orderBy('id', 'desc')
    .limit(limite)
    .execute();
  return comChamados(tx, linhas.map(linhaDaFila));
}

/**
 * As reclamações destes ids que quem pede lê (a RLS filtra), com o texto, da
 * data mais recente para a mais antiga, até `limite`: as da evidência do
 * insight sistêmico (C2 do ADR-047).
 */
export async function sinaisPorIds(
  tx: Tx,
  ids: readonly string[],
  limite: number,
): Promise<SinalDaFilaNoBanco[]> {
  if (!ids.length) return [];
  const linhas = await tx
    .selectFrom('app.sinal_hospede')
    .select(COLUNAS_DA_FILA)
    .where('id', 'in', ids)
    .orderBy('ocorrido_em', 'desc')
    .orderBy('id', 'desc')
    .limit(limite)
    .execute();
  return comChamados(tx, linhas.map(linhaDaFila));
}

/**
 * As reclamações ligadas ao ativo (possível ou confirmada), avaliadas depois
 * de `desde` e até `ate`, com o texto, da mais recente para a mais antiga,
 * até `limite` (o índice das reclamações do ativo da 0052).
 */
export async function sinaisDoAtivo(
  tx: Tx,
  ativoId: string,
  desde: Date,
  ate: Date,
  limite: number,
): Promise<SinalDaFilaNoBanco[]> {
  const linhas = await tx
    .selectFrom('app.sinal_hospede')
    .select(COLUNAS_DA_FILA)
    .where('ativo_id', '=', ativoId)
    .where('ocorrido_em', '>', desde)
    .where('ocorrido_em', '<=', ate)
    .orderBy('ocorrido_em', 'desc')
    .orderBy('id', 'desc')
    .limit(limite)
    .execute();
  return comChamados(tx, linhas.map(linhaDaFila));
}

/** O nome de cada UH destes ids que quem pede lê. */
export async function nomesDasUhs(tx: Tx, ids: readonly string[]): Promise<Record<string, string>> {
  if (!ids.length) return {};
  const linhas = await tx
    .selectFrom('app.local')
    .select(['id', 'nome'])
    .where('id', 'in', ids)
    .execute();
  return Object.fromEntries(linhas.map((l) => [l.id, l.nome]));
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

export interface LigacaoDoChamadoNoBanco {
  sinalId: string;
  hotelId: string;
  chamadoId: string;
  ligadoPor: string;
  em: Date;
}

/** O índice único da 0057 recusou: a reclamação já tem chamado. */
function jaTemChamado(e: unknown): never {
  const { code, constraint } = e as { code?: string; constraint?: string };
  if (code === '23505' && constraint === 'sinal_hospede_chamado_tenant_id_sinal_id_key') {
    throw new Conflito('reclamacao_ja_tem_chamado', 'A reclamação já tem chamado.');
  }
  throw e;
}

/** O chamado já ligado à reclamação, se quem pede o lê; null sem ligação. */
export async function chamadoDaReclamacao(tx: Tx, sinalId: string): Promise<string | null> {
  const l = await tx
    .selectFrom('app.sinal_hospede_chamado')
    .select('chamado_id')
    .where('sinal_id', '=', sinalId)
    .executeTakeFirst();
  return l?.chamado_id ?? null;
}

/**
 * Liga as reclamações ao chamado que quem pede abriu a partir delas (0057),
 * numa transação, com a auditoria sem hotel de cada uma (como a da
 * classificação) e o evento.
 */
export async function ligarChamadosNoBanco(
  uow: UnidadeDeTrabalho,
  ls: readonly LigacaoDoChamadoNoBanco[],
): Promise<void> {
  if (!ls.length) return;
  const tx = transacaoDe(uow);
  await tx
    .insertInto('app.sinal_hospede_chamado')
    .values(
      ls.map((l) => ({
        id: novoId(),
        tenant_id: uow.tenantId,
        hotel_id: l.hotelId,
        sinal_id: l.sinalId,
        chamado_id: l.chamadoId,
        ligado_por: l.ligadoPor,
        criado_em: l.em,
      })),
    )
    .execute()
    .catch(jaTemChamado);
  for (const l of ls) {
    uow.auditar({
      entidade: 'sinal_hospede',
      registroId: l.sinalId,
      acao: 'ligar_chamado',
      hotelId: null,
      depois: { chamadoId: l.chamadoId },
    });
    uow.publicar({
      tipo: 'sinal_hospede.chamado_ligado',
      entidade: 'sinal_hospede',
      registroId: l.sinalId,
      payload: { hotelId: l.hotelId, chamadoId: l.chamadoId },
    });
  }
}

/** Liga uma reclamação ao chamado que quem pede abriu a partir dela. */
export async function ligarChamadoNoBanco(
  uow: UnidadeDeTrabalho,
  l: LigacaoDoChamadoNoBanco,
): Promise<void> {
  await ligarChamadosNoBanco(uow, [l]);
}

export interface ReclamacaoParaChamadoNoBanco {
  id: string;
  hotelId: string;
  bandeiraId: string | null;
  manutencao: boolean | null;
  uhId: string | null;
  ativoId: string | null;
  /** O local do ativo da classificação; null sem ativo. */
  localDoAtivo: string | null;
  chamadoId: string | null;
}

/** A reclamação, se quem pede a lê, com o que o chamado a partir dela precisa. */
export async function reclamacaoParaChamado(
  tx: Tx,
  id: string,
): Promise<ReclamacaoParaChamadoNoBanco | null> {
  const s = await tx
    .selectFrom('app.sinal_hospede as s')
    .innerJoin('app.hotel as h', 'h.id', 's.hotel_id')
    .leftJoin('app.ativo as a', (j) =>
      j.onRef('a.hotel_id', '=', 's.hotel_id').onRef('a.id', '=', 's.ativo_id'),
    )
    .leftJoin('app.sinal_hospede_chamado as l', (j) =>
      j.onRef('l.tenant_id', '=', 's.tenant_id').onRef('l.sinal_id', '=', 's.id'),
    )
    .select([
      's.id',
      's.hotel_id',
      'h.bandeira_id',
      's.manutencao',
      's.uh_id',
      's.ativo_id',
      'a.local_id as local_do_ativo',
      'l.chamado_id',
    ])
    .where('s.id', '=', id)
    .executeTakeFirst();
  return s
    ? {
        id: s.id,
        hotelId: s.hotel_id,
        bandeiraId: s.bandeira_id,
        manutencao: s.manutencao,
        uhId: s.uh_id,
        ativoId: s.ativo_id,
        localDoAtivo: s.local_do_ativo,
        chamadoId: s.chamado_id,
      }
    : null;
}
