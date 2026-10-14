// Comunicação (1c, item 5; ADR-046), pelo hk_worker, um tenant por transação
// (withSistema), e a contagem do C8 pelo hk_app, com o contexto de quem pede.
// O worker lê o chamado do aviso, as atribuições dos papéis do nível, o
// responsável da OS ativa e as pessoas (membro e preferência de idioma), e
// grava o registro dos envios (app.envio_notificacao, só de inserção, 0049).
// A gravação é do repositório, na unit of work do worker (ADR-006).
import type { ContagemDeEnvios, PortaComunicacao } from '@hubkeep/aplicacao';
import type { ResponsavelDaOsAtiva } from '@hubkeep/dominio';
import { sql } from 'kysely';
import type { AcessoBanco } from './acesso';
import { paraAtribuicao, selecionarAtribuicoes } from './atribuicoes';
import { registrarEnvio } from './repositorios/comunicacao';

export function criarPortaComunicacao(banco: AcessoBanco): PortaComunicacao {
  return {
    chamadoDoAviso: (tenantId, chamadoId, papeis) =>
      banco.withSistema({ tenantId }, async (tx) => {
        const c = await tx
          .selectFrom('app.chamado as c')
          .innerJoin('app.hotel as h', (j) =>
            j.onRef('h.tenant_id', '=', 'c.tenant_id').onRef('h.id', '=', 'c.hotel_id'),
          )
          .innerJoin('app.tenant as t', 't.id', 'c.tenant_id')
          .select([
            'c.id',
            'c.descricao',
            'h.id as hotel_id',
            'h.nome as hotel_nome',
            'h.fuso',
            'h.bandeira_id',
            't.idioma_padrao',
          ])
          .where('c.id', '=', chamadoId)
          .where('c.tenant_id', '=', tenantId)
          .executeTakeFirst();
        if (!c) return null;
        const atribuicoes =
          papeis.length === 0
            ? []
            : (
                await selecionarAtribuicoes(tx)
                  .where('papel', 'in', [...papeis])
                  .where('revogado_em', 'is', null)
                  .execute()
              ).map(paraAtribuicao);
        const os = await tx
          .selectFrom('app.os')
          .select(['tecnico_id', 'equipe_id'])
          .where('hotel_id', '=', c.hotel_id)
          .where('chamado_id', '=', c.id)
          .where('estado', '<>', 'cancelada')
          .executeTakeFirst();
        let responsavelDaOs: ResponsavelDaOsAtiva = null;
        if (os?.tecnico_id) responsavelDaOs = { tipo: 'tecnico', usuarioId: os.tecnico_id };
        else if (os?.equipe_id) {
          const membros = await tx
            .selectFrom('app.equipe_membro')
            .select('usuario_id')
            .where('equipe_id', '=', os.equipe_id)
            .where('ativo', '=', true)
            .execute();
          responsavelDaOs = { tipo: 'equipe', membros: membros.map((m) => m.usuario_id) };
        }
        return {
          id: c.id,
          descricao: c.descricao,
          hotel: { id: c.hotel_id, nome: c.hotel_nome, fuso: c.fuso, bandeiraId: c.bandeira_id },
          idiomaDoTenant: c.idioma_padrao,
          atribuicoes,
          responsavelDaOs,
        };
      }),

    pessoas: (tenantId, usuarioIds) =>
      usuarioIds.length === 0
        ? Promise.resolve([])
        : banco.withSistema({ tenantId }, async (tx) =>
            (
              await tx
                .selectFrom('app.membro as m')
                .leftJoin('app.preferencia_membro as p', (j) =>
                  j
                    .onRef('p.tenant_id', '=', 'm.tenant_id')
                    .onRef('p.usuario_id', '=', 'm.usuario_id'),
                )
                .select(['m.usuario_id', 'm.ativo', 'm.email', 'p.idioma'])
                .where('m.usuario_id', 'in', [...usuarioIds])
                .orderBy('m.usuario_id')
                .execute()
            ).map((m) => ({
              usuarioId: m.usuario_id,
              ativo: m.ativo,
              email: m.email,
              idioma: m.idioma ?? null,
            })),
          ),

    jaEnviado: (tenantId, g) =>
      banco.withSistema({ tenantId }, async (tx) =>
        Boolean(
          await tx
            .selectFrom('app.envio_notificacao')
            .select('id')
            .where('evento_id', '=', g.eventoId)
            .where('usuario_id', '=', g.usuarioId)
            .where('canal', '=', g.canal)
            .where('situacao', '<>', 'falhou')
            .executeTakeFirst(),
        ),
      ),

    registrarEnvio: (tenantId, e) =>
      banco.executarComoSistema({ tenantId }, (uow) => registrarEnvio(uow, e)),

    contagemPorDia: (ctx, f) =>
      banco.withContext(ctx, async (tx): Promise<ContagemDeEnvios[]> => {
        const dia = sql<string>`to_char(e.criado_em at time zone 'UTC', 'YYYY-MM-DD')`;
        const linhas = await tx
          .selectFrom('app.envio_notificacao as e')
          .leftJoin('app.membro as m', (j) =>
            j.onRef('m.tenant_id', '=', 'e.tenant_id').onRef('m.usuario_id', '=', 'e.usuario_id'),
          )
          .select([
            'e.usuario_id',
            'm.nome',
            dia.as('dia'),
            (eb) => eb.fn.countAll<string>().as('envios'),
          ])
          .where('e.criado_em', '>=', f.de)
          .where('e.criado_em', '<', f.ate)
          .where('e.situacao', '<>', 'falhou')
          .$if(f.hotelId !== null, (q) => q.where('e.hotel_id', '=', f.hotelId ?? ''))
          .groupBy(['e.usuario_id', 'm.nome', dia])
          .execute();
        return linhas.map((l) => ({
          usuarioId: l.usuario_id,
          nome: l.nome ?? null,
          dia: l.dia,
          envios: Number(l.envios),
        }));
      }),
  };
}
