// Planos preventivos (fase 1b, PV2; ADR-041): listar os do hotel e os do
// ativo, com a próxima data prevista; cadastrar (pausado, ou já ativo com o
// responsável); alterar; ativar, pausar e encerrar. As regras são do domínio
// (plano-preventivo.ts); a RLS decide por último. A regra de quem gere é
// injetável para o teste provar que a RLS ainda barra. A geração da OS é da
// PV3.
import {
  type AcaoDoPlano,
  type PendenciaDoPlano,
  type Atribuicao,
  type Contexto,
  NaoEncontrado,
  RegraViolada,
  type Resultado,
  type SituacaoDoPlano,
  decidirSituacaoDoPlano,
  diaNoFuso,
  ehTecnicoDoHotel,
  exigir,
  exigirPlanoNaoEncerrado,
  exigirResponsavelParaAtivar,
  normalizarNomeDoPlano,
  pendenciasDoPlano,
  podeGerirPlanos,
  proximaOcorrencia,
  validarAlvoDoPlano,
  validarInicioDoPlano,
  validarPeriodicidade,
  validarResponsavelDoPlano,
} from '@hubkeep/dominio';
import type { PortaAtribuicoes, Relogio } from '../portas/papeis';
import type {
  DadosDoPlano,
  PlanoGravado,
  PortaPlanosPreventivos,
} from '../portas/planos-preventivos';
import type { PortaTriagem } from '../portas/triagem';

export interface PlanoPreventivo extends PlanoGravado {
  /** A próxima data prevista a partir de hoje no fuso do hotel; null no plano encerrado. */
  proximaData: string | null;
  /**
   * O que a tela avisa (PV3c; adendo da PV3 ao ADR-041): o modelo de
   * checklist desativado e o responsável que deixou de valer.
   */
  pendencias: PendenciaDoPlano[];
}

/** Os dados que quem cadastra manda, ainda sem validar. */
export interface PedidoDePlano {
  nome: unknown;
  intervalo: unknown;
  unidade: unknown;
  inicio: unknown;
  checklistModeloId: string | null;
  tecnicoId: string | null;
  equipeId: string | null;
}

export interface PedidoDeNovoPlano extends PedidoDePlano {
  ativoId: string | null;
  categoriaId: string | null;
  /** true: nasce ativo, e precisa do responsável; false: nasce pausado. */
  ativar: boolean;
}

type Hotel = { id: string; bandeiraId: string | null; fuso: string };

export interface CasosDeUsoDePlanosPreventivos {
  /** Os planos do hotel, com a próxima data; o "hoje" é o dia no fuso do hotel. 404 se não vê o hotel. */
  doHotel(ctx: Contexto, hotelId: string): Promise<{ hoje: string; planos: PlanoPreventivo[] }>;
  /** Os planos do ativo (a ficha dele). 404 se não vê o ativo. */
  doAtivo(ctx: Contexto, ativoId: string): Promise<{ hoje: string; planos: PlanoPreventivo[] }>;
  criar(
    ctx: Contexto,
    hotelId: string,
    p: PedidoDeNovoPlano,
  ): Promise<{ id: string; versao: number }>;
  /** O alvo não muda; o plano encerrado também não. O ativo continua precisando do responsável. */
  alterar(ctx: Contexto, id: string, versao: number, p: PedidoDePlano): Promise<{ versao: number }>;
  mudarSituacao(
    ctx: Contexto,
    id: string,
    versao: number,
    acao: AcaoDoPlano,
  ): Promise<{ versao: number; situacao: SituacaoDoPlano }>;
}

export function criarCasosDeUsoDePlanosPreventivos(deps: {
  planos: PortaPlanosPreventivos;
  triagem: Pick<PortaTriagem, 'atribuicoesDe' | 'equipe'>;
  atribuicoes: Pick<PortaAtribuicoes, 'doUsuario'>;
  relogio: Relogio;
  /** Padrão: podeGerirPlanos do domínio. Só o teste de aceite troca. */
  podeGerir?: (
    minhas: readonly Atribuicao[],
    hotel: { id: string; bandeiraId: string | null },
    agora: Date,
  ) => Resultado;
}): CasosDeUsoDePlanosPreventivos {
  const podeGerir = deps.podeGerir ?? podeGerirPlanos;

  const hotelVisivel = async (ctx: Contexto, hotelId: string): Promise<Hotel> => {
    const h = await deps.planos.hotel(ctx, hotelId);
    if (!h) throw new NaoEncontrado('hotel_nao_encontrado', 'Hotel não encontrado.');
    return h;
  };
  const exigirNoHotel = async (ctx: Contexto, hotel: Hotel) =>
    exigir(podeGerir(await deps.atribuicoes.doUsuario(ctx), hotel, deps.relogio.agora()));
  const planoVisivel = async (ctx: Contexto, id: string) => {
    const plano = await deps.planos.plano(ctx, id);
    if (!plano) throw new NaoEncontrado('plano_nao_encontrado', 'Plano não encontrado.');
    const hotel = await hotelVisivel(ctx, plano.hotelId);
    await exigirNoHotel(ctx, hotel);
    return { plano, hotel };
  };
  /** Os planos com a próxima data e as pendências, conferidas no hotel de cada um. */
  const paraTela = async (
    ctx: Contexto,
    hotel: Hotel,
    hoje: string,
    planos: PlanoGravado[],
  ): Promise<PlanoPreventivo[]> => {
    const conferencia = await deps.planos.conferencia(ctx, planos);
    const agora = deps.relogio.agora();
    return planos.map((p) => ({
      ...p,
      proximaData: p.situacao === 'encerrado' ? null : proximaOcorrencia(p, hoje),
      pendencias: pendenciasDoPlano(
        {
          situacao: p.situacao,
          responsavel: conferencia.get(p.id)?.responsavel ?? null,
          modeloAtivo: conferencia.get(p.id)?.modeloAtivo ?? null,
        },
        hotel,
        agora,
      ),
    }));
  };
  const hojeNo = (hotel: Hotel) => diaNoFuso(deps.relogio.agora(), hotel.fuso);

  /** Os dados validados, com o checklist e o responsável conferidos no hotel. */
  const dados = async (ctx: Contexto, hotel: Hotel, p: PedidoDePlano): Promise<DadosDoPlano> => {
    const periodicidade = validarPeriodicidade(p);
    const responsavel = { tecnicoId: p.tecnicoId, equipeId: p.equipeId };
    validarResponsavelDoPlano(responsavel);
    if (p.checklistModeloId !== null) {
      const m = await deps.planos.modeloDeChecklist(ctx, p.checklistModeloId);
      if (!m?.ativa) {
        throw new RegraViolada('plano_checklist_invalido', 'Checklist indisponível para o plano.');
      }
    }
    if (p.tecnicoId !== null) {
      const atribuicoes = await deps.triagem.atribuicoesDe(ctx, p.tecnicoId);
      if (!ehTecnicoDoHotel(atribuicoes, p.tecnicoId, hotel, deps.relogio.agora())) {
        throw new RegraViolada('plano_tecnico_invalido', 'O técnico não atende este hotel.');
      }
    }
    if (p.equipeId !== null) {
      const e = await deps.triagem.equipe(ctx, p.equipeId);
      if (!e || e.hotelId !== hotel.id || !e.ativa) {
        throw new RegraViolada('plano_equipe_invalida', 'A equipe não está ativa neste hotel.');
      }
    }
    return {
      nome: normalizarNomeDoPlano(p.nome),
      ...periodicidade,
      inicio: validarInicioDoPlano(p.inicio),
      checklistModeloId: p.checklistModeloId,
      ...responsavel,
    };
  };

  return {
    async doHotel(ctx, hotelId) {
      const hotel = await hotelVisivel(ctx, hotelId);
      const hoje = hojeNo(hotel);
      const planos = await deps.planos.doHotel(ctx, hotelId);
      return { hoje, planos: await paraTela(ctx, hotel, hoje, planos) };
    },

    async doAtivo(ctx, ativoId) {
      const ativo = await deps.planos.ativo(ctx, ativoId);
      if (!ativo) throw new NaoEncontrado('ativo_nao_encontrado', 'Ativo não encontrado.');
      const hotel = await hotelVisivel(ctx, ativo.hotelId);
      const hoje = hojeNo(hotel);
      const planos = await deps.planos.doAtivo(ctx, ativoId);
      return { hoje, planos: await paraTela(ctx, hotel, hoje, planos) };
    },

    async criar(ctx, hotelId, p) {
      const hotel = await hotelVisivel(ctx, hotelId);
      await exigirNoHotel(ctx, hotel);
      validarAlvoDoPlano(p);
      if (p.ativoId !== null) {
        const a = await deps.planos.ativo(ctx, p.ativoId);
        if (!a || a.hotelId !== hotel.id || !a.ativo) {
          throw new RegraViolada('plano_ativo_invalido', 'O ativo não está ativo neste hotel.');
        }
      }
      if (p.categoriaId !== null && !(await deps.planos.categoriaExiste(ctx, p.categoriaId))) {
        throw new RegraViolada('plano_categoria_invalida', 'Categoria não encontrada ou inativa.');
      }
      const d = await dados(ctx, hotel, p);
      if (p.ativar) exigirResponsavelParaAtivar(d);
      return deps.planos.criar(ctx, {
        ...d,
        hotelId,
        ativoId: p.ativoId,
        categoriaId: p.categoriaId,
        situacao: p.ativar ? 'ativo' : 'pausado',
      });
    },

    async alterar(ctx, id, versao, p) {
      const { plano, hotel } = await planoVisivel(ctx, id);
      exigirPlanoNaoEncerrado(plano.situacao);
      const d = await dados(ctx, hotel, p);
      if (plano.situacao === 'ativo') exigirResponsavelParaAtivar(d);
      return deps.planos.alterar(ctx, id, versao, d);
    },

    async mudarSituacao(ctx, id, versao, acao) {
      const { plano } = await planoVisivel(ctx, id);
      const situacao = decidirSituacaoDoPlano(plano.situacao, acao, plano);
      const r = await deps.planos.alterar(ctx, id, versao, { situacao });
      return { versao: r.versao, situacao };
    },
  };
}
