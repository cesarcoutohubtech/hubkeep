// Leitura do painel de indicadores (1c, item 8). Só leitura, com withContext:
// a RLS decide que hotéis, chamados, OS, períodos de UH e apontamentos o
// usuário lê. As consultas trazem só o que pode contar no período (a porta
// diz o recorte); o cálculo, e o corte fino no fuso de cada hotel, são do
// domínio. As transições vêm só com as ações que mudam a conclusão do serviço.
import type {
  DadosDoHotel,
  HotelDoPainel,
  JanelaDosIndicadores,
  PortaIndicadores,
} from '@hubkeep/aplicacao';
import type {
  EstadoDaOs,
  EstadoDoChamado,
  NiveisDePolitica,
  TransicaoDoServico,
} from '@hubkeep/dominio';
import { type SqlBool, sql } from 'kysely';
import type { AcessoBanco } from './acesso';
import { politicasDoHotel } from './leituras-do-hotel';

const ACOES_DA_CONCLUSAO = ['concluir', 'reabrir', 'cancelar'] as const;
const ESTADOS_EM_ABERTO = ['aberto', 'em_triagem', 'em_execucao', 'aguardando_aceite'] as const;

type TransicaoCrua = { acao: TransicaoDoServico['acao']; quando: string };
const transicoes = (t: TransicaoCrua[] | null): TransicaoDoServico[] =>
  (t ?? []).map((x) => ({ acao: x.acao, quando: new Date(x.quando) }));

/** As transições que mudam a conclusão, da OS da linha `o`, em json. */
const transicoesDaOs = sql<TransicaoCrua[] | null>`(select json_agg(json_build_object(
    'acao', t.acao, 'quando', t.quando) order by t.quando, t.id)
  from app.os_transicao t
  where t.hotel_id = o.hotel_id and t.os_id = o.id
    and t.acao in (${sql.join(ACOES_DA_CONCLUSAO.map((a) => sql.lit(a)))}))`;

const novoDado = (): DadosDoHotel => ({
  chamados: [],
  preventivas: [],
  periodosDeUh: [],
  apontamentos: [],
});

export function criarPortaIndicadores(banco: AcessoBanco): PortaIndicadores {
  return {
    hoteis: (ctx, filtro) =>
      banco.withContext(ctx, async (tx) => {
        let q = tx
          .selectFrom('app.hotel as h')
          .leftJoin('app.bandeira as b', 'b.id', 'h.bandeira_id')
          .select([
            'h.id',
            'h.nome',
            'h.fuso',
            'h.bandeira_id',
            'b.nome as bandeira_nome',
            sql<number>`(select count(*)::int from app.local l
              where l.hotel_id = h.id and l.tipo = 'uh' and l.status = 'ativo')`.as('uhs_ativas'),
            sql<boolean>`(h.id in (select authz.hoteis_proprietario())
              or h.id in (select lp.hotel_id from authz.locais_proprietario() lp))`.as(
              'do_usuario_como_proprietario',
            ),
          ])
          .where('h.status', '=', 'ativo')
          .orderBy('h.nome')
          .orderBy('h.id');
        if (filtro.hotelId) q = q.where('h.id', '=', filtro.hotelId);
        if (filtro.bandeiraId) q = q.where('h.bandeira_id', '=', filtro.bandeiraId);
        return (await q.execute()).map((h): HotelDoPainel => ({
          id: h.id,
          nome: h.nome,
          fuso: h.fuso,
          bandeiraId: h.bandeira_id,
          bandeiraNome: h.bandeira_nome,
          uhsAtivas: h.uhs_ativas,
          doUsuarioComoProprietario: h.do_usuario_como_proprietario,
        }));
      }),

    dados: (ctx, janela: JanelaDosIndicadores) =>
      banco.withContext(ctx, async (tx) => {
        const por = new Map<string, DadosDoHotel>(janela.hotelIds.map((id) => [id, novoDado()]));
        if (janela.hotelIds.length === 0) return por;
        const ids = [...janela.hotelIds];
        const { de, ate } = janela;
        const doHotel = (id: string) => por.get(id) ?? novoDado();

        // Chamados: não cancelados, abertos antes do fim, e em aberto, com o
        // prazo de solução no período ou com transição de OS desde o começo.
        const chamados = await tx
          .selectFrom('app.chamado as c')
          .select([
            'c.id',
            'c.hotel_id',
            'c.estado',
            'c.criado_em',
            'c.prazo_solucao',
            'c.pausado_segundos',
            'c.categoria_id',
          ])
          .where('c.hotel_id', 'in', ids)
          .where('c.estado', '<>', 'cancelado')
          .where('c.criado_em', '<', ate)
          .where((eb) =>
            eb.or([
              eb('c.estado', 'in', ESTADOS_EM_ABERTO),
              eb.and([eb('c.prazo_solucao', '>=', de), eb('c.prazo_solucao', '<', ate)]),
              eb.exists(
                eb
                  .selectFrom('app.os as o')
                  .innerJoin('app.os_transicao as t', (j) =>
                    j.onRef('t.hotel_id', '=', 'o.hotel_id').onRef('t.os_id', '=', 'o.id'),
                  )
                  .select('t.id')
                  .whereRef('o.hotel_id', '=', 'c.hotel_id')
                  .whereRef('o.chamado_id', '=', 'c.id')
                  .where('t.quando', '>=', de),
              ),
            ]),
          )
          .execute();
        const osDoChamado = new Map<string, DadosDoHotel['chamados'][number]['os'][number][]>();
        if (chamados.length > 0) {
          const oss = await tx
            .selectFrom('app.os as o')
            .select([
              'o.id',
              'o.chamado_id',
              'o.estado',
              'o.equipe_id',
              transicoesDaOs.as('transicoes'),
            ])
            .where('o.hotel_id', 'in', ids)
            .where(sql<SqlBool>`o.chamado_id = any(${chamados.map((c) => c.id)}::uuid[])`)
            .execute();
          for (const o of oss) {
            if (!o.chamado_id) continue;
            osDoChamado.set(o.chamado_id, [
              ...(osDoChamado.get(o.chamado_id) ?? []),
              {
                id: o.id,
                estado: o.estado as EstadoDaOs,
                equipeId: o.equipe_id,
                transicoes: transicoes(o.transicoes),
              },
            ]);
          }
        }
        for (const c of chamados) {
          doHotel(c.hotel_id).chamados.push({
            id: c.id,
            estado: c.estado as EstadoDoChamado,
            abertoEm: c.criado_em,
            prazoSolucao: c.prazo_solucao,
            categoriaId: c.categoria_id,
            pausadoSegundos: c.pausado_segundos,
            os: osDoChamado.get(c.id) ?? [],
          });
        }

        // Preventivas: a data prevista no período, a conclusão nele ou um apontamento nele.
        const preventivas = await tx
          .selectFrom('app.os as o')
          .select([
            'o.id',
            'o.hotel_id',
            'o.estado',
            'o.equipe_id',
            sql<string>`o.data_prevista::text`.as('data_prevista'),
            transicoesDaOs.as('transicoes'),
          ])
          .where('o.hotel_id', 'in', ids)
          .where('o.plano_id', 'is not', null)
          .where('o.data_prevista', 'is not', null)
          .where((eb) =>
            eb.or([
              sql<SqlBool>`o.data_prevista between ${janela.diaInicio}::date and ${janela.diaFim}::date`,
              eb.exists(
                eb
                  .selectFrom('app.os_transicao as t')
                  .select('t.id')
                  .whereRef('t.hotel_id', '=', 'o.hotel_id')
                  .whereRef('t.os_id', '=', 'o.id')
                  .where('t.acao', '=', 'concluir')
                  .where('t.quando', '>=', de)
                  .where('t.quando', '<', ate),
              ),
              eb.exists(
                eb
                  .selectFrom('app.os_apontamento as a')
                  .select('a.id')
                  .whereRef('a.hotel_id', '=', 'o.hotel_id')
                  .whereRef('a.os_id', '=', 'o.id')
                  .where('a.inicio', '<', ate)
                  .where('a.fim', '>', de),
              ),
            ]),
          )
          .execute();
        for (const p of preventivas) {
          doHotel(p.hotel_id).preventivas.push({
            id: p.id,
            estado: p.estado as EstadoDaOs,
            equipeId: p.equipe_id,
            dataPrevista: p.data_prevista,
            transicoes: transicoes(p.transicoes),
          });
        }

        // Períodos de UH indisponível que cruzam o intervalo, com o chamado cancelado marcado.
        const periodos = await tx
          .selectFrom('app.uh_indisponivel as u')
          .innerJoin('app.chamado as c', (j) =>
            j.onRef('c.hotel_id', '=', 'u.hotel_id').onRef('c.id', '=', 'u.chamado_id'),
          )
          .select(['u.chamado_id', 'u.hotel_id', 'u.local_id', 'u.inicio', 'u.fim', 'c.estado'])
          .where('u.hotel_id', 'in', ids)
          .where('u.inicio', '<', ate)
          .where((eb) => eb.or([eb('u.fim', 'is', null), eb('u.fim', '>', de)]))
          .execute();
        for (const u of periodos) {
          doHotel(u.hotel_id).periodosDeUh.push({
            chamadoId: u.chamado_id,
            hotelId: u.hotel_id,
            localId: u.local_id,
            inicio: u.inicio,
            fim: u.fim,
            chamadoCancelado: u.estado === 'cancelado',
          });
        }

        // Apontamentos que cruzam o intervalo.
        const apontamentos = await tx
          .selectFrom('app.os_apontamento')
          .select(['os_id', 'hotel_id', 'inicio', 'fim'])
          .where('hotel_id', 'in', ids)
          .where('inicio', '<', ate)
          .where('fim', '>', de)
          .execute();
        for (const a of apontamentos) {
          doHotel(a.hotel_id).apontamentos.push({ osId: a.os_id, inicio: a.inicio, fim: a.fim });
        }
        return por;
      }),

    politicas: (ctx, hotelIds, chaves) =>
      banco.withContext(ctx, async (tx) => {
        const por = new Map<string, Map<string, NiveisDePolitica>>();
        if (chaves.length === 0) return por;
        for (const hotelId of hotelIds) {
          const linhas = await politicasDoHotel(tx, hotelId)
            .select(['chave', 'escopo_tipo', 'valor'])
            .where('chave', 'in', [...chaves])
            .execute();
          const doHotel = new Map<string, NiveisDePolitica>();
          for (const l of linhas) {
            const niveis = doHotel.get(l.chave) ?? {};
            if (l.escopo_tipo === 'hotel') niveis.hotel = l.valor;
            else if (l.escopo_tipo === 'bandeira') niveis.bandeira = l.valor;
            else if (l.escopo_tipo === 'grupo') niveis.grupo = l.valor;
            doHotel.set(l.chave, niveis);
          }
          por.set(hotelId, doHotel);
        }
        return por;
      }),

    equipes: (ctx, hotelIds) =>
      banco.withContext(ctx, async (tx) =>
        hotelIds.length === 0
          ? []
          : tx
              .selectFrom('app.equipe')
              .select(['id', 'nome'])
              .where('hotel_id', 'in', [...hotelIds])
              .execute(),
      ),
  };
}
