// Implementação das portas de packages/aplicacao sobre o acesso ao banco.
// Leitura com withContext, escrita com executar (unit of work): o que cada
// método vê ou grava é o que a RLS permite ao usuário do contexto.
import type {
  AnexoGravado,
  AtivoGravado,
  EntidadeComAnexo,
  PortaAnexos,
  PortaAtivos,
  PortaEscopoDeAnexo,
  PortaAtribuicoes,
  PortaCategorias,
  PortaChamados,
  OsGravada,
  PortaTriagem,
  PortaExecucao,
  ParadaGravada,
  PortaParadas,
  PortaPrioridades,
  PortaSituacoes,
  PortaLocais,
  LocalDoHotelCadastrado,
  PortaProprietarios,
  PortaEquipes,
  PortaBandeiras,
  PortaImplantacao,
  LocalDoHotel,
  PortaConfiguracao,
  ConfiguracaoDoHotel,
  ConfiguracaoDoTenant,
  PortaHoteisDoStaging,
  PortaConvites,
  PortaCredenciaisDeAgente,
  PortaHoteis,
  PortaIngestao,
  PortaMembros,
  PortaOperacoesOffline,
  PortaPreferencias,
  PortaPromocaoDeUhs,
} from '@hubkeep/aplicacao';
import {
  type Atribuicao,
  Conflito,
  type Contexto,
  type EstadoDaOs,
  type EstadoDoChamado,
  type Escopo,
} from '@hubkeep/dominio';
import { sql } from 'kysely';
import type { AcessoBanco } from './acesso';
import type { Tx } from './conexao';
import {
  ehMembro,
  escopoVisivel,
  hotelDoRegistro,
  hotelNoEscopo,
  listarHoteisVisiveis,
  nomeDoTenant,
  preferenciasDoUsuario,
  respostaDaOperacao,
} from './consultas';
import { configurarHotel, configurarTenant, gravarPolitica } from './repositorios/configuracao';
import {
  criarBandeira,
  definirAtivaDaBandeira,
  definirBandeiraDoHotel,
  renomearBandeira,
} from './repositorios/bandeiras';
import { registrarAnexo, removerAnexo } from './repositorios/anexos';
import { alterarAtivo, criarAtivo, moverAtivo } from './repositorios/ativos';
import { alterarCategoria, criarCategoria } from './repositorios/categorias';
import { criarChamado } from './repositorios/chamados';
import { alterarChamadoNaTriagem, cancelarOs, gerarOs, reatribuirOs } from './repositorios/triagem';
import { aceitarOs, reabrirOs } from './repositorios/aceite';
import { andarComOs, apontarHoras, registrarMaterial } from './repositorios/execucao';
import { encerrarParada, registrarParada } from './repositorios/paradas';
import {
  alterarPrioridade,
  alterarSituacao,
  criarPrioridade,
  criarSituacao,
} from './repositorios/situacoes';
import { gravarConvite } from './repositorios/convites';
import { alterarLocal, criarAreaComum } from './repositorios/locais';
import { alterarEquipe, criarEquipe, definirMembroDaEquipe } from './repositorios/equipes';
import {
  alterarProprietario,
  alterarVigenciaDoVinculo,
  criarProprietario,
  vincularProprietario,
} from './repositorios/proprietarios';
import {
  hoteisCadastrados,
  hoteisDoStaging,
  sessaoDeHoteis,
  travarLicenca,
  usoDaLicenca,
} from './repositorios/hoteis';
import { criarCredencialDeAgente, revogarCredencialDeAgente } from './repositorios/credenciais';
import {
  alterarValidadeDaAtribuicao,
  concederPapel,
  definirAtivoDoMembro,
  revogarPapel,
} from './repositorios/membros';
import { OperacaoJaRecebida, registrarOperacao } from './repositorios/operacoes-offline';
import { gravarPreferencias } from './repositorios/preferencias';
import { sessaoDePromocao } from './repositorios/promocao';
import { credenciaisAtivas, registrarLote } from './repositorios/staging';

/** Valor gravado de uma política no hotel e no grupo, como está no banco (a resolução é do domínio). */
const niveisDaPolitica = (banco: AcessoBanco, ctx: Contexto, hotelId: string, chave: string) =>
  banco.withContext(ctx, async (tx) => {
    const linhas = await tx
      .selectFrom('app.politica')
      .select(['escopo_tipo', 'hotel_id', 'valor'])
      .where('ativa', '=', true)
      .where('chave', '=', chave)
      .where((eb) =>
        eb.or([
          eb('escopo_tipo', '=', 'grupo'),
          eb.and([eb('escopo_tipo', '=', 'hotel'), eb('hotel_id', '=', hotelId)]),
        ]),
      )
      .execute();
    const niveis: { hotel?: unknown; grupo?: unknown } = {};
    for (const l of linhas) {
      if (l.escopo_tipo === 'hotel') niveis.hotel = l.valor;
      else if (l.escopo_tipo === 'grupo') niveis.grupo = l.valor;
    }
    return niveis;
  });

interface LinhaAtribuicao {
  id: string;
  usuario_id: string;
  papel: Atribuicao['papel'];
  escopo_tipo: Escopo['tipo'];
  bandeira_id: string | null;
  hotel_id: string | null;
  proprietario_id: string | null;
  valido_ate: Date | null;
  revogado_em: Date | null;
}

function escopoDe(l: LinhaAtribuicao): Escopo {
  // A constraint escopo_coerente garante que a coluna do tipo está preenchida.
  switch (l.escopo_tipo) {
    case 'grupo':
      return { tipo: 'grupo' };
    case 'bandeira':
      return { tipo: 'bandeira', bandeiraId: l.bandeira_id ?? '' };
    case 'hotel':
      return { tipo: 'hotel', hotelId: l.hotel_id ?? '' };
    case 'proprietario':
      return { tipo: 'proprietario', proprietarioId: l.proprietario_id ?? '' };
  }
}

const paraAtribuicao = (l: LinhaAtribuicao): Atribuicao => ({
  id: l.id,
  usuarioId: l.usuario_id,
  papel: l.papel,
  escopo: escopoDe(l),
  validoAte: l.valido_ate,
  revogadoEm: l.revogado_em,
});

const COLUNAS = [
  'id',
  'usuario_id',
  'papel',
  'escopo_tipo',
  'bandeira_id',
  'hotel_id',
  'proprietario_id',
  'valido_ate',
  'revogado_em',
] as const;

const selecionar = (tx: Tx) => tx.selectFrom('app.atribuicao_escopo').select(COLUNAS);

export function criarPortasDeAplicacao(banco: AcessoBanco): {
  hoteis: PortaHoteis;
  atribuicoes: PortaAtribuicoes;
  convites: PortaConvites;
} {
  return {
    convites: {
      situacao: (ctx, pedido) =>
        banco.withContext(ctx, async (tx) => ({
          nomeTenant: await nomeDoTenant(tx),
          escopoVisivel: await escopoVisivel(tx, pedido.escopo),
          jaMembro: await ehMembro(tx, { email: pedido.email }),
        })),
      gravar: async (ctx, g) => {
        try {
          await banco.executar(ctx, (uow) => gravarConvite(uow, g));
        } catch (e) {
          // Dois convites simultâneos para a mesma pessoa: os dois passam pela
          // checagem de membro antes de qualquer commit, e a chave primária
          // decide quem fica. Quem perde recebe o mesmo 409 do reconvite.
          const { code, constraint } = e as { code?: string; constraint?: string };
          if (code === '23505' && constraint === 'membro_pkey') {
            throw new Conflito('ja_e_membro', 'Esta pessoa já é membro deste grupo.');
          }
          throw e;
        }
      },
    },
    hoteis: { listarVisiveis: (ctx) => banco.withContext(ctx, listarHoteisVisiveis) },
    atribuicoes: {
      doUsuario: (ctx) =>
        banco.withContext(ctx, async (tx) =>
          (await selecionar(tx).where('usuario_id', '=', ctx.usuarioId).execute()).map(
            paraAtribuicao,
          ),
        ),
      buscar: (ctx, id) =>
        banco.withContext(ctx, async (tx) => {
          const l = await selecionar(tx).where('id', '=', id).executeTakeFirst();
          return l ? paraAtribuicao(l) : null;
        }),
      conceder: (ctx, pedido) =>
        banco.executar(ctx, (uow) =>
          concederPapel(uow, {
            usuarioId: pedido.usuarioId,
            papel: pedido.papel,
            escopo: pedido.escopo,
            validoAte: pedido.validoAte ?? null,
          }),
        ),
      revogar: (ctx, id) => banco.executar(ctx, (uow) => revogarPapel(uow, id)),
    },
  };
}

/** Proprietários e vínculos com UH ou hotel inteiro (fase 1a, A4; ADR-031), pelo hk_app. */
export function criarPortaProprietarios(banco: AcessoBanco): PortaProprietarios {
  const local = (l: {
    id: string;
    hotel_id: string;
    nome: string;
    tipo: string;
    status: string;
  }): LocalDoHotel => ({
    id: l.id,
    hotelId: l.hotel_id,
    nome: l.nome,
    tipo: l.tipo as LocalDoHotel['tipo'],
    status: l.status,
  });
  return {
    listar: (ctx) =>
      banco.withContext(ctx, async (tx) => {
        const proprietarios = await tx
          .selectFrom('app.proprietario')
          .select(['id', 'nome', 'documento'])
          .orderBy('nome')
          .execute();
        const porUh = await tx
          .selectFrom('app.local_proprietario as lp')
          .innerJoin('app.local as l', (j) =>
            j.onRef('l.tenant_id', '=', 'lp.tenant_id').onRef('l.id', '=', 'lp.local_id'),
          )
          .innerJoin('app.hotel as h', (j) =>
            j.onRef('h.tenant_id', '=', 'l.tenant_id').onRef('h.id', '=', 'l.hotel_id'),
          )
          .select([
            'lp.id',
            'lp.proprietario_id',
            'l.hotel_id',
            'h.nome as hotel_nome',
            'l.id as local_id',
            'l.nome as local_nome',
            sql<string>`lp.vigencia_inicio::text`.as('inicio'),
            sql<string | null>`lp.vigencia_fim::text`.as('fim'),
          ])
          .execute();
        const porHotel = await tx
          .selectFrom('app.hotel_proprietario as hp')
          .innerJoin('app.hotel as h', (j) =>
            j.onRef('h.tenant_id', '=', 'hp.tenant_id').onRef('h.id', '=', 'hp.hotel_id'),
          )
          .select([
            'hp.id',
            'hp.proprietario_id',
            'hp.hotel_id',
            'h.nome as hotel_nome',
            sql<string>`hp.vigencia_inicio::text`.as('inicio'),
            sql<string | null>`hp.vigencia_fim::text`.as('fim'),
          ])
          .execute();
        return {
          proprietarios,
          vinculos: [
            ...porUh.map((v) => ({
              id: v.id,
              tipo: 'uh' as const,
              proprietarioId: v.proprietario_id,
              hotelId: v.hotel_id,
              hotelNome: v.hotel_nome,
              localId: v.local_id,
              localNome: v.local_nome,
              vigencia: { inicio: v.inicio, fim: v.fim },
            })),
            ...porHotel.map((v) => ({
              id: v.id,
              tipo: 'hotel' as const,
              proprietarioId: v.proprietario_id,
              hotelId: v.hotel_id,
              hotelNome: v.hotel_nome,
              localId: null,
              localNome: null,
              vigencia: { inicio: v.inicio, fim: v.fim },
            })),
          ].sort(
            (a, b) =>
              a.hotelNome.localeCompare(b.hotelNome) ||
              a.vigencia.inicio.localeCompare(b.vigencia.inicio),
          ),
        };
      }),
    hotel: (ctx, hotelId) =>
      banco.withContext(
        ctx,
        async (tx) =>
          (await tx
            .selectFrom('app.hotel')
            .select(['id', 'nome'])
            .where('id', '=', hotelId)
            .executeTakeFirst()) ?? null,
      ),
    local: (ctx, localId) =>
      banco.withContext(ctx, async (tx) => {
        const l = await tx
          .selectFrom('app.local')
          .select(['id', 'hotel_id', 'nome', 'tipo', 'status'])
          .where('id', '=', localId)
          .executeTakeFirst();
        return l ? local(l) : null;
      }),
    criar: (ctx, dados) => banco.executar(ctx, (uow) => criarProprietario(uow, dados)),
    alterar: (ctx, id, dados) => banco.executar(ctx, (uow) => alterarProprietario(uow, id, dados)),
    vincular: (ctx, v) => banco.executar(ctx, (uow) => vincularProprietario(uow, v)),
    alterarVigencia: (ctx, tipo, id, vigencia) =>
      banco.executar(ctx, (uow) => alterarVigenciaDoVinculo(uow, tipo, id, vigencia)),
  };
}

/**
 * Padrão do ILIKE para achar o termo em qualquer parte da coluna `busca`
 * (B6, ADR-030), com o índice de trigramas. `%`, `_` e a barra digitados
 * valem como texto, não como curinga.
 */
export const trecho = (termo: string) => `%${termo.replace(/[\\%_]/g, '\\$&')}%`;

/** Painel de implantação do hotel (fase 1a, A5), pelo hk_app: hotel e locais pela RLS. */
export function criarPortaImplantacao(banco: AcessoBanco): PortaImplantacao {
  return {
    hotel: (ctx, hotelId) =>
      banco.withContext(
        ctx,
        async (tx) =>
          (await tx
            .selectFrom('app.hotel')
            .select(['id', 'nome', 'status'])
            .where('id', '=', hotelId)
            .executeTakeFirst()) ?? null,
      ),
    locais: (ctx, hotelId) =>
      banco.withContext(ctx, async (tx) =>
        (
          await tx
            .selectFrom('app.local')
            .select(['id', 'tipo', 'status'])
            .where('hotel_id', '=', hotelId)
            .execute()
        ).map((l) => ({ id: l.id, tipo: l.tipo, status: l.status })),
      ),
    ativos: (ctx, hotelId) =>
      banco.withContext(ctx, async (tx) =>
        (
          await tx
            .selectFrom('app.ativo')
            .select(['local_id', 'categoria_id', 'desativado_em'])
            .where('hotel_id', '=', hotelId)
            .execute()
        ).map((a) => ({
          localId: a.local_id,
          categoriaId: a.categoria_id,
          ativo: a.desativado_em === null,
        })),
      ),
  };
}

/** Bandeiras (fase 1a, A2), pelo hk_app: ler é de todo membro, gravar é do Admin (RLS). */
export function criarPortaBandeiras(banco: AcessoBanco): PortaBandeiras {
  const colunas = ['id', 'nome', 'ativa'] as const;
  return {
    listar: (ctx) =>
      banco.withContext(ctx, (tx) =>
        tx.selectFrom('app.bandeira').select(colunas).orderBy('nome').execute(),
      ),
    buscar: (ctx, id) =>
      banco.withContext(
        ctx,
        async (tx) =>
          (await tx
            .selectFrom('app.bandeira')
            .select(colunas)
            .where('id', '=', id)
            .executeTakeFirst()) ?? null,
      ),
    criar: (ctx, nome) =>
      banco.executar(ctx, async (uow) => ({ id: (await criarBandeira(uow, nome)).id })),
    renomear: (ctx, id, nome) => banco.executar(ctx, (uow) => renomearBandeira(uow, id, nome)),
    definirAtiva: (ctx, id, ativa) =>
      banco.executar(ctx, (uow) => definirAtivaDaBandeira(uow, id, ativa)),
    definirBandeiraDoHotel: (ctx, hotelId, bandeiraId) =>
      banco.executar(ctx, (uow) => definirBandeiraDoHotel(uow, hotelId, bandeiraId)),
  };
}

/** Equipes do hotel (fase 1a, A6), pelo hk_app: o que cada um vê e grava é da RLS. */
export function criarPortaEquipes(banco: AcessoBanco): PortaEquipes {
  const hotelDe = (tx: Tx, hotelId: string) =>
    tx
      .selectFrom('app.hotel')
      .select(['id', 'bandeira_id'])
      .where('id', '=', hotelId)
      .executeTakeFirst();
  return {
    hotel: (ctx, hotelId) =>
      banco.withContext(ctx, async (tx) => {
        const h = await hotelDe(tx, hotelId);
        return h ? { id: h.id, bandeiraId: h.bandeira_id } : null;
      }),
    hotelDaEquipe: (ctx, equipeId) =>
      banco.withContext(ctx, async (tx) => {
        const e = await tx
          .selectFrom('app.equipe')
          .select('hotel_id')
          .where('id', '=', equipeId)
          .executeTakeFirst();
        const h = e ? await hotelDe(tx, e.hotel_id) : undefined;
        return h ? { id: h.id, bandeiraId: h.bandeira_id } : null;
      }),
    listar: (ctx, hotelId) =>
      banco.withContext(ctx, async (tx) => {
        const equipes = await tx
          .selectFrom('app.equipe')
          .select(['id', 'nome', 'ativa'])
          .where('hotel_id', '=', hotelId)
          .orderBy('nome')
          .execute();
        const membros = await tx
          .selectFrom('app.equipe_membro as em')
          .innerJoin('app.membro as m', (j) =>
            j.onRef('m.tenant_id', '=', 'em.tenant_id').onRef('m.usuario_id', '=', 'em.usuario_id'),
          )
          .select(['em.equipe_id', 'em.usuario_id', 'em.ativo', 'm.nome'])
          .where('em.hotel_id', '=', hotelId)
          .orderBy('m.nome')
          .execute();
        const disponiveis = await tx
          .selectFrom('app.membro')
          .select(['usuario_id', 'nome'])
          .where('ativo', '=', true)
          .orderBy('nome')
          .execute();
        return {
          equipes: equipes.map((e) => ({
            ...e,
            membros: membros
              .filter((m) => m.equipe_id === e.id)
              .map((m) => ({ usuarioId: m.usuario_id, nome: m.nome, ativo: m.ativo })),
          })),
          disponiveis: disponiveis.map((m) => ({ usuarioId: m.usuario_id, nome: m.nome })),
        };
      }),
    criar: (ctx, hotelId, nome) => banco.executar(ctx, (uow) => criarEquipe(uow, hotelId, nome)),
    renomear: (ctx, id, nome) => banco.executar(ctx, (uow) => alterarEquipe(uow, id, { nome })),
    definirAtiva: (ctx, id, ativa) =>
      banco.executar(ctx, (uow) => alterarEquipe(uow, id, { ativa })),
    definirMembro: (ctx, equipeId, usuarioId, ativo) =>
      banco.executar(ctx, (uow) => definirMembroDaEquipe(uow, equipeId, usuarioId, ativo)),
  };
}

/** Configuração do tenant e do hotel e políticas (fase 1a, A7; ADR-026), pelo hk_app. */
export function criarPortaConfiguracao(banco: AcessoBanco): PortaConfiguracao {
  return {
    tenant: (ctx) =>
      banco.withContext(ctx, async (tx) => {
        const t = await tx
          .selectFrom('app.tenant')
          .select(['nome', 'pais', 'subdivisao', 'moeda', 'idioma_padrao'])
          .executeTakeFirst();
        return t
          ? {
              nome: t.nome,
              pais: t.pais,
              subdivisao: t.subdivisao,
              moeda: t.moeda,
              idiomaPadrao: t.idioma_padrao as ConfiguracaoDoTenant['idiomaPadrao'],
            }
          : null;
      }),
    hotel: (ctx, hotelId) =>
      banco.withContext(ctx, async (tx) => {
        const h = await tx
          .selectFrom('app.hotel')
          .select(['id', 'nome', 'fuso', 'pais', 'subdivisao', 'moeda', 'idioma_padrao'])
          .where('id', '=', hotelId)
          .executeTakeFirst();
        return h
          ? {
              id: h.id,
              nome: h.nome,
              fuso: h.fuso,
              pais: h.pais,
              subdivisao: h.subdivisao,
              moeda: h.moeda,
              idiomaPadrao: h.idioma_padrao as ConfiguracaoDoHotel['idiomaPadrao'],
            }
          : null;
      }),
    politicas: (ctx, hotelId) =>
      banco.withContext(ctx, async (tx) => {
        let q = tx
          .selectFrom('app.politica')
          .select(['chave', 'escopo_tipo', 'hotel_id', 'valor'])
          .where('ativa', '=', true);
        q = hotelId
          ? q.where((eb) =>
              eb.or([
                eb('escopo_tipo', '=', 'grupo'),
                eb.and([eb('escopo_tipo', '=', 'hotel'), eb('hotel_id', '=', hotelId)]),
              ]),
            )
          : q.where('escopo_tipo', '=', 'grupo');
        return (await q.execute()).map((p) => ({
          chave: p.chave,
          escopo:
            p.escopo_tipo === 'hotel' && p.hotel_id
              ? { tipo: 'hotel' as const, hotelId: p.hotel_id }
              : { tipo: 'grupo' as const },
          valor: p.valor,
        }));
      }),
    configurarTenant: (ctx, c) => banco.executar(ctx, (uow) => configurarTenant(uow, c)),
    configurarHotel: (ctx, hotelId, c) =>
      banco.executar(ctx, (uow) => configurarHotel(uow, hotelId, c)),
    gravarPolitica: (ctx, chave, escopo, valor) =>
      banco.executar(ctx, (uow) => gravarPolitica(uow, chave, escopo, valor)),
  };
}

/** Locais do hotel (fase 1a, B1), pelo hk_app: o que cada um vê e grava é da RLS. */
export function criarPortaLocais(banco: AcessoBanco): PortaLocais {
  const colunas = ['id', 'hotel_id', 'nome', 'tipo', 'andar', 'status', 'cod_externo'] as const;
  const paraLocal = (l: {
    id: string;
    hotel_id: string;
    nome: string;
    tipo: LocalDoHotelCadastrado['tipo'];
    andar: string | null;
    status: LocalDoHotelCadastrado['status'];
    cod_externo: string | null;
  }): LocalDoHotelCadastrado => ({
    id: l.id,
    hotelId: l.hotel_id,
    nome: l.nome,
    tipo: l.tipo,
    andar: l.andar,
    status: l.status,
    codExterno: l.cod_externo,
  });
  return {
    hotel: (ctx, hotelId) =>
      banco.withContext(ctx, async (tx) => {
        const h = await tx
          .selectFrom('app.hotel')
          .select(['id', 'bandeira_id'])
          .where('id', '=', hotelId)
          .executeTakeFirst();
        return h ? { id: h.id, bandeiraId: h.bandeira_id } : null;
      }),
    locais: (ctx, hotelId, termo) =>
      banco.withContext(ctx, async (tx) =>
        (
          await tx
            .selectFrom('app.local')
            .select(colunas)
            .where('hotel_id', '=', hotelId)
            .$if(termo !== undefined, (q) => q.where('busca', 'ilike', trecho(termo ?? '')))
            .orderBy('tipo') // enum app.local_tipo: 'uh' antes de 'area_comum' (ordem da declaração)
            .orderBy('nome')
            .execute()
        ).map(paraLocal),
      ),
    local: (ctx, localId) =>
      banco.withContext(ctx, async (tx) => {
        const l = await tx
          .selectFrom('app.local')
          .select(colunas)
          .where('id', '=', localId)
          .executeTakeFirst();
        return l ? paraLocal(l) : null;
      }),
    criarAreaComum: (ctx, hotelId, dados) =>
      banco.executar(ctx, (uow) => criarAreaComum(uow, hotelId, dados)),
    alterar: (ctx, localId, mudanca) =>
      banco.executar(ctx, (uow) => alterarLocal(uow, localId, mudanca)),
  };
}

/** Categorias de ativo (fase 1a, B2; ADR-028), pelo hk_app. */
export function criarPortaCategorias(banco: AcessoBanco): PortaCategorias {
  return {
    idiomaPadrao: (ctx) =>
      banco.withContext(ctx, async (tx) => {
        const t = await tx.selectFrom('app.tenant').select('idioma_padrao').executeTakeFirst();
        return (t?.idioma_padrao ?? 'pt-BR') as Awaited<
          ReturnType<PortaCategorias['idiomaPadrao']>
        >;
      }),
    listar: (ctx) =>
      banco.withContext(ctx, async (tx) =>
        (
          await tx
            .selectFrom('app.categoria_ativo')
            .select(['id', 'chave_padrao', 'nomes', 'campos', 'ativa'])
            .orderBy('criado_em')
            .orderBy('id')
            .execute()
        ).map((c) => ({
          id: c.id,
          chavePadrao: c.chave_padrao,
          nomes: c.nomes,
          campos: c.campos,
          ativa: c.ativa,
        })),
      ),
    criar: (ctx, c) => banco.executar(ctx, (uow) => criarCategoria(uow, c)),
    alterar: (ctx, id, mudanca) => banco.executar(ctx, (uow) => alterarCategoria(uow, id, mudanca)),
  };
}

/** Chamados (fase 1a, C2), pelo hk_app. */
export function criarPortaChamados(banco: AcessoBanco): PortaChamados {
  return {
    hotel: (ctx, hotelId) =>
      banco.withContext(ctx, async (tx) => {
        const h = await tx
          .selectFrom('app.hotel')
          .select(['id', 'bandeira_id'])
          .where('id', '=', hotelId)
          .executeTakeFirst();
        return h ? { id: h.id, bandeiraId: h.bandeira_id } : null;
      }),
    local: (ctx, localId) =>
      banco.withContext(ctx, async (tx) => {
        const l = await tx
          .selectFrom('app.local')
          .select(['id', 'hotel_id', 'status'])
          .where('id', '=', localId)
          .executeTakeFirst();
        return l
          ? {
              id: l.id,
              hotelId: l.hotel_id,
              status: l.status as 'ativo' | 'inativo' | 'pendente_licenca',
            }
          : null;
      }),
    ativo: (ctx, ativoId) =>
      banco.withContext(ctx, async (tx) => {
        const a = await tx
          .selectFrom('app.ativo')
          .select(['id', 'hotel_id', 'local_id', 'categoria_id', 'desativado_em'])
          .where('id', '=', ativoId)
          .executeTakeFirst();
        return a
          ? {
              id: a.id,
              hotelId: a.hotel_id,
              localId: a.local_id,
              categoriaId: a.categoria_id,
              desativadoEm: a.desativado_em,
            }
          : null;
      }),
    politica: (ctx, hotelId, chave) => niveisDaPolitica(banco, ctx, hotelId, chave),
    criar: (ctx, hotelId, dados) => banco.executar(ctx, (uow) => criarChamado(uow, hotelId, dados)),
    chamado: (ctx, chamadoId) =>
      banco.withContext(ctx, async (tx) => {
        const c = await tx
          .selectFrom('app.chamado')
          .select([
            'id',
            'hotel_id',
            'local_id',
            'ativo_id',
            'descricao',
            'estado',
            'situacao_id',
            'prioridade_id',
            'politica_aplicada',
            'aberto_por',
            'motivo_cancelamento',
            'versao',
            'criado_em',
          ])
          .where('id', '=', chamadoId)
          .executeTakeFirst();
        return c
          ? {
              id: c.id,
              hotelId: c.hotel_id,
              localId: c.local_id,
              ativoId: c.ativo_id,
              descricao: c.descricao,
              estado: c.estado,
              situacaoId: c.situacao_id,
              prioridadeId: c.prioridade_id,
              politicaAplicada: c.politica_aplicada,
              abertoPor: c.aberto_por,
              motivoCancelamento: c.motivo_cancelamento,
              versao: c.versao,
              criadoEm: c.criado_em,
            }
          : null;
      }),
  };
}

const COLUNAS_DA_OS = [
  'id',
  'hotel_id',
  'chamado_id',
  'estado',
  'situacao_id',
  'tecnico_id',
  'equipe_id',
  'motivo_cancelamento',
  'motivo_reabertura',
  'criado_por',
  'versao',
  'criado_em',
] as const;

function paraOs(o: {
  id: string;
  hotel_id: string;
  chamado_id: string;
  estado: string;
  situacao_id: string;
  tecnico_id: string | null;
  equipe_id: string | null;
  motivo_cancelamento: string | null;
  motivo_reabertura: string | null;
  criado_por: string;
  versao: number;
  criado_em: Date;
}): OsGravada {
  return {
    id: o.id,
    hotelId: o.hotel_id,
    chamadoId: o.chamado_id,
    estado: o.estado as EstadoDaOs,
    situacaoId: o.situacao_id,
    // O check os_um_responsavel garante exatamente um dos dois.
    responsavel:
      o.tecnico_id !== null
        ? { tipo: 'tecnico', usuarioId: o.tecnico_id }
        : { tipo: 'equipe', equipeId: o.equipe_id ?? '' },
    motivoCancelamento: o.motivo_cancelamento,
    motivoReabertura: o.motivo_reabertura,
    criadoPor: o.criado_por,
    versao: o.versao,
    criadoEm: o.criado_em,
  };
}

/**
 * Início da parada aberta do ativo (C5), como subconsulta da leitura; null se
 * não está parado. A RLS da parada vale para quem lê.
 */
const paradoDesde = (hotel: string, ativo: string) =>
  sql<Date | null>`(select p.inicio from app.parada_ativo p
    where p.hotel_id = ${sql.ref(hotel)} and p.ativo_id = ${sql.ref(ativo)} and p.fim is null
    limit 1)`.as('parado_desde');

/** A parada aberta do ativo é a deste chamado (a OS encerra; a conclusão pergunta). */
const paradaDoChamado = (hotel: string, chamado: string) =>
  sql<boolean>`exists (select 1 from app.parada_ativo p
    where p.hotel_id = ${sql.ref(hotel)} and p.chamado_id = ${sql.ref(chamado)} and p.fim is null)`.as(
    'parada_do_chamado',
  );

/** Triagem e OS (fase 1a, C3), pelo hk_app. */
export function criarPortaTriagem(banco: AcessoBanco): PortaTriagem {
  return {
    chamado: (ctx, chamadoId) =>
      banco.withContext(ctx, async (tx) => {
        const c = await tx
          .selectFrom('app.chamado as c')
          .innerJoin('app.hotel as h', 'h.id', 'c.hotel_id')
          .select([
            'c.id',
            'c.hotel_id',
            'h.bandeira_id',
            'c.local_id',
            'c.ativo_id',
            'c.estado',
            'c.situacao_id',
            'c.prioridade_id',
            'c.aberto_por',
            'c.versao',
          ])
          .where('c.id', '=', chamadoId)
          .executeTakeFirst();
        return c
          ? {
              id: c.id,
              hotel: { id: c.hotel_id, bandeiraId: c.bandeira_id },
              localId: c.local_id,
              ativoId: c.ativo_id,
              estado: c.estado as EstadoDoChamado,
              situacaoId: c.situacao_id,
              prioridadeId: c.prioridade_id,
              abertoPor: c.aberto_por,
              versao: c.versao,
            }
          : null;
      }),
    osDoChamado: (ctx, chamadoId) =>
      banco.withContext(ctx, async (tx) =>
        (
          await tx
            .selectFrom('app.os')
            .select(COLUNAS_DA_OS)
            .where('chamado_id', '=', chamadoId)
            .orderBy('criado_em')
            .orderBy('id')
            .execute()
        ).map(paraOs),
      ),
    os: (ctx, osId) =>
      banco.withContext(ctx, async (tx) => {
        const o = await tx
          .selectFrom('app.os')
          .select(COLUNAS_DA_OS)
          .where('id', '=', osId)
          .executeTakeFirst();
        return o ? paraOs(o) : null;
      }),
    atribuicoesDe: (ctx, usuarioId) =>
      banco.withContext(ctx, async (tx) =>
        (await selecionar(tx).where('usuario_id', '=', usuarioId).execute()).map(paraAtribuicao),
      ),
    equipe: (ctx, equipeId) =>
      banco.withContext(ctx, async (tx) => {
        const e = await tx
          .selectFrom('app.equipe')
          .select(['hotel_id', 'ativa'])
          .where('id', '=', equipeId)
          .executeTakeFirst();
        return e ? { hotelId: e.hotel_id, ativa: e.ativa } : null;
      }),
    equipesDoUsuario: (ctx) =>
      banco.withContext(ctx, async (tx) =>
        (await equipesDoUsuario(tx, ctx.usuarioId).execute()).map((e) => e.equipe_id),
      ),
    dadosDoAceite: (ctx, g) =>
      banco.withContext(ctx, async (tx) => {
        const equipes = await equipesDoUsuario(tx, g.abertoPor).execute();
        const gerentes = await tx
          .selectFrom('app.atribuicao_escopo as a')
          .innerJoin('app.membro as m', (j) =>
            j.onRef('m.tenant_id', '=', 'a.tenant_id').onRef('m.usuario_id', '=', 'a.usuario_id'),
          )
          .select([
            'a.id',
            'a.usuario_id',
            'a.papel',
            'a.escopo_tipo',
            'a.bandeira_id',
            'a.hotel_id',
            'a.proprietario_id',
            'a.valido_ate',
            'a.revogado_em',
          ])
          .where('a.papel', '=', 'gerente_hotel')
          .where('a.revogado_em', 'is', null)
          .where('m.ativo', '=', true)
          .where((eb) =>
            eb.or([
              eb('a.escopo_tipo', '=', 'grupo'),
              eb('a.hotel_id', '=', g.hotel.id),
              ...(g.hotel.bandeiraId ? [eb('a.bandeira_id', '=', g.hotel.bandeiraId)] : []),
            ]),
          )
          .execute();
        return {
          equipesDeQuemAbriu: equipes.map((e) => e.equipe_id),
          gerentes: gerentes.map(paraAtribuicao),
        };
      }),
    alterarChamado: (ctx, chamadoId, versao, mudanca) =>
      banco.executar(ctx, (uow) => alterarChamadoNaTriagem(uow, chamadoId, versao, mudanca)),
    gerarOs: (ctx, g) => banco.executar(ctx, (uow) => gerarOs(uow, g)),
    reatribuirOs: (ctx, g) => banco.executar(ctx, (uow) => reatribuirOs(uow, g)),
    cancelarOs: (ctx, g) => banco.executar(ctx, (uow) => cancelarOs(uow, g)),
    aceitarOs: (ctx, g) => banco.executar(ctx, (uow) => aceitarOs(uow, g)),
    reabrirOs: (ctx, g) => banco.executar(ctx, (uow) => reabrirOs(uow, g)),
  };
}

/** Equipes ativas de que o usuário do contexto é membro ativo (a RLS mostra as dos hotéis que ele lê). */
const equipesDoUsuario = (tx: Tx, usuarioId: string) =>
  tx
    .selectFrom('app.equipe_membro as em')
    .innerJoin('app.equipe as e', (j) =>
      j.onRef('e.hotel_id', '=', 'em.hotel_id').onRef('e.id', '=', 'em.equipe_id'),
    )
    .select('em.equipe_id')
    .where('em.usuario_id', '=', usuarioId)
    .where('em.ativo', '=', true)
    .where('e.ativa', '=', true);

/** Execução da OS pelo Técnico (fase 1a, C4), pelo hk_app. */
export function criarPortaExecucao(banco: AcessoBanco): PortaExecucao {
  return {
    ultimaTransicaoEm: (ctx, osId) =>
      banco.withContext(ctx, async (tx) => {
        const r = await tx
          .selectFrom('app.os_transicao')
          .select((eb) => eb.fn.max('quando').as('quando'))
          .where('os_id', '=', osId)
          .executeTakeFirst();
        return r?.quando ? new Date(r.quando) : null;
      }),
    equipesDoUsuario: (ctx) =>
      banco.withContext(ctx, async (tx) =>
        (await equipesDoUsuario(tx, ctx.usuarioId).execute()).map((e) => e.equipe_id),
      ),
    osDoDia: (ctx) =>
      banco.withContext(ctx, async (tx) => {
        const linhas = await tx
          .selectFrom('app.os as o')
          .innerJoin('app.chamado as c', (j) =>
            j.onRef('c.hotel_id', '=', 'o.hotel_id').onRef('c.id', '=', 'o.chamado_id'),
          )
          .innerJoin('app.local as l', (j) =>
            j.onRef('l.hotel_id', '=', 'c.hotel_id').onRef('l.id', '=', 'c.local_id'),
          )
          .select([
            'o.id',
            'o.hotel_id',
            'o.estado',
            'o.situacao_id',
            'o.tecnico_id',
            'o.equipe_id',
            'o.motivo_reabertura',
            'o.versao',
            'o.criado_em',
            'c.id as chamado_id',
            'c.descricao',
            'c.local_id',
            'l.nome as local_nome',
            'c.prioridade_id',
            'c.estado as chamado_estado',
            'c.ativo_id',
          ])
          .select(paradoDesde('c.hotel_id', 'c.ativo_id'))
          .select(paradaDoChamado('c.hotel_id', 'c.id'))
          .where('o.estado', 'in', ['atribuida', 'em_execucao', 'pausada'])
          .where((eb) =>
            eb.or([
              eb('o.tecnico_id', '=', ctx.usuarioId),
              eb('o.equipe_id', 'in', equipesDoUsuario(tx, ctx.usuarioId)),
            ]),
          )
          .orderBy('o.criado_em')
          .orderBy('o.id')
          .execute();
        return linhas.map((o) => ({
          id: o.id,
          hotelId: o.hotel_id,
          estado: o.estado as EstadoDaOs,
          situacaoId: o.situacao_id,
          responsavel:
            o.tecnico_id !== null
              ? { tipo: 'tecnico' as const, usuarioId: o.tecnico_id }
              : { tipo: 'equipe' as const, equipeId: o.equipe_id ?? '' },
          motivoReabertura: o.motivo_reabertura,
          versao: o.versao,
          criadoEm: o.criado_em,
          chamado: {
            id: o.chamado_id,
            descricao: o.descricao,
            localId: o.local_id,
            localNome: o.local_nome,
            prioridadeId: o.prioridade_id,
            estado: o.chamado_estado as EstadoDoChamado,
            ativoId: o.ativo_id,
            paradoDesde: o.parado_desde,
            paradaDoChamado: o.parada_do_chamado,
          },
        }));
      }),
  };
}

const COLUNAS_DA_PARADA = [
  'id',
  'hotel_id',
  'ativo_id',
  'chamado_id',
  'os_id',
  'inicio',
  'fim',
  'aberta_por',
  'encerrada_por',
] as const;

function paraParada(p: {
  id: string;
  hotel_id: string;
  ativo_id: string;
  chamado_id: string;
  os_id: string | null;
  inicio: Date;
  fim: Date | null;
  aberta_por: string;
  encerrada_por: string | null;
}): ParadaGravada {
  return {
    id: p.id,
    hotelId: p.hotel_id,
    ativoId: p.ativo_id,
    chamadoId: p.chamado_id,
    osId: p.os_id,
    inicio: p.inicio,
    fim: p.fim,
    abertaPor: p.aberta_por,
    encerradaPor: p.encerrada_por,
  };
}

/** Parada do equipamento (fase 1a, C5), pelo hk_app. */
export function criarPortaParadas(banco: AcessoBanco): PortaParadas {
  return {
    parada: (ctx, paradaId) =>
      banco.withContext(ctx, async (tx) => {
        const p = await tx
          .selectFrom('app.parada_ativo')
          .select(COLUNAS_DA_PARADA)
          .where('id', '=', paradaId)
          .executeTakeFirst();
        return p ? paraParada(p) : null;
      }),
    abertaDoAtivo: (ctx, ativoId) =>
      banco.withContext(ctx, async (tx) => {
        const p = await tx
          .selectFrom('app.parada_ativo')
          .select(COLUNAS_DA_PARADA)
          .where('ativo_id', '=', ativoId)
          .where('fim', 'is', null)
          .executeTakeFirst();
        return p ? paraParada(p) : null;
      }),
    doAtivo: (ctx, ativoId) =>
      banco.withContext(ctx, async (tx) =>
        (
          await tx
            .selectFrom('app.parada_ativo')
            .select(COLUNAS_DA_PARADA)
            .where('ativo_id', '=', ativoId)
            .orderBy('inicio', 'desc')
            .orderBy('id', 'desc')
            .execute()
        ).map(paraParada),
      ),
    abertasComOs: (ctx, estadosDaOs) =>
      banco.withContext(ctx, async (tx) =>
        (
          await tx
            .selectFrom('app.parada_ativo as p')
            .innerJoin('app.os as o', (j) =>
              j.onRef('o.hotel_id', '=', 'p.hotel_id').onRef('o.chamado_id', '=', 'p.chamado_id'),
            )
            .innerJoin('app.hotel as h', 'h.id', 'p.hotel_id')
            .innerJoin('app.ativo as a', (j) =>
              j.onRef('a.hotel_id', '=', 'p.hotel_id').onRef('a.id', '=', 'p.ativo_id'),
            )
            .select([
              'p.id',
              'p.hotel_id',
              'p.ativo_id',
              'p.chamado_id',
              'p.os_id',
              'p.inicio',
              'p.fim',
              'p.aberta_por',
              'p.encerrada_por',
              'h.bandeira_id',
              'a.nome as ativo_nome',
              'o.id as os_concluida_id',
              'o.estado as os_estado',
            ])
            .where('p.fim', 'is', null)
            .where('o.estado', 'in', [...estadosDaOs])
            .orderBy('p.inicio')
            .orderBy('p.id')
            .execute()
        ).map((p) => ({
          ...paraParada(p),
          hotel: { id: p.hotel_id, bandeiraId: p.bandeira_id },
          ativoNome: p.ativo_nome,
          os: { id: p.os_concluida_id, estado: p.os_estado },
        })),
      ),
    encerrar: (ctx, e) => banco.executar(ctx, (uow) => encerrarParada(uow, e)),
  };
}

/** Situações do tenant (fase 1a, C1; ADR-027), pelo hk_app. */
export function criarPortaSituacoes(banco: AcessoBanco): PortaSituacoes {
  return {
    idiomaPadrao: (ctx) =>
      banco.withContext(ctx, async (tx) => {
        const t = await tx.selectFrom('app.tenant').select('idioma_padrao').executeTakeFirst();
        return (t?.idioma_padrao ?? 'pt-BR') as Awaited<ReturnType<PortaSituacoes['idiomaPadrao']>>;
      }),
    listar: (ctx) =>
      banco.withContext(ctx, async (tx) =>
        (
          await tx
            .selectFrom('app.situacao')
            .select(['id', 'entidade', 'estado', 'chave_padrao', 'nomes', 'ordem', 'cor', 'ativa'])
            .execute()
        ).map((s) => ({
          id: s.id,
          entidade: s.entidade as 'chamado' | 'os',
          estado: s.estado,
          chavePadrao: s.chave_padrao,
          nomes: s.nomes,
          ordem: s.ordem,
          cor: s.cor,
          ativa: s.ativa,
        })),
      ),
    criar: (ctx, s) => banco.executar(ctx, (uow) => criarSituacao(uow, s)),
    alterar: (ctx, id, mudanca) => banco.executar(ctx, (uow) => alterarSituacao(uow, id, mudanca)),
  };
}

/** Prioridades do tenant (fase 1a, C1; ADR-027), pelo hk_app. */
export function criarPortaPrioridades(banco: AcessoBanco): PortaPrioridades {
  return {
    listar: (ctx) =>
      banco.withContext(ctx, async (tx) =>
        (
          await tx
            .selectFrom('app.prioridade')
            .select(['id', 'chave_padrao', 'nomes', 'ordem', 'peso', 'ativa'])
            .execute()
        ).map((p) => ({
          id: p.id,
          chavePadrao: p.chave_padrao,
          nomes: p.nomes,
          ordem: p.ordem,
          peso: p.peso,
          ativa: p.ativa,
        })),
      ),
    criar: (ctx, p) => banco.executar(ctx, (uow) => criarPrioridade(uow, p)),
    alterar: (ctx, id, mudanca) =>
      banco.executar(ctx, (uow) => alterarPrioridade(uow, id, mudanca)),
  };
}

/** Ativos do hotel (fase 1a, B3; ADR-029), pelo hk_app: o que cada um vê e grava é da RLS. */
export function criarPortaAtivos(banco: AcessoBanco): PortaAtivos {
  const colunas = [
    'id',
    'hotel_id',
    'local_id',
    'categoria_id',
    'nome',
    'fabricante',
    'modelo',
    'numero_serie',
    'criticidade',
    'campos',
    'versao',
    'desativado_em',
    'codigo_qr',
  ] as const;
  // As datas saem como aaaa-mm-dd, sem passar por Date e fuso.
  const datas = [
    sql<string | null>`a.data_compra::text`.as('data_compra'),
    sql<string | null>`a.garantia_ate::text`.as('garantia_ate'),
  ];
  const paraAtivo = (a: {
    id: string;
    hotel_id: string;
    local_id: string;
    categoria_id: string | null;
    nome: string;
    fabricante: string | null;
    modelo: string | null;
    numero_serie: string | null;
    data_compra: string | null;
    garantia_ate: string | null;
    criticidade: number | null;
    campos: unknown;
    versao: number;
    desativado_em: Date | null;
    codigo_qr: string;
    parado_desde: Date | null;
  }): AtivoGravado => ({
    id: a.id,
    hotelId: a.hotel_id,
    localId: a.local_id,
    categoriaId: a.categoria_id,
    nome: a.nome,
    fabricante: a.fabricante,
    modelo: a.modelo,
    numeroSerie: a.numero_serie,
    dataCompra: a.data_compra,
    garantiaAte: a.garantia_ate,
    criticidade: a.criticidade,
    campos: a.campos,
    versao: a.versao,
    desativadoEm: a.desativado_em,
    codigoQr: a.codigo_qr,
    paradoDesde: a.parado_desde,
  });
  return {
    hotel: (ctx, hotelId) =>
      banco.withContext(ctx, async (tx) => {
        const h = await tx
          .selectFrom('app.hotel')
          .select(['id', 'bandeira_id'])
          .where('id', '=', hotelId)
          .executeTakeFirst();
        return h ? { id: h.id, bandeiraId: h.bandeira_id } : null;
      }),
    local: (ctx, localId) =>
      banco.withContext(ctx, async (tx) => {
        const l = await tx
          .selectFrom('app.local')
          .select(['id', 'hotel_id', 'status'])
          .where('id', '=', localId)
          .executeTakeFirst();
        return l ? { id: l.id, hotelId: l.hotel_id, status: l.status } : null;
      }),
    politica: (ctx, hotelId, chave) => niveisDaPolitica(banco, ctx, hotelId, chave),
    categorias: (ctx) =>
      banco.withContext(ctx, async (tx) =>
        tx.selectFrom('app.categoria_ativo').select(['id', 'ativa', 'campos']).execute(),
      ),
    ativos: (ctx, hotelId, termo) =>
      banco.withContext(ctx, async (tx) =>
        (
          await tx
            .selectFrom('app.ativo as a')
            .select(colunas)
            .select(datas)
            .select(paradoDesde('a.hotel_id', 'a.id'))
            .where('hotel_id', '=', hotelId)
            .$if(termo !== undefined, (q) => q.where('busca', 'ilike', trecho(termo ?? '')))
            .orderBy('nome')
            .orderBy('id')
            .execute()
        ).map(paraAtivo),
      ),
    ativo: (ctx, ativoId) =>
      banco.withContext(ctx, async (tx) => {
        const a = await tx
          .selectFrom('app.ativo as a')
          .select(colunas)
          .select(datas)
          .select(paradoDesde('a.hotel_id', 'a.id'))
          .where('id', '=', ativoId)
          .executeTakeFirst();
        return a ? paraAtivo(a) : null;
      }),
    ativoPorCodigoQr: (ctx, codigoQr) =>
      banco.withContext(ctx, async (tx) => {
        // O tenant vem da RLS (tenant do contexto); o código é único no tenant.
        const a = await tx
          .selectFrom('app.ativo as a')
          .select(colunas)
          .select(datas)
          .select(paradoDesde('a.hotel_id', 'a.id'))
          .where('codigo_qr', '=', codigoQr)
          .executeTakeFirst();
        return a ? paraAtivo(a) : null;
      }),
    criar: (ctx, hotelId, localId, dados) =>
      banco.executar(ctx, (uow) => criarAtivo(uow, hotelId, localId, dados)),
    alterar: (ctx, ativoId, versaoEsperada, mudanca) =>
      banco.executar(ctx, (uow) => alterarAtivo(uow, ativoId, versaoEsperada, mudanca)),
    mover: (ctx, ativoId, versaoEsperada, localDestinoId) =>
      banco.executar(ctx, (uow) => moverAtivo(uow, ativoId, versaoEsperada, localDestinoId)),
    movimentacoes: (ctx, ativoId) =>
      banco.withContext(ctx, async (tx) =>
        (
          await tx
            .selectFrom('app.ativo_movimentacao as mv')
            .leftJoin('app.membro as m', (j) =>
              j
                .onRef('m.tenant_id', '=', 'mv.tenant_id')
                .onRef('m.usuario_id', '=', 'mv.usuario_id'),
            )
            .select([
              'mv.id',
              'mv.local_origem_id',
              'mv.local_destino_id',
              'mv.usuario_id',
              'mv.movido_em',
              'm.nome',
            ])
            .where('mv.ativo_id', '=', ativoId)
            .orderBy('mv.movido_em', 'desc')
            .orderBy('mv.id', 'desc')
            .execute()
        ).map((m) => ({
          id: m.id,
          localOrigemId: m.local_origem_id,
          localDestinoId: m.local_destino_id,
          usuarioId: m.usuario_id,
          nomeUsuario: m.nome,
          movidoEm: m.movido_em,
        })),
      ),
  };
}

/** Gestão de membros (fase 1a, A3), pelo hk_app: o que cada um vê é da RLS. */
export function criarPortaMembros(banco: AcessoBanco): PortaMembros {
  return {
    listar: (ctx) =>
      banco.withContext(ctx, async (tx) => {
        const membros = await tx
          .selectFrom('app.membro')
          .select(['usuario_id', 'nome', 'email', 'ativo'])
          .orderBy('nome')
          .execute();
        const atribuicoes = (await selecionar(tx).orderBy('papel').execute()).map(paraAtribuicao);
        return membros.map((m) => ({
          usuarioId: m.usuario_id,
          nome: m.nome,
          email: m.email,
          ativo: m.ativo,
          atribuicoes: atribuicoes.filter((a) => a.usuarioId === m.usuario_id),
        }));
      }),
    definirAtivo: (ctx, usuarioId, ativo) =>
      banco.executar(ctx, (uow) => definirAtivoDoMembro(uow, usuarioId, ativo)),
    alterarValidade: (ctx, id, validoAte) =>
      banco.executar(ctx, (uow) => alterarValidadeDaAtribuicao(uow, id, validoAte)),
  };
}

/** Preferências de idioma e região do próprio usuário (F0-10b), pelo hk_app. */
export function criarPortaPreferencias(banco: AcessoBanco): PortaPreferencias {
  return {
    ler: (ctx) => banco.withContext(ctx, preferenciasDoUsuario),
    gravar: (ctx, p) => banco.executar(ctx, (uow) => gravarPreferencias(uow, p)),
  };
}

/** Hotéis a partir do staging (fase 1a, A1): listar, importar e ativar, pelo hk_app. */
export function criarPortaHoteisDoStaging(banco: AcessoBanco): PortaHoteisDoStaging {
  return {
    listar: (ctx) =>
      banco.withContext(ctx, async (tx) => ({
        staging: await hoteisDoStaging(tx),
        cadastrados: await hoteisCadastrados(tx),
        uso: await usoDaLicenca(tx),
      })),
    emSessao: (ctx, fn) =>
      banco.executar(ctx, async (uow) => {
        await travarLicenca(uow);
        return fn(sessaoDeHoteis(uow));
      }),
  };
}

/**
 * Operações offline do PWA (F0-11, ADR-025): o efeito e a chave na mesma unit
 * of work. Reenvio de chave conhecida devolve a resposta guardada sem repetir;
 * dois envios simultâneos: o que perde volta inteiro e lê a resposta do outro.
 */
export function criarPortaOperacoesOffline(banco: AcessoBanco): PortaOperacoesOffline {
  const guardada = (ctx: Parameters<AcessoBanco['withContext']>[0], chave: string) =>
    banco.withContext(ctx, (tx) => respostaDaOperacao(tx, chave));
  return {
    respostaGuardada: guardada,
    async aplicarUmaVez(ctx, operacao, efeito) {
      const antes = await guardada(ctx, operacao.chave);
      if (antes) return { repetida: true, resposta: antes };
      try {
        return await banco.executar(ctx, async (uow) => {
          const resposta = await efeito({
            gravarPreferencias: (p) => gravarPreferencias(uow, p),
            cadastrarAtivo: (hotelId, localId, dados) => criarAtivo(uow, hotelId, localId, dados),
            alterarAtivo: (ativoId, versaoEsperada, mudanca) =>
              alterarAtivo(uow, ativoId, versaoEsperada, mudanca),
            abrirChamado: (hotelId, dados) => criarChamado(uow, hotelId, dados),
            andarComOs: (g) => andarComOs(uow, g),
            apontarHoras: (g) => apontarHoras(uow, g),
            registrarMaterial: (g) => registrarMaterial(uow, g),
            registrarParada: (g) => registrarParada(uow, g),
            encerrarParada: (g) => encerrarParada(uow, g),
          });
          await registrarOperacao(uow, operacao, resposta);
          return { repetida: false, resposta };
        });
      } catch (e) {
        if (!(e instanceof OperacaoJaRecebida)) throw e;
        const depois = await guardada(ctx, operacao.chave);
        if (!depois) throw e;
        return { repetida: true, resposta: depois };
      }
    },
  };
}

/** Portas da ingestão (F0-08): staging pelo hk_ingestao, credenciais pelo hk_app, promoção pelo hk_worker. */
export function criarPortasDeIngestao(banco: AcessoBanco): {
  ingestao: PortaIngestao;
  credenciais: PortaCredenciaisDeAgente;
  promocao: PortaPromocaoDeUhs;
} {
  return {
    ingestao: {
      emSessao: (tenantId, fn) =>
        banco.withIngestao({ tenantId }, (tx) =>
          fn({
            credenciaisAtivas: () => credenciaisAtivas(tx),
            registrarLote: (lote, loteHash) => registrarLote(tx, tenantId, lote, loteHash),
          }),
        ),
    },
    credenciais: {
      criar: (ctx, c) => banco.executar(ctx, (uow) => criarCredencialDeAgente(uow, c)),
      revogar: (ctx, id) => banco.executar(ctx, (uow) => revogarCredencialDeAgente(uow, id)),
    },
    promocao: {
      emSessao: (tenantId, fn) =>
        // Mesmo lock da ativação de hotel: a promoção também consome saldo de UH.
        banco.executarComoSistema({ tenantId }, async (uow) => {
          await travarLicenca(uow);
          return fn(sessaoDePromocao(uow));
        }),
    },
  };
}

/** Escopo dos anexos (F0-10): tudo pela RLS e pelas funções authz.*, no hk_app. */
export function criarPortaEscopoDeAnexo(banco: AcessoBanco): PortaEscopoDeAnexo {
  return {
    hotelDoRegistro: (ctx, entidade, id) =>
      banco.withContext(ctx, (tx) => hotelDoRegistro(tx, entidade, id)),
    escreveNoHotel: (ctx, hotelId) =>
      banco.withContext(ctx, (tx) => hotelNoEscopo(tx, hotelId, 'escrita')),
    leNoHotel: (ctx, hotelId) =>
      banco.withContext(ctx, (tx) => hotelNoEscopo(tx, hotelId, 'leitura')),
  };
}

/** Registro dos anexos (fase 1a, B4): o que cada um vê é da RLS de app.anexo. */
export function criarPortaAnexos(banco: AcessoBanco): PortaAnexos {
  const consulta = (tx: Tx) =>
    tx
      .selectFrom('app.anexo as a')
      .leftJoin('app.membro as m', (j) =>
        j.onRef('m.tenant_id', '=', 'a.tenant_id').onRef('m.usuario_id', '=', 'a.usuario_id'),
      )
      .select([
        'a.id',
        'a.hotel_id',
        'a.entidade',
        'a.local_id',
        'a.ativo_id',
        'a.chamado_id',
        'a.os_id',
        'a.caminho',
        'a.miniatura_caminho',
        'a.tipo',
        'a.nome',
        'a.usuario_id',
        'm.nome as nome_usuario',
        'a.criado_em',
        'a.removido_em',
      ]);
  const paraAnexo = (a: {
    id: string;
    hotel_id: string;
    entidade: string;
    local_id: string | null;
    ativo_id: string | null;
    chamado_id: string | null;
    os_id: string | null;
    caminho: string;
    miniatura_caminho: string | null;
    tipo: string;
    nome: string | null;
    usuario_id: string;
    nome_usuario: string | null;
    criado_em: Date;
    removido_em: Date | null;
  }): AnexoGravado => ({
    id: a.id,
    hotelId: a.hotel_id,
    entidade: a.entidade as EntidadeComAnexo,
    registroId: a.os_id ?? a.chamado_id ?? a.ativo_id ?? a.local_id ?? a.hotel_id,
    caminho: a.caminho,
    miniaturaCaminho: a.miniatura_caminho,
    tipo: a.tipo,
    nome: a.nome,
    usuarioId: a.usuario_id,
    nomeUsuario: a.nome_usuario,
    criadoEm: a.criado_em,
    removidoEm: a.removido_em,
  });
  return {
    hotel: (ctx, hotelId) =>
      banco.withContext(ctx, async (tx) => {
        const h = await tx
          .selectFrom('app.hotel')
          .select(['id', 'bandeira_id'])
          .where('id', '=', hotelId)
          .executeTakeFirst();
        return h ? { id: h.id, bandeiraId: h.bandeira_id } : null;
      }),
    anexos: (ctx, entidade, registroId) =>
      banco.withContext(ctx, async (tx) => {
        let q = consulta(tx).where('a.entidade', '=', entidade).where('a.removido_em', 'is', null);
        q =
          entidade === 'local'
            ? q.where('a.local_id', '=', registroId)
            : entidade === 'ativo'
              ? q.where('a.ativo_id', '=', registroId)
              : entidade === 'chamado'
                ? q.where('a.chamado_id', '=', registroId)
                : entidade === 'os'
                  ? q.where('a.os_id', '=', registroId)
                  : q.where('a.hotel_id', '=', registroId);
        return (await q.orderBy('a.criado_em', 'desc').orderBy('a.id', 'desc').execute()).map(
          paraAnexo,
        );
      }),
    anexo: (ctx, anexoId) =>
      banco.withContext(ctx, async (tx) => {
        const a = await consulta(tx).where('a.id', '=', anexoId).executeTakeFirst();
        return a ? paraAnexo(a) : null;
      }),
    registrar: (ctx, dados) => banco.executar(ctx, (uow) => registrarAnexo(uow, dados)),
    remover: (ctx, anexoId) => banco.executar(ctx, (uow) => removerAnexo(uow, anexoId)),
  };
}
