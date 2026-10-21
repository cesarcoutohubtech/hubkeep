// Geração da OS preventiva (fase 1b, PV3; ADR-041), na unit of work do
// hk_worker, uma transação por hotel (decisão 13). Lê o que a regra precisa
// (os planos ativos, o responsável de cada um, os ativos do alvo, as OS que o
// plano já gerou, as situações, a política e o modelo de checklist) e grava,
// sem autor (migração 0048): a OS atribuída, a transição gerar, a cópia do
// checklist, a auditoria os/gerar e o evento os.atribuida, na mesma transação.
// A OS do locador (ADR-045) nasce com a hora do aviso e o os.locador_avisado,
// como a corretiva (#261).
//
// Duas execuções ao mesmo tempo: a primeira trava o hotel com um advisory lock
// de transação (função do próprio Postgres, sem função nova no projeto), e a
// segunda pula o hotel. O SELECT ... FOR UPDATE nos planos pediria UPDATE do
// worker em app.plano_preventivo, que ele não tem. O índice único (plano,
// ativo, data prevista) segura o que escapar: a gravação da mesma ocorrência
// não faz nada (ON CONFLICT DO NOTHING) e volta false.
import type {
  AtivoDoAlvo,
  HotelParaGerar,
  ModeloParaACopia,
  PlanoDoHotel,
  SessaoDaGeracao,
} from '@hubkeep/aplicacao';
import {
  type EstadoDaOs,
  type Responsavel,
  type UnidadeDePeriodicidade,
  ehModeloContratual,
} from '@hubkeep/dominio';
import { sql } from 'kysely';
import { cadastroAprovado } from '../cadastro-aprovado';
import type { Tx } from '../conexao';
import { novoId } from '../ids';
import { responsaveisDosPlanos } from '../responsaveis-do-plano';
import { niveisDaPoliticaNaTransacao } from '../leituras-do-hotel';
import { instanteDoRoteiro, transacaoDe, type UnidadeDeTrabalho } from '../unidade-de-trabalho';
import { datasDaCriacao } from './instante-do-roteiro';
import { avisarLocador } from './triagem';

const colunasDoResponsavel = (r: Responsavel) =>
  r.tipo === 'tecnico'
    ? { tecnico_id: r.usuarioId, equipe_id: null }
    : { tecnico_id: null, equipe_id: r.equipeId };

/** Os hotéis com status ativo do tenant do job, com o fuso e o modelo contratual. */
export async function hoteisParaGerar(tx: Tx): Promise<HotelParaGerar[]> {
  return (
    await tx
      .selectFrom('app.hotel')
      .select(['id', 'bandeira_id', 'fuso', 'modelo_contratual'])
      .where('status', '=', 'ativo')
      .orderBy('id')
      .execute()
  ).map((h) => ({
    id: h.id,
    bandeiraId: h.bandeira_id,
    fuso: h.fuso,
    modeloContratual: ehModeloContratual(h.modelo_contratual) ? h.modelo_contratual : null,
  }));
}

export function sessaoDaGeracao(uow: UnidadeDeTrabalho, hotelId: string): SessaoDaGeracao {
  const tx = transacaoDe(uow);
  return {
    planosAtivos: async () => {
      const trava = await sql<{ travou: boolean }>`
        select pg_try_advisory_xact_lock(hashtextextended(${`hubkeep:preventiva:${hotelId}`}, 0)) as travou`.execute(
        tx,
      );
      if (!trava.rows[0]?.travou) return [];
      const planos = await tx
        .selectFrom('app.plano_preventivo')
        .select([
          'id',
          'nome',
          'versao',
          sql<string>`inicio::text`.as('inicio'),
          'intervalo',
          'unidade',
          'checklist_modelo_id',
          'tecnico_id',
          'equipe_id',
        ])
        .where('hotel_id', '=', hotelId)
        .where('situacao', '=', 'ativo')
        .orderBy('id')
        .execute();
      const responsaveis = await responsaveisDosPlanos(tx, planos);
      return planos.map((p): PlanoDoHotel => ({
        id: p.id,
        nome: p.nome,
        versao: p.versao,
        inicio: p.inicio,
        intervalo: p.intervalo,
        // O check plano_preventivo_unidade_lista repete os valores do domínio.
        unidade: p.unidade as UnidadeDePeriodicidade,
        checklistModeloId: p.checklist_modelo_id,
        responsavel: responsaveis.get(p.id) ?? null,
      }));
    },

    ativosDoAlvo: async (planoId) =>
      (
        await tx
          .selectFrom('app.ativo as a')
          .innerJoin('app.plano_preventivo as p', (j) =>
            j
              .onRef('p.hotel_id', '=', 'a.hotel_id')
              .on((eb) =>
                eb.or([
                  eb('p.ativo_id', '=', eb.ref('a.id')),
                  eb('p.categoria_id', '=', eb.ref('a.categoria_id')),
                ]),
              ),
          )
          .select(['a.id', 'a.local_id', 'a.categoria_id', 'a.criado_em'])
          .where('p.id', '=', planoId)
          .where('a.hotel_id', '=', hotelId)
          .where('a.desativado_em', 'is', null)
          // O ativo pendente de aprovação do cadastro fica fora até ser aprovado (M4).
          .where(cadastroAprovado)
          .orderBy('a.id')
          .execute()
      ).map((a): AtivoDoAlvo => ({
        id: a.id,
        localId: a.local_id,
        categoriaId: a.categoria_id,
        criadoEm: a.criado_em,
      })),

    geradas: async (planoId) =>
      (
        await tx
          .selectFrom('app.os')
          .select(['ativo_id', sql<string>`data_prevista::text`.as('data_prevista'), 'estado'])
          .where('hotel_id', '=', hotelId)
          .where('plano_id', '=', planoId)
          .execute()
      ).flatMap((o) =>
        o.ativo_id === null
          ? []
          : [
              {
                ativoId: o.ativo_id,
                dataPrevista: o.data_prevista,
                estado: o.estado as EstadoDaOs,
              },
            ],
      ),

    situacoes: async () =>
      (
        await tx
          .selectFrom('app.situacao')
          .select(['id', 'entidade', 'estado', 'ordem', 'ativa'])
          .execute()
      ).map((s) => ({
        id: s.id,
        entidade: s.entidade as 'chamado' | 'os',
        estado: s.estado,
        ordem: s.ordem,
        ativa: s.ativa,
      })),

    politica: (chave) => niveisDaPoliticaNaTransacao(tx, hotelId, chave),

    modeloDeChecklist: async (id): Promise<ModeloParaACopia | null> => {
      const m = await tx
        .selectFrom('app.checklist_modelo')
        .select(['id', 'versao', 'nomes', 'itens', 'ativa'])
        .where('id', '=', id)
        .executeTakeFirst();
      return m
        ? {
            id: m.id,
            versao: m.versao,
            nomes: m.nomes as object,
            itens: m.itens as object[],
            ativa: m.ativa,
          }
        : null;
    },

    gerar: async (os) => {
      const id = novoId();
      const gravada = await tx
        .insertInto('app.os')
        .values({
          id,
          tenant_id: uow.tenantId,
          hotel_id: hotelId,
          local_id: os.localId,
          plano_id: os.planoId,
          ativo_id: os.ativoId,
          data_prevista: os.dataPrevista,
          plano_aplicado: JSON.stringify(os.planoAplicado),
          estado: 'atribuida',
          situacao_id: os.situacaoId,
          ...colunasDoResponsavel(os.responsavel),
          responsavel_arrendamento: os.responsavelArrendamento,
          locador_avisado_em: os.avisarLocador ? sql<Date>`now()` : null,
          ...datasDaCriacao(uow),
        })
        .onConflict((oc) =>
          oc
            .columns(['hotel_id', 'plano_id', 'ativo_id', 'data_prevista'])
            .where('plano_id', 'is not', null)
            .doNothing(),
        )
        .returning('id')
        .executeTakeFirst();
      if (!gravada) return false;
      const quando = instanteDoRoteiro(uow);
      await tx
        .insertInto('app.os_transicao')
        .values({
          id: novoId(),
          tenant_id: uow.tenantId,
          hotel_id: hotelId,
          os_id: id,
          acao: 'gerar',
          de: null,
          para: 'atribuida',
          ...(quando ? { quando } : {}),
        })
        .execute();
      const checklistId = os.checklist ? novoId() : null;
      if (os.checklist && checklistId) {
        await tx
          .insertInto('app.os_checklist')
          .values({
            id: checklistId,
            tenant_id: uow.tenantId,
            hotel_id: hotelId,
            os_id: id,
            modelo_id: os.checklist.id,
            modelo_versao: os.checklist.versao,
            nomes: JSON.stringify(os.checklist.nomes),
            itens: JSON.stringify(os.checklist.itens),
          })
          .execute();
      }
      uow.auditar({
        entidade: 'os',
        registroId: id,
        acao: 'gerar',
        hotelId,
        depois: {
          planoId: os.planoId,
          ativoId: os.ativoId,
          dataPrevista: os.dataPrevista,
          responsavel: os.responsavel,
          situacaoId: os.situacaoId,
          planoAplicado: os.planoAplicado,
          checklist: os.checklist
            ? { id: checklistId, modeloId: os.checklist.id, modeloVersao: os.checklist.versao }
            : null,
          responsavelArrendamento: os.responsavelArrendamento,
        },
      });
      if (os.avisarLocador) avisarLocador(uow, { osId: id, hotelId, chamadoId: null });
      uow.publicar({
        tipo: 'os.atribuida',
        entidade: 'os',
        registroId: id,
        payload: {
          hotelId,
          chamadoId: null,
          planoId: os.planoId,
          ativoId: os.ativoId,
          dataPrevista: os.dataPrevista,
          acao: 'gerar',
          responsavel: os.responsavel,
        },
      });
      return true;
    },
  };
}
