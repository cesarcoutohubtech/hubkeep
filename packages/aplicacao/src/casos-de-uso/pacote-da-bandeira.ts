// Pacote da bandeira (fase 1b, PB1): os planos do pacote, que só o Admin do
// grupo mantém, e aplicar o pacote ao hotel, que o Admin e o Implantador
// vigente fazem pelo painel de implantação. A prévia diz o que aplicar
// copiaria; aplicar copia cada plano numa unit of work, pausado e sem
// responsável, e reaplicar só acrescenta o que falta. As regras de quem são
// injetáveis para o teste provar que a RLS ainda barra.
import {
  type Atribuicao,
  type Contexto,
  type CopiaDoPlanoPadrao,
  NaoEncontrado,
  RegraViolada,
  type Resultado,
  copiasDoPacote,
  diaNoFuso,
  exigir,
  podeAplicarPacote,
  podeGerirPacote,
  validarPlanoPadrao,
} from '@hubkeep/dominio';
import type {
  DadosDoPlanoPadrao,
  PlanoPadraoGravado,
  PortaPacoteDaBandeira,
} from '../portas/pacote-da-bandeira';
import type { PortaAtribuicoes, Relogio } from '../portas/papeis';

export interface PedidoDePlanoPadrao {
  categoriaId: string;
  nome: string;
  intervalo: number;
  unidade: string;
  checklistModeloId: string | null;
}

export interface PedidoDeNovoPlanoPadrao extends PedidoDePlanoPadrao {
  /** Nulo: o grupo inteiro. Não muda depois (campo de escopo, ADR-011). */
  bandeiraId: string | null;
}

export interface ResultadoDaAplicacao {
  /** Os planos copiados agora, com o id do plano do hotel. */
  copiados: (CopiaDoPlanoPadrao & { planoId: string })[];
  /** Quantos outro envio copiou nesse meio-tempo (os de antes nem entram na lista). */
  jaCopiados: number;
}

export interface CasosDeUsoDoPacoteDaBandeira {
  planos(ctx: Contexto): Promise<PlanoPadraoGravado[]>;
  criar(ctx: Contexto, p: PedidoDeNovoPlanoPadrao): Promise<{ id: string }>;
  alterar(
    ctx: Contexto,
    id: string,
    p: PedidoDePlanoPadrao & { versao: number },
  ): Promise<{ versao: number }>;
  desativar(ctx: Contexto, id: string, versao: number): Promise<{ versao: number }>;
  reativar(ctx: Contexto, id: string, versao: number): Promise<{ versao: number }>;
  /** O que aplicar o pacote copiaria agora para o hotel. */
  previa(ctx: Contexto, hotelId: string): Promise<CopiaDoPlanoPadrao[]>;
  aplicar(ctx: Contexto, hotelId: string): Promise<ResultadoDaAplicacao>;
}

export function criarCasosDeUsoDoPacoteDaBandeira(deps: {
  pacote: PortaPacoteDaBandeira;
  atribuicoes: Pick<PortaAtribuicoes, 'doUsuario'>;
  relogio: Relogio;
  /** Padrão: podeGerirPacote do domínio. Só o teste de aceite troca. */
  podeGerir?: (minhas: readonly Atribuicao[], agora: Date) => Resultado;
  /** Padrão: podeAplicarPacote do domínio. Só o teste de aceite troca. */
  podeAplicar?: (
    minhas: readonly Atribuicao[],
    hotel: { id: string; bandeiraId: string | null },
    agora: Date,
  ) => Resultado;
}): CasosDeUsoDoPacoteDaBandeira {
  const podeGerir = deps.podeGerir ?? podeGerirPacote;
  const podeAplicar = deps.podeAplicar ?? podeAplicarPacote;
  const exigirAdmin = async (ctx: Contexto) =>
    exigir(podeGerir(await deps.atribuicoes.doUsuario(ctx), deps.relogio.agora()));
  const planoVisivel = async (ctx: Contexto, id: string) => {
    const p = await deps.pacote.plano(ctx, id);
    if (!p)
      throw new NaoEncontrado('plano_padrao_nao_encontrado', 'Plano do pacote não encontrado.');
    return p;
  };
  /** Os dados validados: a categoria ativa e o checklist que cabe no plano. */
  const dados = async (
    ctx: Contexto,
    p: PedidoDePlanoPadrao,
    bandeiraId: string | null,
    categoriaAnterior: string | null,
  ): Promise<DadosDoPlanoPadrao> => {
    const categoria = await deps.pacote.categoria(ctx, p.categoriaId);
    if (!categoria)
      throw new NaoEncontrado('categoria_nao_encontrada', 'Categoria não encontrada.');
    // Como no ativo: a categoria desativada não entra em plano novo nem em troca.
    if (!categoria.ativa && categoria.id !== categoriaAnterior) {
      throw new RegraViolada('ativo_categoria_inativa', 'A categoria está desativada.');
    }
    const checklist =
      p.checklistModeloId === null ? null : await deps.pacote.checklist(ctx, p.checklistModeloId);
    if (p.checklistModeloId !== null && !checklist) {
      throw new RegraViolada('plano_checklist_invalido', 'Checklist indisponível para o plano.');
    }
    const v = validarPlanoPadrao({ ...p, bandeiraId }, checklist);
    return { categoriaId: p.categoriaId, checklistModeloId: p.checklistModeloId, ...v };
  };
  const hotelParaAplicar = async (ctx: Contexto, hotelId: string) => {
    const hotel = await deps.pacote.hotel(ctx, hotelId);
    if (!hotel) throw new NaoEncontrado('hotel_nao_encontrado', 'Hotel não encontrado.');
    exigir(podeAplicar(await deps.atribuicoes.doUsuario(ctx), hotel, deps.relogio.agora()));
    return hotel;
  };
  const copiasPara = async (ctx: Contexto, hotelId: string) => {
    const hotel = await hotelParaAplicar(ctx, hotelId);
    const [padroes, copiados] = await Promise.all([
      deps.pacote.planos(ctx),
      deps.pacote.copiados(ctx, hotelId),
    ]);
    return copiasDoPacote(
      padroes,
      hotel,
      new Set(copiados),
      diaNoFuso(deps.relogio.agora(), hotel.fuso),
    );
  };

  return {
    planos: (ctx) => deps.pacote.planos(ctx),
    async criar(ctx, p) {
      await exigirAdmin(ctx);
      if (p.bandeiraId !== null && !(await deps.pacote.bandeira(ctx, p.bandeiraId))) {
        throw new NaoEncontrado('bandeira_nao_encontrada', 'Bandeira não encontrada.');
      }
      return deps.pacote.criar(ctx, {
        bandeiraId: p.bandeiraId,
        ...(await dados(ctx, p, p.bandeiraId, null)),
      });
    },
    async alterar(ctx, id, p) {
      await exigirAdmin(ctx);
      const atual = await planoVisivel(ctx, id);
      return deps.pacote.alterar(
        ctx,
        id,
        p.versao,
        await dados(ctx, p, atual.bandeiraId, atual.categoriaId),
      );
    },
    async desativar(ctx, id, versao) {
      await exigirAdmin(ctx);
      await planoVisivel(ctx, id);
      return deps.pacote.alterar(ctx, id, versao, { ativa: false });
    },
    async reativar(ctx, id, versao) {
      await exigirAdmin(ctx);
      await planoVisivel(ctx, id);
      return deps.pacote.alterar(ctx, id, versao, { ativa: true });
    },
    previa: copiasPara,
    async aplicar(ctx, hotelId) {
      const copias = await copiasPara(ctx, hotelId);
      const r: ResultadoDaAplicacao = { copiados: [], jaCopiados: 0 };
      for (const c of copias) {
        const gravado = await deps.pacote.copiar(ctx, hotelId, c);
        if (gravado === 'ja_copiado') r.jaCopiados++;
        else r.copiados.push({ ...c, planoId: gravado.id });
      }
      return r;
    },
  };
}
