// A efetividade no painel do Intelligence (adendo ao ADR-033 de 15/10/2026),
// pelo hk_app com o contexto de quem pede: a RLS do chamado, da OS, da parada,
// do código de manutenção e da política recorta o que a pessoa lê. Aqui só IO;
// as regras (a OS que vale, a conclusão final, a lista de códigos de cada
// hotel, quem vê) são do packages/inteligencia, que este pacote não importa
// (ADR-037). Nada é gravado: a efetividade é calculada sob demanda.
import type { AcaoDaOs, EstadoDaOs, EstadoDoChamado, ExecutadoPor } from '@hubkeep/dominio';
import { type NotNull, sql } from 'kysely';
import type { Tx } from '../conexao';
import type { OsDoJob, PoliticaDoJob } from './inteligencia';

export interface OsDaEfetividadeNoBanco extends OsDoJob {
  codigoSolucaoId: string | null;
  /** `app.codigo_manutencao.chave_padrao` do código de solução. */
  codigoSolucaoChave: string | null;
  /** `app.fornecedor.nome`, quando a OS foi executada por fornecedor. */
  fornecedorNome: string | null;
}

export interface ChamadoDaEfetividadeNoBanco {
  id: string;
  hotelId: string;
  /** A bandeira do hotel, para resolver a política. */
  bandeiraId: string | null;
  localId: string;
  ativoId: string | null;
  abertaEm: Date;
  estado: EstadoDoChamado;
  impactoHospede: boolean | null;
  descricao: string;
  os: OsDaEfetividadeNoBanco[];
}

export interface ParadaDaEfetividadeNoBanco {
  ativoId: string;
  chamadoId: string;
  inicio: Date;
  fim: Date | null;
}

const CHAVE = 'inteligencia.efetividade';
const data = (v: Date | string) => (v instanceof Date ? v : new Date(v));

function porChave<T>(xs: readonly T[], k: (x: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const x of xs) {
    const lista = m.get(k(x));
    if (lista) lista.push(x);
    else m.set(k(x), [x]);
  }
  return m;
}

/** As linhas ativas de inteligencia.efetividade que quem pede lê. */
export async function politicasDaEfetividade(tx: Tx): Promise<PoliticaDoJob[]> {
  const linhas = await tx
    .selectFrom('app.politica')
    .select(['id', 'chave', 'escopo_tipo', 'hotel_id', 'bandeira_id', 'valor', 'atualizado_em'])
    .where('ativa', '=', true)
    .where('chave', '=', CHAVE)
    .orderBy('id')
    .execute();
  return linhas.map((l) => ({
    id: l.id,
    chave: l.chave,
    escopo: l.escopo_tipo as PoliticaDoJob['escopo'],
    hotelId: l.hotel_id,
    bandeiraId: l.bandeira_id,
    valor: l.valor,
    atualizadoEm: data(l.atualizado_em),
  }));
}

/** Os chamados destes ids, com as OS (e o código de solução), as transições e a bandeira do hotel. */
async function chamadosComOs(
  tx: Tx,
  ids: readonly string[],
): Promise<ChamadoDaEfetividadeNoBanco[]> {
  if (!ids.length) return [];
  const [chamados, oss, transicoes] = await Promise.all([
    tx
      .selectFrom('app.chamado as c')
      .innerJoin('app.hotel as h', 'h.id', 'c.hotel_id')
      .select([
        'c.id',
        'c.hotel_id',
        'h.bandeira_id',
        'c.local_id',
        'c.ativo_id',
        'c.criado_em',
        'c.estado',
        'c.impacto_hospede',
        'c.descricao',
      ])
      .where('c.id', 'in', [...ids])
      .orderBy('c.id')
      .execute(),
    tx
      .selectFrom('app.os as o')
      .leftJoin('app.codigo_manutencao as k', 'k.id', 'o.codigo_solucao_id')
      .leftJoin('app.fornecedor as f', 'f.id', 'o.fornecedor_id')
      .select([
        'o.id',
        'o.chamado_id',
        'o.estado',
        'o.criado_em',
        'o.codigo_falha_id',
        'o.codigo_solucao_id',
        'k.chave_padrao',
        'f.nome as fornecedor_nome',
        'o.executado_por',
        'o.fornecedor_id',
        'o.custo_informado',
      ])
      .where('o.chamado_id', 'in', [...ids])
      .$narrowType<{ chamado_id: NotNull }>()
      .execute(),
    tx
      .selectFrom('app.os_transicao as t')
      .innerJoin('app.os as o', (j) =>
        j.onRef('o.hotel_id', '=', 't.hotel_id').onRef('o.id', '=', 't.os_id'),
      )
      .select(['t.os_id', 't.acao', 't.para', 't.quando'])
      .where('o.chamado_id', 'in', [...ids])
      .orderBy('t.quando')
      .execute(),
  ]);
  const daOs = porChave(transicoes, (t) => t.os_id);
  const doChamado = porChave(oss, (o) => o.chamado_id);
  return chamados.map((c) => ({
    id: c.id,
    hotelId: c.hotel_id,
    bandeiraId: c.bandeira_id,
    localId: c.local_id,
    ativoId: c.ativo_id,
    abertaEm: data(c.criado_em),
    estado: c.estado as EstadoDoChamado,
    impactoHospede: c.impacto_hospede,
    descricao: c.descricao,
    os: (doChamado.get(c.id) ?? []).map((o) => ({
      estado: o.estado as EstadoDaOs,
      criadaEm: data(o.criado_em),
      codigoFalha: o.codigo_falha_id,
      codigoSolucaoId: o.codigo_solucao_id,
      codigoSolucaoChave: o.chave_padrao,
      fornecedorNome: o.fornecedor_nome,
      executadoPor: o.executado_por as ExecutadoPor,
      fornecedorId: o.fornecedor_id,
      custoInformado: o.custo_informado === null ? null : Number(o.custo_informado),
      transicoes: (daOs.get(o.id) ?? []).map((t) => ({
        acao: t.acao as AcaoDaOs,
        para: t.para as EstadoDaOs,
        quando: data(t.quando),
      })),
    })),
  }));
}

/**
 * Os chamados com ativo cuja OS tem um destes códigos de solução (pelo id ou
 * pela chave padrão) e foi concluída depois de `desde`; com `ativoIds`, só os
 * desses ativos. A conclusão final e a OS que vale, o motor decide.
 */
export async function intervencoesNoBanco(
  tx: Tx,
  filtro: { codigos: readonly string[]; desde: Date; ativoIds?: readonly string[] },
): Promise<ChamadoDaEfetividadeNoBanco[]> {
  if (!filtro.codigos.length) return [];
  const codigos = [...filtro.codigos];
  let consulta = tx
    .selectFrom('app.chamado as c')
    .innerJoin('app.os as o', (j) =>
      j.onRef('o.hotel_id', '=', 'c.hotel_id').onRef('o.chamado_id', '=', 'c.id'),
    )
    .leftJoin('app.codigo_manutencao as k', 'k.id', 'o.codigo_solucao_id')
    .select('c.id')
    .distinct()
    .where('c.ativo_id', 'is not', null)
    .where('o.codigo_solucao_id', 'is not', null)
    .where((eb) =>
      eb.or([
        eb(sql<string>`o.codigo_solucao_id::text`, 'in', codigos),
        eb('k.chave_padrao', 'in', codigos),
      ]),
    )
    .where((eb) =>
      eb.exists(
        eb
          .selectFrom('app.os_transicao as t')
          .select(sql<number>`1`.as('um'))
          .whereRef('t.hotel_id', '=', 'o.hotel_id')
          .whereRef('t.os_id', '=', 'o.id')
          .where('t.acao', '=', 'concluir')
          .where('t.quando', '>', filtro.desde),
      ),
    );
  if (filtro.ativoIds) {
    if (!filtro.ativoIds.length) return [];
    consulta = consulta.where('c.ativo_id', 'in', [...filtro.ativoIds]);
  }
  const ids = (await consulta.execute()).map((l) => l.id);
  return chamadosComOs(tx, ids);
}

/**
 * Os chamados dos ativos abertos até `ate`, e abertos depois de `desde` ou com
 * transição de OS nesse trecho (o custo conta pelo aceite); e as paradas dos
 * ativos que tocam o trecho.
 */
export async function historicoDosAtivosNoBanco(
  tx: Tx,
  ativoIds: readonly string[],
  desde: Date,
  ate: Date,
): Promise<{ chamados: ChamadoDaEfetividadeNoBanco[]; paradas: ParadaDaEfetividadeNoBanco[] }> {
  if (!ativoIds.length) return { chamados: [], paradas: [] };
  const [ids, paradas] = await Promise.all([
    tx
      .selectFrom('app.chamado as c')
      .select('c.id')
      .where('c.ativo_id', 'in', [...ativoIds])
      .where('c.criado_em', '<=', ate)
      .where((eb) =>
        eb.or([
          eb('c.criado_em', '>=', desde),
          eb.exists(
            eb
              .selectFrom('app.os as o')
              .innerJoin('app.os_transicao as t', (j) =>
                j.onRef('t.hotel_id', '=', 'o.hotel_id').onRef('t.os_id', '=', 'o.id'),
              )
              .select(sql<number>`1`.as('um'))
              .whereRef('o.hotel_id', '=', 'c.hotel_id')
              .whereRef('o.chamado_id', '=', 'c.id')
              .where('t.quando', '>=', desde)
              .where('t.quando', '<=', ate),
          ),
        ]),
      )
      .execute(),
    tx
      .selectFrom('app.parada_ativo')
      .select(['ativo_id', 'chamado_id', 'inicio', 'fim'])
      .where('ativo_id', 'in', [...ativoIds])
      .where('inicio', '<=', ate)
      .where((eb) => eb.or([eb('fim', 'is', null), eb('fim', '>', desde)]))
      .orderBy('inicio')
      .execute(),
  ]);
  return {
    chamados: await chamadosComOs(
      tx,
      ids.map((l) => l.id),
    ),
    paradas: paradas.map((p) => ({
      ativoId: p.ativo_id,
      chamadoId: p.chamado_id,
      inicio: data(p.inicio),
      fim: p.fim === null ? null : data(p.fim),
    })),
  };
}
