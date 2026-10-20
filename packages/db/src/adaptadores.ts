// Implementação das portas de packages/aplicacao sobre o acesso ao banco.
// Leitura com withContext, escrita com executar (unit of work): o que cada
// método vê ou grava é o que a RLS permite ao usuário do contexto.
import type {
  PortaFeriadosDoHotel,
  PortaMonitorDeSla,
  PortaAceiteAutomatico,
  PortaGeracaoPreventiva,
  AnexoGravado,
  AtivoGravado,
  ChecklistDaOsGravado,
  EntidadeComAnexo,
  PortaAnexos,
  PortaAtivos,
  PortaEscopoDeAnexo,
  PortaAtribuicoes,
  PortaCategorias,
  PortaChecklists,
  PortaModelosDeAtivo,
  PortaSugestoesDePlano,
  PortaCadastrosDeAtivos,
  PortaChamados,
  PlanoGravado,
  PortaPlanosPreventivos,
  PortaCodigos,
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
  PortaFornecedores,
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
  PortaModulos,
  PortaOperacoesOffline,
  PortaPreferencias,
  PortaPromocaoDeUhs,
  PeriodoDeUhGravado,
  PortaUhIndisponivel,
} from '@hubkeep/aplicacao';
import {
  Conflito,
  type Contexto,
  type EstadoDaOs,
  type EstadoDoChamado,
  type ExecutadoPor,
  type TipoDeCodigoDeManutencao,
  ehDecisaoDoCadastro,
  ehModeloContratual,
  situacaoDoCadastro,
  ehResponsavelDoArrendamento,
  ehMomentoDaFoto,
  ehMotivoDePausa,
} from '@hubkeep/dominio';
import { type NotNull, sql } from 'kysely';
import type { AcessoBanco } from './acesso';
import { cadastroPendente } from './cadastro-aprovado';
import type { Tx } from './conexao';
import {
  dadosDoCalendarioNaTransacao,
  niveisDaPoliticaNaTransacao,
  politicasDoHotel,
} from './leituras-do-hotel';
import { sessaoDoMonitorDeSla } from './repositorios/monitor-sla';
import { sessaoDoAceiteAutomatico } from './repositorios/aceite-automatico';
import { hoteisParaGerar, sessaoDaGeracao } from './repositorios/geracao-preventiva';
import { responsaveisDosPlanos } from './responsaveis-do-plano';
import { paraAtribuicao, selecionarAtribuicoes as selecionar } from './atribuicoes';
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
import { alterarFornecedor, criarFornecedor } from './repositorios/fornecedores';
import {
  alterarAtivo,
  criarAtivo,
  descartarSugestaoDePlano,
  moverAtivo,
} from './repositorios/ativos';
import { alterarCategoria, criarCategoria } from './repositorios/categorias';
import { decidirCadastroDeAtivo } from './repositorios/cadastros-de-ativos';
import {
  alterarModeloDeChecklist,
  aplicarChecklist,
  criarModeloDeChecklist,
  responderChecklist,
} from './repositorios/checklists';
import { criarChamado } from './repositorios/chamados';
import { alterarModeloDeAtivo, criarModeloDeAtivo } from './repositorios/modelos-de-ativo';
import { alterarPlanoPreventivo, criarPlanoPreventivo } from './repositorios/planos-preventivos';
import { alterarFeriadoDoHotel, criarFeriadoDoHotel } from './repositorios/feriados-do-hotel';
import {
  ajustarArrendamento,
  alterarChamadoNaTriagem,
  cancelarOs,
  definirQuemExecuta,
  gerarOs,
  reatribuirOs,
} from './repositorios/triagem';
import { liberarUh, marcarUhIndisponivel } from './repositorios/uh-indisponivel';
import { aceitarOs, reabrirOs } from './repositorios/aceite';
import { alterarCodigo, criarCodigo } from './repositorios/codigos-manutencao';
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

/** Valor gravado de uma política no hotel, na bandeira dele e no grupo, como está no banco (a resolução é do domínio). */
const niveisDaPolitica = (banco: AcessoBanco, ctx: Contexto, hotelId: string, chave: string) =>
  banco.withContext(ctx, (tx) => niveisDaPoliticaNaTransacao(tx, hotelId, chave));

const dadosDoCalendario = (banco: AcessoBanco, ctx: Contexto, hotelId: string) =>
  banco.withContext(ctx, (tx) => dadosDoCalendarioNaTransacao(tx, hotelId));

/** Monitor de SLA (1c, ADR-043), pelo hk_worker, um tenant por transação. */
export function criarPortaMonitorDeSla(banco: AcessoBanco): PortaMonitorDeSla {
  return {
    emSessao: (tenantId, fn) =>
      banco.executarComoSistema({ tenantId }, (uow) => fn(sessaoDoMonitorDeSla(uow))),
  };
}

/** Aceite automático (hk_worker, 1c, M5; ADR-044): um tenant por transação. */
export function criarPortaAceiteAutomatico(banco: AcessoBanco): PortaAceiteAutomatico {
  return {
    emSessao: (tenantId, fn) =>
      banco.executarComoSistema({ tenantId }, (uow) => fn(sessaoDoAceiteAutomatico(uow))),
  };
}

/**
 * Geração da OS preventiva (hk_worker, 1b, PV3; ADR-041): a lista dos hotéis
 * ativos numa leitura do tenant, e cada hotel na transação dele (decisão 13).
 */
export function criarPortaGeracaoPreventiva(banco: AcessoBanco): PortaGeracaoPreventiva {
  return {
    hoteisAtivos: (tenantId) => banco.withSistema({ tenantId }, hoteisParaGerar),
    noHotel: (ctx, fn) =>
      banco.executarComoSistema({ tenantId: ctx.tenantId }, (uow) =>
        fn(sessaoDaGeracao(uow, ctx.hotelId)),
      ),
  };
}

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
      banco.withContext(ctx, async (tx) => {
        const h = await tx
          .selectFrom('app.hotel')
          .select(['id', 'nome', 'status', 'modelo_contratual'])
          .where('id', '=', hotelId)
          .executeTakeFirst();
        return h
          ? {
              id: h.id,
              nome: h.nome,
              status: h.status,
              modeloContratual: ehModeloContratual(h.modelo_contratual)
                ? h.modelo_contratual
                : null,
            }
          : null;
      }),
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
            .selectFrom('app.ativo as a')
            .select([
              'a.id',
              'a.local_id',
              'a.categoria_id',
              'a.modelo_id',
              'a.desativado_em',
              'a.sugestao_descartada_em',
            ])
            .select(cadastroPendente)
            .where('a.hotel_id', '=', hotelId)
            .execute()
        ).map((a) => ({
          id: a.id,
          localId: a.local_id,
          categoriaId: a.categoria_id,
          modeloId: a.modelo_id,
          ativo: a.desativado_em === null,
          sugestaoDescartada: a.sugestao_descartada_em !== null,
          cadastroPendente: a.cadastro_pendente,
        })),
      ),
    planos: (ctx, hotelId) => planosQueCobrem(banco, ctx, hotelId),
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

/**
 * Fornecedores do grupo (fase 1b, I3), pelo hk_app: lê quem tem papel de
 * escrita em algum hotel do grupo; grava o Admin, o Gestor CSC e o Gerente (RLS).
 */
export function criarPortaFornecedores(banco: AcessoBanco): PortaFornecedores {
  return {
    hoteis: (ctx) =>
      banco.withContext(ctx, async (tx) =>
        (await tx.selectFrom('app.hotel').select(['id', 'bandeira_id']).execute()).map((h) => ({
          id: h.id,
          bandeiraId: h.bandeira_id,
        })),
      ),
    listar: (ctx) =>
      banco.withContext(ctx, async (tx) =>
        (
          await tx
            .selectFrom('app.fornecedor')
            .select([
              'id',
              'nome',
              'cnpj',
              'contato_nome',
              'contato_telefone',
              'contato_email',
              'desativado_em',
              'versao',
            ])
            .orderBy('nome')
            .orderBy('id')
            .execute()
        ).map((f) => ({
          id: f.id,
          nome: f.nome,
          cnpj: f.cnpj,
          contatoNome: f.contato_nome,
          contatoTelefone: f.contato_telefone,
          contatoEmail: f.contato_email,
          ativo: f.desativado_em === null,
          versao: f.versao,
        })),
      ),
    criar: (ctx, dados) => banco.executar(ctx, (uow) => criarFornecedor(uow, dados)),
    alterar: (ctx, id, versaoEsperada, mudanca) =>
      banco.executar(ctx, (uow) => alterarFornecedor(uow, id, versaoEsperada, mudanca)),
  };
}

/** Equipes do hotel (fase 1a, A6), pelo hk_app: o que cada um vê e grava é da RLS. */
/** Feriados do hotel (1c, ADR-042), pelo hk_app; a data sai como aaaa-mm-dd, sem fuso. */
export function criarPortaFeriadosDoHotel(banco: AcessoBanco): PortaFeriadosDoHotel {
  const colunas = [
    'f.id',
    'f.hotel_id',
    sql<string>`f.data::text`.as('data'),
    'f.nome',
    'f.anual',
    'f.ativo',
  ] as const;
  const paraFeriado = (f: {
    id: string;
    hotel_id: string;
    data: string;
    nome: string;
    anual: boolean;
    ativo: boolean;
  }) => ({
    id: f.id,
    hotelId: f.hotel_id,
    data: f.data,
    nome: f.nome,
    anual: f.anual,
    ativo: f.ativo,
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
    feriado: (ctx, feriadoId) =>
      banco.withContext(ctx, async (tx) => {
        const f = await tx
          .selectFrom('app.feriado_hotel as f')
          .innerJoin('app.hotel as h', 'h.id', 'f.hotel_id')
          .select([...colunas, 'h.bandeira_id'])
          .where('f.id', '=', feriadoId)
          .executeTakeFirst();
        return f ? { feriado: paraFeriado(f), bandeiraId: f.bandeira_id } : null;
      }),
    listar: (ctx, hotelId) =>
      banco.withContext(ctx, async (tx) =>
        (
          await tx
            .selectFrom('app.feriado_hotel as f')
            .select(colunas)
            .where('f.hotel_id', '=', hotelId)
            .orderBy('f.data')
            .orderBy('f.ativo', 'desc')
            .orderBy('f.id')
            .execute()
        ).map(paraFeriado),
      ),
    criar: (ctx, hotelId, f) => banco.executar(ctx, (uow) => criarFeriadoDoHotel(uow, hotelId, f)),
    alterar: (ctx, feriadoId, mudanca) =>
      banco.executar(ctx, (uow) => alterarFeriadoDoHotel(uow, feriadoId, mudanca)),
  };
}

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
    atribuicoesDeTecnico: (ctx) =>
      banco.withContext(ctx, async (tx) =>
        (
          await selecionar(tx)
            .where('papel', '=', 'tecnico')
            .where('revogado_em', 'is', null)
            .execute()
        ).map(paraAtribuicao),
      ),
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
          .selectFrom('app.hotel as h')
          .leftJoin('app.bandeira as b', (j) =>
            j.onRef('b.tenant_id', '=', 'h.tenant_id').onRef('b.id', '=', 'h.bandeira_id'),
          )
          .select([
            'h.id',
            'h.nome',
            'h.fuso',
            'h.pais',
            'h.subdivisao',
            'h.moeda',
            'h.idioma_padrao',
            'h.modelo_contratual',
            'b.id as bandeira_id',
            'b.nome as bandeira_nome',
          ])
          .where('h.id', '=', hotelId)
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
              modeloContratual: ehModeloContratual(h.modelo_contratual)
                ? h.modelo_contratual
                : null,
              bandeira:
                h.bandeira_id && h.bandeira_nome !== null
                  ? { id: h.bandeira_id, nome: h.bandeira_nome }
                  : null,
            }
          : null;
      }),
    politicas: (ctx, hotelId) =>
      banco.withContext(ctx, async (tx) => {
        const linhas = await (
          hotelId
            ? politicasDoHotel(tx, hotelId)
            : tx
                .selectFrom('app.politica')
                .where('ativa', '=', true)
                .where('escopo_tipo', '=', 'grupo')
        )
          .select(['chave', 'escopo_tipo', 'bandeira_id', 'hotel_id', 'valor'])
          .execute();
        return linhas.map((p) => ({
          chave: p.chave,
          escopo:
            p.escopo_tipo === 'hotel' && p.hotel_id
              ? { tipo: 'hotel' as const, hotelId: p.hotel_id }
              : p.escopo_tipo === 'bandeira' && p.bandeira_id
                ? { tipo: 'bandeira' as const, bandeiraId: p.bandeira_id }
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
  const colunas = [
    'id',
    'hotel_id',
    'nome',
    'tipo',
    'andar',
    'edificacao',
    'status',
    'cod_externo',
  ] as const;
  const paraLocal = (l: {
    id: string;
    hotel_id: string;
    nome: string;
    tipo: LocalDoHotelCadastrado['tipo'];
    andar: string | null;
    edificacao: string | null;
    status: LocalDoHotelCadastrado['status'];
    cod_externo: string | null;
  }): LocalDoHotelCadastrado => ({
    id: l.id,
    hotelId: l.hotel_id,
    nome: l.nome,
    tipo: l.tipo,
    andar: l.andar,
    edificacao: l.edificacao,
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

/** Checklist tipado (fase 1b, PV1; ADR-040), pelo hk_app. */
export function criarPortaChecklists(banco: AcessoBanco): PortaChecklists {
  return {
    idiomaPadrao: (ctx) =>
      banco.withContext(ctx, async (tx) => {
        const t = await tx.selectFrom('app.tenant').select('idioma_padrao').executeTakeFirst();
        return (t?.idioma_padrao ?? 'pt-BR') as Awaited<
          ReturnType<PortaChecklists['idiomaPadrao']>
        >;
      }),
    listarModelos: (ctx) =>
      banco.withContext(ctx, async (tx) =>
        (
          await tx
            .selectFrom('app.checklist_modelo')
            .select(['id', 'categoria_id', 'nomes', 'itens', 'versao', 'ativa'])
            .orderBy('criado_em')
            .orderBy('id')
            .execute()
        ).map((m) => ({
          id: m.id,
          categoriaId: m.categoria_id,
          nomes: m.nomes,
          itens: m.itens,
          versao: m.versao,
          ativa: m.ativa,
        })),
      ),
    criarModelo: (ctx, m) => banco.executar(ctx, (uow) => criarModeloDeChecklist(uow, m)),
    alterarModelo: (ctx, id, mudanca) =>
      banco.executar(ctx, (uow) => alterarModeloDeChecklist(uow, id, mudanca)),
    daOs: (ctx, osId) =>
      banco.withContext(ctx, async (tx) => {
        const c = await tx
          .selectFrom('app.os_checklist')
          .select(COLUNAS_DO_CHECKLIST_DA_OS)
          .where('os_id', '=', osId)
          .executeTakeFirst();
        return c ? paraChecklistDaOs(c) : null;
      }),
    aplicar: (ctx, a) => banco.executar(ctx, (uow) => aplicarChecklist(uow, a)),
  };
}

/** Planos preventivos (fase 1b, PV2; ADR-041), pelo hk_app. */
export function criarPortaPlanosPreventivos(banco: AcessoBanco): PortaPlanosPreventivos {
  const selecionar = (tx: Tx) =>
    tx
      .selectFrom('app.plano_preventivo')
      .select([
        'id',
        'hotel_id',
        'ativo_id',
        'categoria_id',
        'nome',
        'intervalo',
        'unidade',
        sql<string>`inicio::text`.as('inicio'),
        'checklist_modelo_id',
        'tecnico_id',
        'equipe_id',
        'situacao',
        'versao',
      ]);
  type Linha = Awaited<ReturnType<ReturnType<typeof selecionar>['executeTakeFirstOrThrow']>>;
  const paraPlano = (p: Linha): PlanoGravado => ({
    id: p.id,
    hotelId: p.hotel_id,
    ativoId: p.ativo_id,
    categoriaId: p.categoria_id,
    nome: p.nome,
    intervalo: p.intervalo,
    unidade: p.unidade as PlanoGravado['unidade'],
    inicio: p.inicio,
    checklistModeloId: p.checklist_modelo_id,
    tecnicoId: p.tecnico_id,
    equipeId: p.equipe_id,
    situacao: p.situacao as PlanoGravado['situacao'],
    versao: p.versao,
  });
  // Ativos primeiro, depois pausados e encerrados; o nome desempata.
  const ordem = sql<number>`case situacao when 'ativo' then 0 when 'pausado' then 1 else 2 end`;
  return {
    hotel: (ctx, hotelId) =>
      banco.withContext(ctx, async (tx) => {
        const h = await tx
          .selectFrom('app.hotel')
          .select(['id', 'bandeira_id', 'fuso'])
          .where('id', '=', hotelId)
          .executeTakeFirst();
        return h ? { id: h.id, bandeiraId: h.bandeira_id, fuso: h.fuso } : null;
      }),
    doHotel: (ctx, hotelId) =>
      banco.withContext(ctx, async (tx) =>
        (
          await selecionar(tx)
            .where('hotel_id', '=', hotelId)
            .orderBy(ordem)
            .orderBy('nome')
            .orderBy('id')
            .execute()
        ).map(paraPlano),
      ),
    doAtivo: (ctx, ativoId) =>
      banco.withContext(ctx, async (tx) =>
        (
          await selecionar(tx)
            .where('ativo_id', '=', ativoId)
            .orderBy(ordem)
            .orderBy('nome')
            .orderBy('id')
            .execute()
        ).map(paraPlano),
      ),
    plano: (ctx, id) =>
      banco.withContext(ctx, async (tx) => {
        const p = await selecionar(tx).where('id', '=', id).executeTakeFirst();
        return p ? paraPlano(p) : null;
      }),
    ativo: (ctx, ativoId) =>
      banco.withContext(ctx, async (tx) => {
        const a = await tx
          .selectFrom('app.ativo')
          .select(['hotel_id', 'desativado_em'])
          .where('id', '=', ativoId)
          .executeTakeFirst();
        return a ? { hotelId: a.hotel_id, ativo: a.desativado_em === null } : null;
      }),
    categoriaExiste: (ctx, categoriaId) =>
      banco.withContext(
        ctx,
        async (tx) =>
          (await tx
            .selectFrom('app.categoria_ativo')
            .select('id')
            .where('id', '=', categoriaId)
            .where('ativa', '=', true)
            .executeTakeFirst()) !== undefined,
      ),
    conferencia: (ctx, planos) =>
      banco.withContext(ctx, async (tx) => {
        const responsaveis = await responsaveisDosPlanos(
          tx,
          planos.map((p) => ({ id: p.id, tecnico_id: p.tecnicoId, equipe_id: p.equipeId })),
        );
        const ids = [
          ...new Set(planos.flatMap((p) => (p.checklistModeloId ? [p.checklistModeloId] : []))),
        ];
        const modelos =
          ids.length === 0
            ? []
            : await tx
                .selectFrom('app.checklist_modelo')
                .select(['id', 'ativa'])
                .where('id', 'in', ids)
                .execute();
        return new Map(
          planos.map((p) => [
            p.id,
            {
              responsavel: responsaveis.get(p.id) ?? null,
              modeloAtivo: modelos.find((m) => m.id === p.checklistModeloId)?.ativa ?? null,
            },
          ]),
        );
      }),
    modeloDeChecklist: (ctx, id) =>
      banco.withContext(ctx, async (tx) => {
        const m = await tx
          .selectFrom('app.checklist_modelo')
          .select('ativa')
          .where('id', '=', id)
          .executeTakeFirst();
        return m ? { ativa: m.ativa } : null;
      }),
    criar: (ctx, p) => banco.executar(ctx, (uow) => criarPlanoPreventivo(uow, p)),
    alterar: (ctx, id, versao, mudanca) =>
      banco.executar(ctx, (uow) => alterarPlanoPreventivo(uow, id, versao, mudanca)),
  };
}

const COLUNAS_DO_CHECKLIST_DA_OS = [
  'id',
  'os_id',
  'hotel_id',
  'modelo_id',
  'modelo_versao',
  'nomes',
  'itens',
  'respostas',
] as const;

const paraChecklistDaOs = (c: {
  id: string;
  os_id: string;
  hotel_id: string;
  modelo_id: string;
  modelo_versao: number;
  nomes: unknown;
  itens: unknown;
  respostas: unknown;
}): ChecklistDaOsGravado => ({
  id: c.id,
  osId: c.os_id,
  hotelId: c.hotel_id,
  modeloId: c.modelo_id,
  modeloVersao: c.modelo_versao,
  nomes: c.nomes,
  itens: c.itens,
  respostas: c.respostas,
});

/** Códigos de falha, causa e solução (fase 1b, I6), pelo hk_app. */
/**
 * Módulos contratados do tenant (I7), pelo hk_app com o contexto de quem pede.
 * A RLS só deixa ler quem tem papel vigente no tenant; para os outros, vazio.
 */
export function criarPortaModulos(banco: AcessoBanco): PortaModulos {
  return {
    contratados: (ctx) =>
      banco.withContext(ctx, async (tx) =>
        (
          await tx
            .selectFrom('licenca.modulo')
            .select(['modulo', 'inicio', 'fim'])
            .where('tenant_id', '=', ctx.tenantId)
            .execute()
        ).map((m) => ({
          modulo: m.modulo,
          inicio: new Date(m.inicio),
          fim: m.fim && new Date(m.fim),
        })),
      ),
  };
}

export function criarPortaCodigos(banco: AcessoBanco): PortaCodigos {
  return {
    idiomaPadrao: (ctx) =>
      banco.withContext(ctx, async (tx) => {
        const t = await tx.selectFrom('app.tenant').select('idioma_padrao').executeTakeFirst();
        return (t?.idioma_padrao ?? 'pt-BR') as Awaited<ReturnType<PortaCodigos['idiomaPadrao']>>;
      }),
    listar: (ctx) =>
      banco.withContext(ctx, async (tx) =>
        (
          await tx
            .selectFrom('app.codigo_manutencao')
            .select(['id', 'tipo', 'categoria_id', 'chave_padrao', 'nomes', 'ativa'])
            .orderBy('criado_em')
            .orderBy('id')
            .execute()
        ).map((c) => ({
          id: c.id,
          // O check codigo_manutencao_tipo_lista garante um dos tipos do domínio.
          tipo: c.tipo as TipoDeCodigoDeManutencao,
          categoriaId: c.categoria_id,
          chavePadrao: c.chave_padrao,
          nomes: c.nomes,
          ativa: c.ativa,
        })),
      ),
    criar: (ctx, c) => banco.executar(ctx, (uow) => criarCodigo(uow, c)),
    alterar: (ctx, id, mudanca) => banco.executar(ctx, (uow) => alterarCodigo(uow, id, mudanca)),
    categoriaDoAtivo: (ctx, ativoId) =>
      banco.withContext(ctx, async (tx) => {
        const a = await tx
          .selectFrom('app.ativo')
          .select('categoria_id')
          .where('id', '=', ativoId)
          .executeTakeFirst();
        return a?.categoria_id ?? null;
      }),
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
          .select(['id', 'hotel_id', 'tipo', 'status'])
          .where('id', '=', localId)
          .executeTakeFirst();
        return l
          ? {
              id: l.id,
              hotelId: l.hotel_id,
              tipo: l.tipo,
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
    calendario: (ctx, hotelId) => dadosDoCalendario(banco, ctx, hotelId),
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
            'origem',
            'impacto_hospede',
            'categoria_id',
            'prazo_atendimento',
            'prazo_solucao',
            'pausado_segundos',
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
              origem: c.origem,
              impactoHospede: c.impacto_hospede,
              categoriaId: c.categoria_id,
              prazoAtendimento: c.prazo_atendimento,
              prazoSolucao: c.prazo_solucao,
              pausadoSegundos: c.pausado_segundos,
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
  'executado_por',
  'fornecedor_id',
  'custo_informado',
  'codigo_falha_id',
  'codigo_causa_id',
  'codigo_solucao_id',
  'assinatura_aceite_id',
  'responsavel_arrendamento',
  'locador_avisado_em',
  'criado_por',
  'versao',
  'criado_em',
] as const;

/**
 * O que a leitura da OS junta às COLUNAS_DA_OS: a bandeira do hotel (a regra
 * de papel olha) e a preventiva (PV3), com a data prevista em texto.
 */
const extrasDaOs = [
  'plano_id',
  'ativo_id',
  sql<string | null>`data_prevista::text`.as('data_prevista'),
  sql<string | null>`plano_aplicado->>'nome'`.as('plano_nome'),
  sql<string | null>`(select h.bandeira_id from app.hotel h where h.id = app.os.hotel_id)`.as(
    'bandeira_id',
  ),
] as const;

function paraOs<C extends string | null, A extends string | null>(o: {
  id: string;
  hotel_id: string;
  bandeira_id: string | null;
  chamado_id: C;
  plano_id: string | null;
  ativo_id: string | null;
  data_prevista: string | null;
  plano_nome: string | null;
  estado: string;
  situacao_id: string;
  tecnico_id: string | null;
  equipe_id: string | null;
  motivo_cancelamento: string | null;
  motivo_reabertura: string | null;
  executado_por: string;
  fornecedor_id: string | null;
  custo_informado: string | null;
  codigo_falha_id: string | null;
  codigo_causa_id: string | null;
  codigo_solucao_id: string | null;
  assinatura_aceite_id: string | null;
  responsavel_arrendamento: string | null;
  locador_avisado_em: Date | null;
  criado_por: A;
  versao: number;
  criado_em: Date;
}): OsGravada & { chamadoId: C; criadoPor: A } {
  return {
    id: o.id,
    hotelId: o.hotel_id,
    bandeiraId: o.bandeira_id,
    chamadoId: o.chamado_id,
    // O check os_de_um_tipo (0048) garante plano, ativo e data juntos na preventiva.
    preventiva:
      o.plano_id !== null && o.ativo_id !== null && o.data_prevista !== null
        ? {
            planoId: o.plano_id,
            planoNome: o.plano_nome ?? '',
            ativoId: o.ativo_id,
            dataPrevista: o.data_prevista,
          }
        : null,
    estado: o.estado as EstadoDaOs,
    situacaoId: o.situacao_id,
    // O check os_um_responsavel garante exatamente um dos dois.
    responsavel:
      o.tecnico_id !== null
        ? { tipo: 'tecnico', usuarioId: o.tecnico_id }
        : { tipo: 'equipe', equipeId: o.equipe_id ?? '' },
    motivoCancelamento: o.motivo_cancelamento,
    motivoReabertura: o.motivo_reabertura,
    // O check os_executado_por_lista garante um dos EXECUTORES_DA_OS.
    executadoPor: o.executado_por as ExecutadoPor,
    fornecedorId: o.fornecedor_id,
    // numeric(12,2) chega como texto; dois decimais cabem no número.
    custoInformado: o.custo_informado === null ? null : Number(o.custo_informado),
    codigos: {
      falhaId: o.codigo_falha_id,
      causaId: o.codigo_causa_id,
      solucaoId: o.codigo_solucao_id,
    },
    assinaturaAceiteId: o.assinatura_aceite_id,
    // O check os_responsavel_arrendamento_lista garante um dos RESPONSAVEIS_DO_ARRENDAMENTO.
    responsavelArrendamento: ehResponsavelDoArrendamento(o.responsavel_arrendamento)
      ? o.responsavel_arrendamento
      : null,
    locadorAvisadoEm: o.locador_avisado_em,
    criadoPor: o.criado_por,
    versao: o.versao,
    criadoEm: o.criado_em,
  };
}

/**
 * Início da parada aberta do ativo (C5), como subconsulta da leitura; null se
 * não está parado. A RLS da parada vale para quem lê.
 */
/** A decisão sobre o cadastro do ativo (M4) e o motivo da recusa; null sem decisão. */
const decisaoDoCadastro = (hotel: string, ativo: string) => [
  sql<string | null>`(select d.decisao from app.ativo_decisao_cadastro d
    where d.hotel_id = ${sql.ref(hotel)} and d.ativo_id = ${sql.ref(ativo)})`.as(
    'decisao_cadastro',
  ),
  sql<string | null>`(select d.motivo from app.ativo_decisao_cadastro d
    where d.hotel_id = ${sql.ref(hotel)} and d.ativo_id = ${sql.ref(ativo)})`.as('motivo_recusa'),
];

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

/** Início do período aberto da UH do chamado (I4); null se a UH não está indisponível. */
const uhIndisponivelDesde = (hotel: string, chamado: string) =>
  sql<Date | null>`(select u.inicio from app.uh_indisponivel u
    where u.hotel_id = ${sql.ref(hotel)} and u.chamado_id = ${sql.ref(chamado)} and u.fim is null
    limit 1)`.as('uh_indisponivel_desde');

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
            'h.modelo_contratual',
            'c.local_id',
            'c.ativo_id',
            'c.estado',
            'c.situacao_id',
            'c.prioridade_id',
            'c.aberto_por',
            'c.versao',
            'c.categoria_id',
            'c.criado_em',
            'c.politica_aplicada',
            'c.prazo_atendimento',
            'c.prazo_solucao',
            'c.pausado_segundos',
            (eb) =>
              eb
                .exists(
                  eb
                    .selectFrom('app.os as o')
                    .select('o.id')
                    .whereRef('o.hotel_id', '=', 'c.hotel_id')
                    .whereRef('o.chamado_id', '=', 'c.id'),
                )
                .as('ja_teve_os'),
          ])
          .where('c.id', '=', chamadoId)
          .executeTakeFirst();
        return c
          ? {
              id: c.id,
              hotel: { id: c.hotel_id, bandeiraId: c.bandeira_id },
              modeloContratual: ehModeloContratual(c.modelo_contratual)
                ? c.modelo_contratual
                : null,
              localId: c.local_id,
              ativoId: c.ativo_id,
              estado: c.estado as EstadoDoChamado,
              situacaoId: c.situacao_id,
              prioridadeId: c.prioridade_id,
              abertoPor: c.aberto_por,
              versao: c.versao,
              sla: {
                categoriaId: c.categoria_id,
                abertoEm: c.criado_em,
                politicaAplicada: c.politica_aplicada,
                prazoAtendimento: c.prazo_atendimento,
                prazoSolucao: c.prazo_solucao,
                pausadoSegundos: c.pausado_segundos,
                jaTeveOs: Boolean(c.ja_teve_os),
              },
            }
          : null;
      }),
    osDoChamado: (ctx, chamadoId) =>
      banco.withContext(ctx, async (tx) =>
        (
          await tx
            .selectFrom('app.os')
            .select(COLUNAS_DA_OS)
            .select(extrasDaOs)
            .where('chamado_id', '=', chamadoId)
            .$narrowType<{ chamado_id: NotNull; criado_por: NotNull }>()
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
          .select(extrasDaOs)
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
    fornecedor: (ctx, fornecedorId) =>
      banco.withContext(ctx, async (tx) => {
        const f = await tx
          .selectFrom('app.fornecedor')
          .select('desativado_em')
          .where('id', '=', fornecedorId)
          .executeTakeFirst();
        return f ? { ativo: f.desativado_em === null } : null;
      }),
    politica: (ctx, hotelId, chave) => niveisDaPolitica(banco, ctx, hotelId, chave),
    calendario: (ctx, hotelId) => dadosDoCalendario(banco, ctx, hotelId),
    equipesDoUsuario: (ctx) =>
      banco.withContext(ctx, async (tx) =>
        (await equipesDoUsuario(tx, ctx.usuarioId).execute()).map((e) => e.equipe_id),
      ),
    dadosDoAceite: (ctx, g) =>
      banco.withContext(ctx, async (tx) => {
        // Na preventiva não há quem abriu: sem equipes, sem consulta.
        const equipes =
          g.abertoPor === null ? [] : await equipesDoUsuario(tx, g.abertoPor).execute();
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
    definirQuemExecuta: (ctx, g) => banco.executar(ctx, (uow) => definirQuemExecuta(uow, g)),
    ajustarArrendamento: (ctx, g) => banco.executar(ctx, (uow) => ajustarArrendamento(uow, g)),
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
    ultimaPausa: (ctx, osId) =>
      banco.withContext(ctx, async (tx) => {
        const r = await tx
          .selectFrom('app.os_transicao')
          .select(['quando', 'motivo_pausa'])
          .where('os_id', '=', osId)
          .where('acao', '=', 'pausar')
          .orderBy('quando', 'desc')
          .orderBy('id', 'desc')
          .limit(1)
          .executeTakeFirst();
        return r
          ? {
              em: new Date(r.quando),
              motivo: ehMotivoDePausa(r.motivo_pausa) ? r.motivo_pausa : null,
            }
          : null;
      }),
    fotosDepois: (ctx, osId) =>
      banco.withContext(ctx, async (tx) => {
        const r = await tx
          .selectFrom('app.anexo')
          .select((eb) => eb.fn.countAll<string>().as('n'))
          .where('os_id', '=', osId)
          .where('momento', '=', 'depois')
          .where('removido_em', 'is', null)
          .executeTakeFirst();
        return Number(r?.n ?? 0);
      }),
    equipesDoUsuario: (ctx) =>
      banco.withContext(ctx, async (tx) =>
        (await equipesDoUsuario(tx, ctx.usuarioId).execute()).map((e) => e.equipe_id),
      ),
    osDoDia: (ctx) =>
      banco.withContext(ctx, async (tx) => {
        const linhas = await tx
          .selectFrom('app.os as o')
          // A corretiva traz o chamado e o local dele; a preventiva (PV3c), sem
          // chamado, traz o local da OS e o ativo da ocorrência.
          .leftJoin('app.chamado as c', (j) =>
            j.onRef('c.hotel_id', '=', 'o.hotel_id').onRef('c.id', '=', 'o.chamado_id'),
          )
          .leftJoin('app.local as l', (j) =>
            j.onRef('l.hotel_id', '=', 'c.hotel_id').onRef('l.id', '=', 'c.local_id'),
          )
          .leftJoin('app.local as lo', (j) =>
            j.onRef('lo.hotel_id', '=', 'o.hotel_id').onRef('lo.id', '=', 'o.local_id'),
          )
          .leftJoin('app.ativo as ao', (j) =>
            j.onRef('ao.hotel_id', '=', 'o.hotel_id').onRef('ao.id', '=', 'o.ativo_id'),
          )
          .leftJoin('app.os_checklist as k', (j) =>
            j.onRef('k.hotel_id', '=', 'o.hotel_id').onRef('k.os_id', '=', 'o.id'),
          )
          .select([
            'k.id as checklist_id',
            'k.modelo_id as checklist_modelo_id',
            'k.modelo_versao as checklist_modelo_versao',
            'k.nomes as checklist_nomes',
            'k.itens as checklist_itens',
            'k.respostas as checklist_respostas',
          ])
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
            'l.edificacao as local_edificacao',
            'c.prioridade_id',
            'c.estado as chamado_estado',
            'c.ativo_id',
            'o.plano_id',
            sql<string | null>`o.plano_aplicado->>'nome'`.as('plano_nome'),
            sql<string | null>`o.data_prevista::text`.as('data_prevista'),
            'o.ativo_id as preventiva_ativo_id',
            'ao.nome as preventiva_ativo_nome',
            'o.local_id as os_local_id',
            'lo.nome as os_local_nome',
            'lo.edificacao as os_local_edificacao',
          ])
          .select(paradoDesde('c.hotel_id', 'c.ativo_id'))
          .select(paradaDoChamado('c.hotel_id', 'c.id'))
          .select(uhIndisponivelDesde('c.hotel_id', 'c.id'))
          .select((eb) =>
            eb
              .selectFrom('app.anexo as a')
              .select((e) => e.fn.countAll<string>().as('n'))
              .whereRef('a.hotel_id', '=', 'o.hotel_id')
              .whereRef('a.os_id', '=', 'o.id')
              .where('a.momento', '=', 'depois')
              .where('a.removido_em', 'is', null)
              .as('fotos_depois'),
          )
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
          fotosDepois: Number(o.fotos_depois ?? 0),
          checklist:
            o.checklist_id === null
              ? null
              : {
                  id: o.checklist_id,
                  osId: o.id,
                  hotelId: o.hotel_id,
                  modeloId: o.checklist_modelo_id ?? '',
                  modeloVersao: o.checklist_modelo_versao ?? 1,
                  nomes: o.checklist_nomes,
                  itens: o.checklist_itens,
                  respostas: o.checklist_respostas,
                },
          chamado:
            o.chamado_id === null
              ? null
              : {
                  id: o.chamado_id,
                  descricao: o.descricao ?? '',
                  localId: o.local_id ?? '',
                  localNome: o.local_nome ?? '',
                  localEdificacao: o.local_edificacao,
                  prioridadeId: o.prioridade_id ?? '',
                  estado: o.chamado_estado as EstadoDoChamado,
                  ativoId: o.ativo_id,
                  paradoDesde: o.parado_desde,
                  paradaDoChamado: o.parada_do_chamado,
                  uhIndisponivelDesde: o.uh_indisponivel_desde,
                },
          // O check os_de_um_tipo (0048) garante plano, ativo, data e cópia na preventiva.
          preventiva:
            o.plano_id === null
              ? null
              : {
                  planoId: o.plano_id,
                  planoNome: o.plano_nome ?? '',
                  dataPrevista: o.data_prevista ?? '',
                  ativoId: o.preventiva_ativo_id ?? '',
                  ativoNome: o.preventiva_ativo_nome ?? '',
                  localId: o.os_local_id,
                  localNome: o.os_local_nome ?? '',
                  localEdificacao: o.os_local_edificacao,
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

const COLUNAS_DA_UH = [
  'id',
  'hotel_id',
  'local_id',
  'chamado_id',
  'inicio',
  'fim',
  'aberta_por',
  'encerrada_por',
] as const;

function paraPeriodoDeUh(u: {
  id: string;
  hotel_id: string;
  local_id: string;
  chamado_id: string;
  inicio: Date;
  fim: Date | null;
  aberta_por: string;
  encerrada_por: string | null;
}): PeriodoDeUhGravado {
  return {
    id: u.id,
    hotelId: u.hotel_id,
    localId: u.local_id,
    chamadoId: u.chamado_id,
    inicio: u.inicio,
    fim: u.fim,
    abertaPor: u.aberta_por,
    encerradaPor: u.encerrada_por,
  };
}

/** UH indisponível (fase 1b, I4), pelo hk_app. */
export function criarPortaUhIndisponivel(banco: AcessoBanco): PortaUhIndisponivel {
  return {
    periodo: (ctx, periodoId) =>
      banco.withContext(ctx, async (tx) => {
        const u = await tx
          .selectFrom('app.uh_indisponivel')
          .select(COLUNAS_DA_UH)
          .where('id', '=', periodoId)
          .executeTakeFirst();
        return u ? paraPeriodoDeUh(u) : null;
      }),
    abertoDoChamado: (ctx, chamadoId) =>
      banco.withContext(ctx, async (tx) => {
        const u = await tx
          .selectFrom('app.uh_indisponivel')
          .select(COLUNAS_DA_UH)
          .where('chamado_id', '=', chamadoId)
          .where('fim', 'is', null)
          .executeTakeFirst();
        return u ? paraPeriodoDeUh(u) : null;
      }),
    doChamado: (ctx, chamadoId) =>
      banco.withContext(ctx, async (tx) =>
        (
          await tx
            .selectFrom('app.uh_indisponivel')
            .select(COLUNAS_DA_UH)
            .where('chamado_id', '=', chamadoId)
            .orderBy('inicio', 'desc')
            .orderBy('id', 'desc')
            .execute()
        ).map(paraPeriodoDeUh),
      ),
    marcar: (ctx, m) => banco.executar(ctx, (uow) => marcarUhIndisponivel(uow, m)),
    liberar: (ctx, l) => banco.executar(ctx, (uow) => liberarUh(uow, l)),
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
    'modelo_id',
    'nome',
    'fabricante',
    'modelo',
    'numero_serie',
    'criticidade',
    'campos',
    'versao',
    'desativado_em',
    'codigo_qr',
    'situacao_cadastro',
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
    modelo_id: string | null;
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
    situacao_cadastro: string;
    decisao_cadastro: string | null;
    motivo_recusa: string | null;
  }): AtivoGravado => ({
    id: a.id,
    hotelId: a.hotel_id,
    localId: a.local_id,
    categoriaId: a.categoria_id,
    modeloId: a.modelo_id,
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
    situacaoCadastro: situacaoDoCadastro(
      a.situacao_cadastro === 'pendente' ? 'pendente' : 'aprovado',
      ehDecisaoDoCadastro(a.decisao_cadastro) ? a.decisao_cadastro : null,
    ),
    motivoDaRecusa: a.decisao_cadastro === 'recusado' ? a.motivo_recusa : null,
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
    modelo: (ctx, modeloId) =>
      banco.withContext(ctx, async (tx) => {
        const m = await tx
          .selectFrom('app.modelo_ativo')
          .select(['id', 'categoria_id', 'ativa'])
          .where('id', '=', modeloId)
          .executeTakeFirst();
        return m ? { id: m.id, categoriaId: m.categoria_id, ativa: m.ativa } : null;
      }),
    ativos: (ctx, hotelId, termo) =>
      banco.withContext(ctx, async (tx) =>
        (
          await tx
            .selectFrom('app.ativo as a')
            .select(colunas)
            .select(datas)
            .select(paradoDesde('a.hotel_id', 'a.id'))
            .select(decisaoDoCadastro('a.hotel_id', 'a.id'))
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
          .select(decisaoDoCadastro('a.hotel_id', 'a.id'))
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
          .select(decisaoDoCadastro('a.hotel_id', 'a.id'))
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
            cadastrarAtivo: (hotelId, localId, dados, situacao) =>
              criarAtivo(uow, hotelId, localId, dados, situacao),
            alterarAtivo: (ativoId, versaoEsperada, mudanca) =>
              alterarAtivo(uow, ativoId, versaoEsperada, mudanca),
            abrirChamado: (hotelId, dados) => criarChamado(uow, hotelId, dados),
            andarComOs: (g) => andarComOs(uow, g),
            apontarHoras: (g) => apontarHoras(uow, g),
            registrarMaterial: (g) => registrarMaterial(uow, g),
            registrarParada: (g) => registrarParada(uow, g),
            encerrarParada: (g) => encerrarParada(uow, g),
            liberarUh: (g) => liberarUh(uow, g),
            responderChecklist: (g) => responderChecklist(uow, g),
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
        'a.momento',
        'a.assinatura',
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
    momento: string | null;
    assinatura: boolean;
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
    momento: ehMomentoDaFoto(a.momento) ? a.momento : null,
    assinatura: a.assinatura,
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

/** Aprovação do cadastro dos ativos (fase 1b, M4; migração 0058), pelo hk_app. */
export function criarPortaCadastrosDeAtivos(banco: AcessoBanco): PortaCadastrosDeAtivos {
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
    pendentes: (ctx, hotelId) =>
      banco.withContext(ctx, async (tx) =>
        (
          await tx
            .selectFrom('app.ativo as a')
            .innerJoin('app.local as l', (j) =>
              j.onRef('l.hotel_id', '=', 'a.hotel_id').onRef('l.id', '=', 'a.local_id'),
            )
            .select([
              'a.id',
              'a.hotel_id',
              'a.local_id',
              'l.nome as local_nome',
              'a.categoria_id',
              'a.nome',
              'a.fabricante',
              'a.modelo',
              'a.numero_serie',
              'a.versao',
              'a.criado_em',
            ])
            .where('a.hotel_id', '=', hotelId)
            .where('a.situacao_cadastro', '=', 'pendente')
            .where('a.desativado_em', 'is', null)
            .where(({ not, exists, selectFrom }) =>
              not(
                exists(
                  selectFrom('app.ativo_decisao_cadastro as d')
                    .select('d.id')
                    .whereRef('d.hotel_id', '=', 'a.hotel_id')
                    .whereRef('d.ativo_id', '=', 'a.id'),
                ),
              ),
            )
            .orderBy('a.criado_em')
            .orderBy('a.id')
            .execute()
        ).map((a) => ({
          id: a.id,
          hotelId: a.hotel_id,
          localId: a.local_id,
          localNome: a.local_nome,
          categoriaId: a.categoria_id,
          nome: a.nome,
          fabricante: a.fabricante,
          modelo: a.modelo,
          numeroSerie: a.numero_serie,
          versao: a.versao,
          criadoEm: a.criado_em,
        })),
      ),
    ativo: (ctx, ativoId) =>
      banco.withContext(ctx, async (tx) => {
        const a = await tx
          .selectFrom('app.ativo as a')
          .select(['a.id', 'a.hotel_id', 'a.versao', 'a.situacao_cadastro', 'a.desativado_em'])
          .select(decisaoDoCadastro('a.hotel_id', 'a.id'))
          .where('a.id', '=', ativoId)
          .executeTakeFirst();
        return a
          ? {
              id: a.id,
              hotelId: a.hotel_id,
              versao: a.versao,
              situacao: situacaoDoCadastro(
                a.situacao_cadastro === 'pendente' ? 'pendente' : 'aprovado',
                ehDecisaoDoCadastro(a.decisao_cadastro) ? a.decisao_cadastro : null,
              ),
              ativo: a.desativado_em === null,
            }
          : null;
      }),
    decidir: (ctx, d) => banco.executar(ctx, (uow) => decidirCadastroDeAtivo(uow, d)),
  };
}

/** Os planos do hotel que a regra do plano que cobre o ativo lê (M1), pela RLS. */
const planosQueCobrem = (banco: AcessoBanco, ctx: Contexto, hotelId: string) =>
  banco.withContext(ctx, async (tx) =>
    (
      await tx
        .selectFrom('app.plano_preventivo')
        .select(['ativo_id', 'categoria_id', 'situacao'])
        .where('hotel_id', '=', hotelId)
        .execute()
    ).map((p) => ({
      ativoId: p.ativo_id,
      categoriaId: p.categoria_id,
      situacao: p.situacao as PlanoGravado['situacao'],
    })),
  );

/** Sugestões de plano (fase 1b, M1, caminho C; migração 0051), pelo hk_app. */
export function criarPortaSugestoesDePlano(banco: AcessoBanco): PortaSugestoesDePlano {
  const selecionar = (tx: Tx) =>
    tx
      .selectFrom('app.ativo as a')
      .select([
        'a.id',
        'a.hotel_id',
        'a.nome',
        'a.categoria_id',
        'a.modelo_id',
        'a.versao',
        'a.desativado_em',
        'a.sugestao_descartada_em',
      ])
      .select(cadastroPendente);
  type Linha = Awaited<ReturnType<ReturnType<typeof selecionar>['executeTakeFirstOrThrow']>>;
  const paraAtivo = (a: Linha) => ({
    id: a.id,
    hotelId: a.hotel_id,
    nome: a.nome,
    categoriaId: a.categoria_id,
    modeloId: a.modelo_id,
    versao: a.versao,
    ativo: a.desativado_em === null,
    sugestaoDescartada: a.sugestao_descartada_em !== null,
    cadastroPendente: a.cadastro_pendente,
  });
  return {
    ativos: (ctx, hotelId) =>
      banco.withContext(ctx, async (tx) =>
        (
          await selecionar(tx)
            .where('a.hotel_id', '=', hotelId)
            .where('a.modelo_id', 'is not', null)
            .orderBy('a.nome')
            .orderBy('a.id')
            .execute()
        ).map(paraAtivo),
      ),
    ativo: (ctx, id) =>
      banco.withContext(ctx, async (tx) => {
        const a = await selecionar(tx).where('a.id', '=', id).executeTakeFirst();
        return a ? paraAtivo(a) : null;
      }),
    modelos: (ctx, ids) =>
      banco.withContext(ctx, async (tx) =>
        (
          await tx
            .selectFrom('app.modelo_ativo as m')
            .leftJoin('app.checklist_modelo as c', (j) =>
              j
                .onRef('c.tenant_id', '=', 'm.tenant_id')
                .onRef('c.id', '=', 'm.checklist_modelo_id'),
            )
            .select([
              'm.id',
              'm.nome',
              'm.plano_sugerido',
              'm.checklist_modelo_id',
              'c.ativa as checklist_ativa',
            ])
            .where('m.id', 'in', [...ids])
            .execute()
        ).map((m) => ({
          id: m.id,
          nome: m.nome,
          planoSugerido: m.plano_sugerido,
          checklistModeloId: m.checklist_modelo_id,
          checklistAtivo: m.checklist_ativa ?? null,
        })),
      ),
    descartar: (ctx, ativoId, versao, motivo) =>
      banco.executar(ctx, (uow) => descartarSugestaoDePlano(uow, ativoId, versao, motivo)),
  };
}

/** Modelos de ativo (fase 1b, M1; migração 0050), pelo hk_app. */
export function criarPortaModelosDeAtivo(banco: AcessoBanco): PortaModelosDeAtivo {
  return {
    listar: (ctx) =>
      banco.withContext(ctx, async (tx) =>
        (
          await tx
            .selectFrom('app.modelo_ativo')
            .select([
              'id',
              'categoria_id',
              'nome',
              'fabricante',
              'modelo',
              'campos',
              'checklist_modelo_id',
              'plano_sugerido',
              'versao',
              'ativa',
            ])
            .orderBy('nome')
            .orderBy('id')
            .execute()
        ).map((m) => ({
          id: m.id,
          categoriaId: m.categoria_id,
          nome: m.nome,
          fabricante: m.fabricante,
          modelo: m.modelo,
          campos: m.campos,
          checklistModeloId: m.checklist_modelo_id,
          planoSugerido: m.plano_sugerido,
          versao: m.versao,
          ativa: m.ativa,
        })),
      ),
    categorias: (ctx) =>
      banco.withContext(ctx, async (tx) =>
        tx.selectFrom('app.categoria_ativo').select(['id', 'ativa', 'campos']).execute(),
      ),
    checklists: (ctx) =>
      banco.withContext(ctx, async (tx) =>
        (
          await tx
            .selectFrom('app.checklist_modelo')
            .select(['id', 'ativa', 'categoria_id'])
            .execute()
        ).map((c) => ({ id: c.id, ativa: c.ativa, categoriaId: c.categoria_id })),
      ),
    criar: (ctx, dados) => banco.executar(ctx, (uow) => criarModeloDeAtivo(uow, dados)),
    alterar: (ctx, id, versao, mudanca) =>
      banco.executar(ctx, (uow) => alterarModeloDeAtivo(uow, id, versao, mudanca)),
  };
}
