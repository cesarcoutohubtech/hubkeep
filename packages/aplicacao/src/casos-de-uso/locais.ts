// Locais do hotel (fase 1a, B1): listar UHs e áreas comuns, cadastrar,
// renomear, desativar e reativar área comum. A UH vem do sistema hoteleiro e é
// só leitura; o status dela é da licença. Quem lê o hotel vê os locais (RLS);
// gravar pede papel de gestão no hotel (domínio). A regra é injetável para o
// teste provar que a RLS ainda barra quem não tem escrita no hotel.
import {
  type Atribuicao,
  Conflito,
  type Contexto,
  NaoEncontrado,
  type OrigemDoLocal,
  type Resultado,
  exigir,
  exigirLocalEditavel,
  localEditavel,
  mesmoNomeDeLocal,
  normalizarAndar,
  normalizarNomeDeLocal,
  origemDoLocal,
  podeGerirLocais,
} from '@hubkeep/dominio';
import { termoDeBusca } from '../busca';
import type { LocalDoHotel, PortaLocais } from '../portas/locais';
import type { PortaAtribuicoes, Relogio } from '../portas/papeis';

export interface LocalListado extends LocalDoHotel {
  origem: OrigemDoLocal;
  editavel: boolean;
}

export interface CasosDeUsoDeLocais {
  /** Com `busca`, só os locais que têm o termo no nome, sem acento (B6). */
  listarLocais(ctx: Contexto, hotelId: string, busca?: string | null): Promise<LocalListado[]>;
  criarAreaComum(
    ctx: Contexto,
    hotelId: string,
    nome: string,
    andar: string | null,
  ): Promise<{ id: string }>;
  alterarAreaComum(
    ctx: Contexto,
    localId: string,
    nome: string,
    andar: string | null,
  ): Promise<void>;
  desativarAreaComum(ctx: Contexto, localId: string): Promise<void>;
  reativarAreaComum(ctx: Contexto, localId: string): Promise<void>;
}

export function criarCasosDeUsoDeLocais(deps: {
  locais: PortaLocais;
  atribuicoes: PortaAtribuicoes;
  relogio: Relogio;
  /** Padrão: podeGerirLocais do domínio. Só o teste de aceite troca. */
  podeGerir?: (
    minhas: readonly Atribuicao[],
    hotel: { id: string; bandeiraId: string | null },
    agora: Date,
  ) => Resultado;
}): CasosDeUsoDeLocais {
  const podeGerir = deps.podeGerir ?? podeGerirLocais;
  const hotelVisivel = async (ctx: Contexto, hotelId: string) => {
    const h = await deps.locais.hotel(ctx, hotelId);
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
  const areaComum = async (ctx: Contexto, localId: string) => {
    const l = await deps.locais.local(ctx, localId);
    if (!l) throw new NaoEncontrado('local_nao_encontrado', 'Local não encontrado.');
    await exigirNoHotel(ctx, l.hotelId);
    exigirLocalEditavel(l);
    return l;
  };
  const semNomeRepetido = async (ctx: Contexto, hotelId: string, nome: string, exceto?: string) => {
    const repetido = (await deps.locais.locais(ctx, hotelId)).some(
      (l) =>
        l.id !== exceto &&
        l.tipo === 'area_comum' &&
        l.status !== 'inativo' &&
        mesmoNomeDeLocal(l.nome, nome),
    );
    if (repetido)
      throw new Conflito('local_nome_repetido', 'Já existe área comum com este nome no hotel.');
  };

  return {
    async listarLocais(ctx, hotelId, busca) {
      const termo = termoDeBusca(busca);
      await hotelVisivel(ctx, hotelId);
      const locais = await (termo === undefined
        ? deps.locais.locais(ctx, hotelId)
        : deps.locais.locais(ctx, hotelId, termo));
      return locais.map((l) => ({
        ...l,
        origem: origemDoLocal(l),
        editavel: localEditavel(l),
      }));
    },
    async criarAreaComum(ctx, hotelId, nome, andar) {
      await exigirNoHotel(ctx, hotelId);
      const dados = { nome: normalizarNomeDeLocal(nome), andar: normalizarAndar(andar) };
      await semNomeRepetido(ctx, hotelId, dados.nome);
      return deps.locais.criarAreaComum(ctx, hotelId, dados);
    },
    async alterarAreaComum(ctx, localId, nome, andar) {
      const l = await areaComum(ctx, localId);
      const dados = { nome: normalizarNomeDeLocal(nome), andar: normalizarAndar(andar) };
      await semNomeRepetido(ctx, l.hotelId, dados.nome, l.id);
      await deps.locais.alterar(ctx, localId, dados);
    },
    async desativarAreaComum(ctx, localId) {
      await areaComum(ctx, localId);
      await deps.locais.alterar(ctx, localId, { status: 'inativo' });
    },
    async reativarAreaComum(ctx, localId) {
      const l = await areaComum(ctx, localId);
      await semNomeRepetido(ctx, l.hotelId, l.nome, l.id);
      await deps.locais.alterar(ctx, localId, { status: 'ativo' });
    },
  };
}
