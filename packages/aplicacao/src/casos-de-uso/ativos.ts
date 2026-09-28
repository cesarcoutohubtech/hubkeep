// Ativos do hotel (fase 1a, B3; ADR-028 e ADR-029): listar, cadastrar,
// alterar, desativar e reativar. Quem lê o hotel vê os ativos (RLS); gravar
// pede papel de gestão de ativos no hotel (domínio), o técnico inclusive.
// Os campos estendidos são validados contra a categoria; a alteração leva a
// versão que o usuário viu. O cadastro e a alteração pelo celular chegam pela
// fila offline (ADR-025) e usam os mesmos preparar*, antes da unit of work da
// operação. Mover o ativo de local (B3c) é ação própria, só de quem gere o
// hotel, dentro do mesmo hotel, e não vai pela fila offline (o técnico não
// move). As regras são injetáveis para o teste provar que o banco ainda barra.
import {
  type Atribuicao,
  type CategoriaParaAtivo,
  type Contexto,
  NaoEncontrado,
  type Resultado,
  type ValorDeCampo,
  exigir,
  exigirLocalParaAtivo,
  lerDefinicoes,
  lerValores,
  normalizarNomeDeAtivo,
  normalizarTextoDoAtivo,
  podeGerirAtivos,
  podeMoverAtivo,
  validarCamposDoAtivo,
  validarMovimentacao,
} from '@hubkeep/dominio';
import type {
  AtivoGravado,
  DadosDeAtivo,
  MovimentacaoDeAtivo,
  PortaAtivos,
} from '../portas/ativos';
import type { PortaAtribuicoes, Relogio } from '../portas/papeis';

export interface PedidoDeGravacaoDeAtivo {
  categoriaId: string | null;
  nome: string;
  fabricante: string | null;
  modelo: string | null;
  numeroSerie: string | null;
  campos?: unknown;
}

export interface PedidoDeCadastroDeAtivo extends PedidoDeGravacaoDeAtivo {
  localId: string;
}

export interface PedidoDeAlteracaoDeAtivo extends PedidoDeGravacaoDeAtivo {
  /** A versão que o usuário viu (ADR-029). */
  versao: number;
}

export interface PedidoDeMovimentacaoDeAtivo {
  localDestinoId: string;
  /** A versão que o usuário viu (ADR-029). */
  versao: number;
}

export interface AtivoListado extends Omit<AtivoGravado, 'campos'> {
  /** Lidos com a definição atual da categoria: o que ela não aceita fica de fora. */
  campos: Record<string, ValorDeCampo>;
}

export interface CadastroPreparado {
  hotelId: string;
  localId: string;
  dados: DadosDeAtivo;
}

export interface AlteracaoPreparada {
  ativoId: string;
  versaoEsperada: number;
  dados: DadosDeAtivo;
}

export interface CasosDeUsoDeAtivos {
  listarAtivos(ctx: Contexto, hotelId: string): Promise<AtivoListado[]>;
  prepararCadastro(ctx: Contexto, p: PedidoDeCadastroDeAtivo): Promise<CadastroPreparado>;
  cadastrar(ctx: Contexto, p: PedidoDeCadastroDeAtivo): Promise<{ id: string; versao: number }>;
  prepararAlteracao(
    ctx: Contexto,
    ativoId: string,
    p: PedidoDeAlteracaoDeAtivo,
  ): Promise<AlteracaoPreparada>;
  alterar(ctx: Contexto, ativoId: string, p: PedidoDeAlteracaoDeAtivo): Promise<{ versao: number }>;
  desativar(ctx: Contexto, ativoId: string, versao: number): Promise<{ versao: number }>;
  reativar(ctx: Contexto, ativoId: string, versao: number): Promise<{ versao: number }>;
  mover(
    ctx: Contexto,
    ativoId: string,
    p: PedidoDeMovimentacaoDeAtivo,
  ): Promise<{ versao: number }>;
  listarMovimentacoes(ctx: Contexto, ativoId: string): Promise<MovimentacaoDeAtivo[]>;
}

export function criarCasosDeUsoDeAtivos(deps: {
  ativos: PortaAtivos;
  atribuicoes: PortaAtribuicoes;
  relogio: Relogio;
  /** Padrão: podeGerirAtivos do domínio. Só o teste de aceite troca. */
  podeGerir?: (
    minhas: readonly Atribuicao[],
    hotel: { id: string; bandeiraId: string | null },
    agora: Date,
  ) => Resultado;
  /** Padrão: podeMoverAtivo do domínio. Só o teste de aceite troca. */
  podeMover?: (
    minhas: readonly Atribuicao[],
    hotel: { id: string; bandeiraId: string | null },
    agora: Date,
  ) => Resultado;
  /** Padrão: validarMovimentacao do domínio. Só o teste de aceite troca. */
  validarMover?: typeof validarMovimentacao;
}): CasosDeUsoDeAtivos {
  const podeGerir = deps.podeGerir ?? podeGerirAtivos;
  const podeMover = deps.podeMover ?? podeMoverAtivo;
  const validarMover = deps.validarMover ?? validarMovimentacao;
  const hotelVisivel = async (ctx: Contexto, hotelId: string) => {
    const h = await deps.ativos.hotel(ctx, hotelId);
    if (!h) throw new NaoEncontrado('hotel_nao_encontrado', 'Hotel não encontrado.');
    return h;
  };
  const exigirNoHotel = async (ctx: Contexto, hotelId: string) =>
    exigir(
      podeGerir(
        await deps.atribuicoes.doUsuario(ctx),
        await hotelVisivel(ctx, hotelId),
        deps.relogio.agora(),
      ),
    );
  const ativoVisivel = async (ctx: Contexto, ativoId: string) => {
    const a = await deps.ativos.ativo(ctx, ativoId);
    if (!a) throw new NaoEncontrado('ativo_nao_encontrado', 'Ativo não encontrado.');
    return a;
  };
  const categoriasDoTenant = async (ctx: Contexto): Promise<CategoriaParaAtivo[]> =>
    (await deps.ativos.categorias(ctx)).map((c) => ({
      id: c.id,
      ativa: c.ativa,
      definicoes: lerDefinicoes(c.campos),
    }));
  const dadosDe = async (
    ctx: Contexto,
    p: PedidoDeGravacaoDeAtivo,
    categoriaAnterior: string | null,
  ): Promise<DadosDeAtivo> => {
    const nome = normalizarNomeDeAtivo(p.nome);
    const fabricante = normalizarTextoDoAtivo('fabricante', p.fabricante);
    const modelo = normalizarTextoDoAtivo('modelo', p.modelo);
    const numeroSerie = normalizarTextoDoAtivo('numero_serie', p.numeroSerie);
    let categoria: CategoriaParaAtivo | null = null;
    if (p.categoriaId !== null) {
      categoria = (await categoriasDoTenant(ctx)).find((c) => c.id === p.categoriaId) ?? null;
      if (!categoria)
        throw new NaoEncontrado('categoria_nao_encontrada', 'Categoria não encontrada.');
    }
    const campos = validarCamposDoAtivo(categoria, categoriaAnterior, p.campos);
    return { categoriaId: p.categoriaId, nome, fabricante, modelo, numeroSerie, campos };
  };

  const casos: CasosDeUsoDeAtivos = {
    async listarAtivos(ctx, hotelId) {
      await hotelVisivel(ctx, hotelId);
      const categorias = await categoriasDoTenant(ctx);
      return (await deps.ativos.ativos(ctx, hotelId)).map((a) => ({
        ...a,
        campos: lerValores(
          categorias.find((c) => c.id === a.categoriaId)?.definicoes ?? [],
          a.campos,
        ),
      }));
    },
    async prepararCadastro(ctx, p) {
      const local = await deps.ativos.local(ctx, p.localId);
      if (!local) throw new NaoEncontrado('local_nao_encontrado', 'Local não encontrado.');
      await exigirNoHotel(ctx, local.hotelId);
      exigirLocalParaAtivo(local);
      return { hotelId: local.hotelId, localId: local.id, dados: await dadosDe(ctx, p, null) };
    },
    async cadastrar(ctx, p) {
      const c = await casos.prepararCadastro(ctx, p);
      return deps.ativos.criar(ctx, c.hotelId, c.localId, c.dados);
    },
    async prepararAlteracao(ctx, ativoId, p) {
      const a = await ativoVisivel(ctx, ativoId);
      await exigirNoHotel(ctx, a.hotelId);
      return { ativoId, versaoEsperada: p.versao, dados: await dadosDe(ctx, p, a.categoriaId) };
    },
    async alterar(ctx, ativoId, p) {
      const c = await casos.prepararAlteracao(ctx, ativoId, p);
      return deps.ativos.alterar(ctx, c.ativoId, c.versaoEsperada, c.dados);
    },
    async desativar(ctx, ativoId, versao) {
      const a = await ativoVisivel(ctx, ativoId);
      await exigirNoHotel(ctx, a.hotelId);
      return deps.ativos.alterar(ctx, ativoId, versao, { desativado: true });
    },
    async reativar(ctx, ativoId, versao) {
      const a = await ativoVisivel(ctx, ativoId);
      await exigirNoHotel(ctx, a.hotelId);
      return deps.ativos.alterar(ctx, ativoId, versao, { desativado: false });
    },
    async mover(ctx, ativoId, p) {
      const a = await ativoVisivel(ctx, ativoId);
      exigir(
        podeMover(
          await deps.atribuicoes.doUsuario(ctx),
          await hotelVisivel(ctx, a.hotelId),
          deps.relogio.agora(),
        ),
      );
      const destino = await deps.ativos.local(ctx, p.localDestinoId);
      if (!destino) throw new NaoEncontrado('local_nao_encontrado', 'Local não encontrado.');
      validarMover(
        { hotelId: a.hotelId, localId: a.localId, desativado: a.desativadoEm !== null },
        destino,
      );
      return deps.ativos.mover(ctx, ativoId, p.versao, destino.id);
    },
    async listarMovimentacoes(ctx, ativoId) {
      await ativoVisivel(ctx, ativoId);
      return deps.ativos.movimentacoes(ctx, ativoId);
    },
  };
  return casos;
}
