// Aceite automático (fase 1c, M5; ADR-044), na unit of work do hk_worker, um
// tenant por transação. Lê as OS corretivas concluídas, com a última conclusão
// (a transição concluir mais recente), quem abriu o chamado e as equipes ativas
// dele. O aceite trava a OS e o chamado na versão lida (FOR UPDATE): se um dos
// dois mudou, nada é gravado e a OS fica para a rodada seguinte. Depois grava,
// como o aceite manual (aceite.ts), mas sem autor: a OS, a transição
// aceitar_automatico com o usuário nulo (migração 0046), o reflexo no chamado,
// a auditoria e o evento os.aceita com automatico: true. O custo, os códigos
// e a assinatura não mudam.
import type { SessaoDoAceiteAutomatico } from '@hubkeep/aplicacao';
import type { EstadoDaOs, EstadoDoChamado, Responsavel } from '@hubkeep/dominio';
import { sql } from 'kysely';
import { novoId } from '../ids';
import { niveisDaPoliticaNaTransacao } from '../leituras-do-hotel';
import { transacaoDe, type UnidadeDeTrabalho } from '../unidade-de-trabalho';
import { refletirNoChamado } from './triagem';

export function sessaoDoAceiteAutomatico(uow: UnidadeDeTrabalho): SessaoDoAceiteAutomatico {
  const tx = transacaoDe(uow);
  return {
    osConcluidas: async () =>
      (
        await tx
          .selectFrom('app.os as o')
          .innerJoin('app.chamado as c', (j) =>
            j.onRef('c.hotel_id', '=', 'o.hotel_id').onRef('c.id', '=', 'o.chamado_id'),
          )
          .select([
            'o.id',
            'o.hotel_id',
            'o.versao',
            'o.estado',
            'o.tecnico_id',
            'o.equipe_id',
            'o.codigo_falha_id',
            'o.codigo_causa_id',
            'o.codigo_solucao_id',
            'c.id as chamado_id',
            'c.versao as versao_do_chamado',
            'c.estado as estado_do_chamado',
            'c.aberto_por',
            sql<Date | null>`(select max(t.quando) from app.os_transicao t
                    where t.hotel_id = o.hotel_id and t.os_id = o.id and t.acao = 'concluir')`.as(
              'concluida_em',
            ),
            sql<string[] | null>`(select array_agg(em.equipe_id order by em.equipe_id)
                    from app.equipe_membro em
                    join app.equipe e on e.hotel_id = em.hotel_id and e.id = em.equipe_id
                    where em.usuario_id = c.aberto_por and em.ativo and e.ativa)`.as(
              'equipes_de_quem_abriu',
            ),
          ])
          .where('o.estado', '=', 'concluida')
          .orderBy(sql`concluida_em asc nulls last`)
          .orderBy('o.id')
          .execute()
      ).flatMap((o) => {
        const responsavel: Responsavel | null = o.tecnico_id
          ? { tipo: 'tecnico', usuarioId: o.tecnico_id }
          : o.equipe_id
            ? { tipo: 'equipe', equipeId: o.equipe_id }
            : null;
        if (!responsavel) return [];
        return [
          {
            id: o.id,
            hotelId: o.hotel_id,
            versao: o.versao,
            chamadoId: o.chamado_id,
            versaoDoChamado: o.versao_do_chamado,
            estado: o.estado as EstadoDaOs,
            concluidaEm: o.concluida_em ? new Date(o.concluida_em) : null,
            estadoDoChamado: o.estado_do_chamado as EstadoDoChamado,
            abertoPor: o.aberto_por,
            equipesDeQuemAbriu: o.equipes_de_quem_abriu ?? [],
            responsavel,
            codigos: {
              falhaId: o.codigo_falha_id,
              causaId: o.codigo_causa_id,
              solucaoId: o.codigo_solucao_id,
            },
          },
        ];
      }),
    politica: (hotelId, chave) => niveisDaPoliticaNaTransacao(tx, hotelId, chave),
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
    aceitar: async (a) => {
      const os = await tx
        .selectFrom('app.os')
        .select(['estado', 'situacao_id', 'versao'])
        .where('id', '=', a.osId)
        .forUpdate()
        .executeTakeFirst();
      const chamado = await tx
        .selectFrom('app.chamado')
        .select(['versao'])
        .where('id', '=', a.chamado.id)
        .forUpdate()
        .executeTakeFirst();
      if (os?.versao !== a.versao || chamado?.versao !== a.chamado.versao) return false;
      const r = await tx
        .updateTable('app.os')
        .set({
          estado: 'aceita',
          situacao_id: a.situacaoId,
          versao: sql<number>`versao + 1`,
          atualizado_em: sql`now()`,
        })
        .where('id', '=', a.osId)
        .where('versao', '=', a.versao)
        .returning(['hotel_id', 'chamado_id', 'versao'])
        .executeTakeFirstOrThrow();
      await tx
        .insertInto('app.os_transicao')
        .values({
          id: novoId(),
          tenant_id: uow.tenantId,
          hotel_id: r.hotel_id,
          os_id: a.osId,
          acao: 'aceitar_automatico',
          de: os.estado,
          para: 'aceita',
        })
        .execute();
      await refletirNoChamado(uow, a.chamado);
      uow.auditar({
        entidade: 'os',
        registroId: a.osId,
        acao: 'aceitar_automatico',
        hotelId: r.hotel_id,
        antes: os,
        depois: {
          situacaoId: a.situacaoId,
          versao: r.versao,
          estadoDoChamado: a.chamado.estado,
          concluidaEm: a.concluidaEm.toISOString(),
          dias: a.dias,
        },
      });
      uow.publicar({
        tipo: 'os.aceita',
        entidade: 'os',
        registroId: a.osId,
        payload: { hotelId: r.hotel_id, chamadoId: r.chamado_id, automatico: true },
      });
      return true;
    },
  };
}
