// Ativos do hotel (fase 1a, B3; ADR-028 e ADR-029): listar, cadastrar,
// alterar, desativar e reativar. Quem lê o hotel vê os ativos (RLS); gravar
// pede papel de gestão de ativos no hotel (domínio), o técnico inclusive.
// Os campos estendidos são validados contra a categoria; a alteração leva a
// versão que o usuário viu. O cadastro e a alteração pelo celular chegam pela
// fila offline (ADR-025) e usam os mesmos preparar*, antes da unit of work da
// operação. Mover o ativo de local (B3c) é ação própria, só de quem gere o
// hotel, dentro do mesmo hotel, e não vai pela fila offline (o técnico não
// move). Abrir pelo código do QR (B5) passa pela mesma leitura: código de
// outro tenant, fora do escopo ou mal formado dá 404, sem distinguir os casos.
// Compra, garantia e criticidade (fase 1b, I1): opcionais; na alteração, o
// campo ausente do pedido mantém o valor gravado (a operação guardada no
// aparelho antes da I1 não os traz), e null apaga.
// As regras são injetáveis para o teste provar que o banco ainda barra.
import {
  type Atribuicao,
  type CategoriaParaAtivo,
  type Contexto,
  NaoEncontrado,
  type NomesDeCriticidade,
  type Resultado,
  type ValorDeCampo,
  exigir,
  exigirLocalParaAtivo,
  lerCodigoQr,
  lerDefinicoes,
  lerValores,
  normalizarNomeDeAtivo,
  normalizarTextoDoAtivo,
  podeGerirAtivos,
  podeMoverAtivo,
  resolverPolitica,
  validarCamposDoAtivo,
  validarCriticidade,
  validarDatasDoAtivo,
  validarModeloDoAtivo,
  validarMovimentacao,
} from '@hubkeep/dominio';
import { termoDeBusca } from '../busca';
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
  /** aaaa-mm-dd; ausente mantém o gravado (alteração) ou fica nulo (cadastro). */
  dataCompra?: string | null | undefined;
  garantiaAte?: string | null | undefined;
  /** De 1 a 5; ausente como nas datas. */
  criticidade?: number | null | undefined;
  /** O modelo escolhido (M1); ausente como nas datas. */
  modeloId?: string | null | undefined;
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
  /** Com `busca`, só os ativos que têm o termo no nome, fabricante, modelo ou série (B6). */
  listarAtivos(ctx: Contexto, hotelId: string, busca?: string | null): Promise<AtivoListado[]>;
  /** A política ativo.criticidade resolvida para o hotel (I1): hotel → grupo → padrão. */
  nomesDeCriticidade(ctx: Contexto, hotelId: string): Promise<NomesDeCriticidade>;
  /** O ativo do QR (B5), aceitando o código como uma pessoa digitaria. */
  abrirPorCodigoQr(ctx: Contexto, codigo: string): Promise<AtivoListado>;
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
  const comCampos = (a: AtivoGravado, categorias: readonly CategoriaParaAtivo[]): AtivoListado => ({
    ...a,
    campos: lerValores(categorias.find((c) => c.id === a.categoriaId)?.definicoes ?? [], a.campos),
  });
  const dadosDe = async (
    ctx: Contexto,
    p: PedidoDeGravacaoDeAtivo,
    anterior: AtivoGravado | null,
  ): Promise<DadosDeAtivo> => {
    const categoriaAnterior = anterior?.categoriaId ?? null;
    const nome = normalizarNomeDeAtivo(p.nome);
    const datas = validarDatasDoAtivo({
      dataCompra: p.dataCompra === undefined ? (anterior?.dataCompra ?? null) : p.dataCompra,
      garantiaAte: p.garantiaAte === undefined ? (anterior?.garantiaAte ?? null) : p.garantiaAte,
    });
    const criticidade = validarCriticidade(
      p.criticidade === undefined ? (anterior?.criticidade ?? null) : p.criticidade,
    );
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
    const modeloId = p.modeloId === undefined ? (anterior?.modeloId ?? null) : p.modeloId;
    if (modeloId !== null) {
      const modelo = await deps.ativos.modelo(ctx, modeloId);
      if (!modelo) {
        throw new NaoEncontrado('modelo_ativo_nao_encontrado', 'Modelo de ativo não encontrado.');
      }
      // O modelo que o ativo já tinha continua valendo desativado, como a
      // categoria; a categoria tem de ser a do modelo, sempre.
      validarModeloDoAtivo(
        modeloId === anterior?.modeloId ? { ...modelo, ativa: true } : modelo,
        p.categoriaId,
      );
    }
    return {
      categoriaId: p.categoriaId,
      modeloId,
      nome,
      fabricante,
      modelo,
      numeroSerie,
      ...datas,
      criticidade,
      campos,
    };
  };

  const casos: CasosDeUsoDeAtivos = {
    async listarAtivos(ctx, hotelId, busca) {
      const termo = termoDeBusca(busca);
      await hotelVisivel(ctx, hotelId);
      const categorias = await categoriasDoTenant(ctx);
      const ativos = await (termo === undefined
        ? deps.ativos.ativos(ctx, hotelId)
        : deps.ativos.ativos(ctx, hotelId, termo));
      return ativos.map((a) => comCampos(a, categorias));
    },
    async nomesDeCriticidade(ctx, hotelId) {
      await hotelVisivel(ctx, hotelId);
      const chave = 'ativo.criticidade';
      return resolverPolitica(chave, await deps.ativos.politica(ctx, hotelId, chave));
    },
    async abrirPorCodigoQr(ctx, codigo) {
      const lido = lerCodigoQr(codigo);
      const a = lido === null ? null : await deps.ativos.ativoPorCodigoQr(ctx, lido);
      if (!a) throw new NaoEncontrado('ativo_nao_encontrado', 'Ativo não encontrado.');
      return comCampos(a, await categoriasDoTenant(ctx));
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
      return { ativoId, versaoEsperada: p.versao, dados: await dadosDe(ctx, p, a) };
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
