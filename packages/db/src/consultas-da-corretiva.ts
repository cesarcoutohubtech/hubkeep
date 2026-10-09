// Consultas da corretiva (fase 1a, C7): listas de chamados e OS, nomes do
// detalhe e linha do tempo do chamado. Só leitura, com withContext: a RLS
// recorta tudo ao escopo de quem pede. Os nomes vêm por left join, então o
// hotel, o local, o ativo, a pessoa ou a equipe que ele não lê vem null, sem
// esconder o chamado ou a OS que ele lê.
import type {
  ChamadoResumido,
  EventoDaLinhaDoTempo,
  NomesDoChamado,
  OsResumida,
  PortaConsultasDaCorretiva,
} from '@hubkeep/aplicacao';
import {
  type EntidadeDaLinhaDoTempo,
  type EstadoDaOs,
  type EstadoDoChamado,
  type FiltroDaLista,
  motivoDaAuditoria,
} from '@hubkeep/dominio';
import type { AcessoBanco } from './acesso';

export function criarPortaConsultasDaCorretiva(banco: AcessoBanco): PortaConsultasDaCorretiva {
  return {
    chamados: (ctx, f: FiltroDaLista, limite) =>
      banco.withContext(ctx, async (tx): Promise<ChamadoResumido[]> => {
        const linhas = await tx
          .selectFrom('app.chamado as c')
          .leftJoin('app.hotel as h', (j) =>
            j.onRef('h.tenant_id', '=', 'c.tenant_id').onRef('h.id', '=', 'c.hotel_id'),
          )
          .leftJoin('app.local as l', (j) =>
            j.onRef('l.tenant_id', '=', 'c.tenant_id').onRef('l.id', '=', 'c.local_id'),
          )
          .leftJoin('app.ativo as a', (j) =>
            j.onRef('a.tenant_id', '=', 'c.tenant_id').onRef('a.id', '=', 'c.ativo_id'),
          )
          .select([
            'c.id',
            'c.hotel_id',
            'h.nome as hotel_nome',
            'c.local_id',
            'l.nome as local_nome',
            'c.ativo_id',
            'a.nome as ativo_nome',
            'c.descricao',
            'c.estado',
            'c.situacao_id',
            'c.prioridade_id',
            'c.criado_em',
          ])
          .$if(f.hotelId !== null, (q) => q.where('c.hotel_id', '=', f.hotelId ?? ''))
          .$if(f.situacaoId !== null, (q) => q.where('c.situacao_id', '=', f.situacaoId ?? ''))
          .$if(f.prioridadeId !== null, (q) =>
            q.where('c.prioridade_id', '=', f.prioridadeId ?? ''),
          )
          .$if(f.de !== null, (q) => q.where('c.criado_em', '>=', f.de ?? new Date(0)))
          .$if(f.ate !== null, (q) => q.where('c.criado_em', '<', f.ate ?? new Date(0)))
          .$if(f.depoisDe !== null, (q) => q.where('c.id', '<', f.depoisDe ?? ''))
          .orderBy('c.id', 'desc')
          .limit(limite)
          .execute();
        return linhas.map((c) => ({
          id: c.id,
          hotelId: c.hotel_id,
          hotelNome: c.hotel_nome,
          localId: c.local_id,
          localNome: c.local_nome,
          ativoId: c.ativo_id,
          ativoNome: c.ativo_nome,
          descricao: c.descricao,
          estado: c.estado as EstadoDoChamado,
          situacaoId: c.situacao_id,
          prioridadeId: c.prioridade_id,
          criadoEm: c.criado_em,
        }));
      }),

    os: (ctx, f: FiltroDaLista, limite) =>
      banco.withContext(ctx, async (tx): Promise<OsResumida[]> => {
        const linhas = await tx
          .selectFrom('app.os as o')
          .leftJoin('app.chamado as c', (j) =>
            j.onRef('c.tenant_id', '=', 'o.tenant_id').onRef('c.id', '=', 'o.chamado_id'),
          )
          .leftJoin('app.hotel as h', (j) =>
            j.onRef('h.tenant_id', '=', 'o.tenant_id').onRef('h.id', '=', 'o.hotel_id'),
          )
          .leftJoin('app.local as l', (j) =>
            j.onRef('l.tenant_id', '=', 'o.tenant_id').onRef('l.id', '=', 'o.local_id'),
          )
          .leftJoin('app.membro as m', (j) =>
            j.onRef('m.tenant_id', '=', 'o.tenant_id').onRef('m.usuario_id', '=', 'o.tecnico_id'),
          )
          .leftJoin('app.equipe as e', (j) =>
            j.onRef('e.tenant_id', '=', 'o.tenant_id').onRef('e.id', '=', 'o.equipe_id'),
          )
          .select([
            'o.id',
            'o.hotel_id',
            'h.nome as hotel_nome',
            'o.chamado_id',
            'l.nome as local_nome',
            'c.descricao',
            'c.prioridade_id',
            'o.estado',
            'o.situacao_id',
            'o.tecnico_id',
            'o.equipe_id',
            'm.nome as tecnico_nome',
            'e.nome as equipe_nome',
            'o.criado_em',
          ])
          .$if(f.hotelId !== null, (q) => q.where('o.hotel_id', '=', f.hotelId ?? ''))
          .$if(f.situacaoId !== null, (q) => q.where('o.situacao_id', '=', f.situacaoId ?? ''))
          .$if(f.prioridadeId !== null, (q) =>
            q.where('c.prioridade_id', '=', f.prioridadeId ?? ''),
          )
          .$if(f.de !== null, (q) => q.where('o.criado_em', '>=', f.de ?? new Date(0)))
          .$if(f.ate !== null, (q) => q.where('o.criado_em', '<', f.ate ?? new Date(0)))
          .$if(f.depoisDe !== null, (q) => q.where('o.id', '<', f.depoisDe ?? ''))
          .orderBy('o.id', 'desc')
          .limit(limite)
          .execute();
        return linhas.map((o) => ({
          id: o.id,
          hotelId: o.hotel_id,
          hotelNome: o.hotel_nome,
          chamadoId: o.chamado_id,
          localNome: o.local_nome,
          descricao: o.descricao,
          prioridadeId: o.prioridade_id,
          estado: o.estado as EstadoDaOs,
          situacaoId: o.situacao_id,
          // O check os_um_responsavel garante exatamente um dos dois.
          responsavel:
            o.tecnico_id !== null
              ? { tipo: 'tecnico', usuarioId: o.tecnico_id }
              : { tipo: 'equipe', equipeId: o.equipe_id ?? '' },
          responsavelNome: o.tecnico_id !== null ? o.tecnico_nome : o.equipe_nome,
          criadoEm: o.criado_em,
        }));
      }),

    nomesDoChamado: (ctx, chamadoId) =>
      banco.withContext(ctx, async (tx): Promise<NomesDoChamado | null> => {
        const c = await tx
          .selectFrom('app.chamado as c')
          .leftJoin('app.hotel as h', (j) =>
            j.onRef('h.tenant_id', '=', 'c.tenant_id').onRef('h.id', '=', 'c.hotel_id'),
          )
          .leftJoin('app.local as l', (j) =>
            j.onRef('l.tenant_id', '=', 'c.tenant_id').onRef('l.id', '=', 'c.local_id'),
          )
          .leftJoin('app.ativo as a', (j) =>
            j.onRef('a.tenant_id', '=', 'c.tenant_id').onRef('a.id', '=', 'c.ativo_id'),
          )
          .leftJoin('app.membro as m', (j) =>
            j.onRef('m.tenant_id', '=', 'c.tenant_id').onRef('m.usuario_id', '=', 'c.aberto_por'),
          )
          .select([
            'c.aberto_por',
            'h.nome as hotel',
            'l.nome as local',
            'a.nome as ativo',
            'm.nome as aberto_por_nome',
          ])
          .where('c.id', '=', chamadoId)
          .executeTakeFirst();
        if (!c) return null;
        const responsaveis = await tx
          .selectFrom('app.os as o')
          .leftJoin('app.membro as m', (j) =>
            j.onRef('m.tenant_id', '=', 'o.tenant_id').onRef('m.usuario_id', '=', 'o.tecnico_id'),
          )
          .leftJoin('app.equipe as e', (j) =>
            j.onRef('e.tenant_id', '=', 'o.tenant_id').onRef('e.id', '=', 'o.equipe_id'),
          )
          .select([
            'o.tecnico_id',
            'm.nome as tecnico_nome',
            'o.equipe_id',
            'e.nome as equipe_nome',
          ])
          .where('o.chamado_id', '=', chamadoId)
          .execute();
        const pessoas: Record<string, string> = {};
        const equipes: Record<string, string> = {};
        if (c.aberto_por_nome !== null) pessoas[c.aberto_por] = c.aberto_por_nome;
        for (const r of responsaveis) {
          if (r.tecnico_id !== null && r.tecnico_nome !== null)
            pessoas[r.tecnico_id] = r.tecnico_nome;
          if (r.equipe_id !== null && r.equipe_nome !== null) equipes[r.equipe_id] = r.equipe_nome;
        }
        return { hotel: c.hotel, local: c.local, ativo: c.ativo, pessoas, equipes };
      }),

    linhaDoTempo: (ctx, chamadoId) =>
      banco.withContext(ctx, async (tx): Promise<EventoDaLinhaDoTempo[]> => {
        const linhas = await tx
          .selectFrom('app.auditoria as a')
          .leftJoin('app.membro as m', (j) =>
            j.onRef('m.tenant_id', '=', 'a.tenant_id').onRef('m.usuario_id', '=', 'a.usuario_id'),
          )
          .select([
            'a.id',
            'a.em',
            'a.entidade',
            'a.registro_id',
            'a.acao',
            'a.usuario_id',
            'm.nome as usuario_nome',
            'a.depois',
          ])
          .where((eb) =>
            eb.or([
              eb.and([eb('a.entidade', '=', 'chamado'), eb('a.registro_id', '=', chamadoId)]),
              eb.and([
                eb('a.entidade', '=', 'os'),
                eb(
                  'a.registro_id',
                  'in',
                  eb.selectFrom('app.os').select('id').where('chamado_id', '=', chamadoId),
                ),
              ]),
              eb.and([
                eb('a.entidade', '=', 'parada_ativo'),
                eb(
                  'a.registro_id',
                  'in',
                  eb
                    .selectFrom('app.parada_ativo')
                    .select('id')
                    .where('chamado_id', '=', chamadoId),
                ),
              ]),
              eb.and([
                eb('a.entidade', '=', 'uh_indisponivel'),
                eb(
                  'a.registro_id',
                  'in',
                  eb
                    .selectFrom('app.uh_indisponivel')
                    .select('id')
                    .where('chamado_id', '=', chamadoId),
                ),
              ]),
            ]),
          )
          .orderBy('a.em')
          .orderBy('a.id')
          .execute();
        return linhas.map((a) => ({
          id: a.id,
          em: a.em,
          entidade: a.entidade as EntidadeDaLinhaDoTempo,
          registroId: a.registro_id,
          acao: a.acao,
          usuarioId: a.usuario_id,
          usuarioNome: a.usuario_nome,
          motivo: motivoDaAuditoria(a.depois),
        }));
      }),
  };
}
