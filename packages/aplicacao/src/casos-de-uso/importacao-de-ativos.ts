// Importação de ativos por planilha (fase 1b, M2; decisões 18 e 19 do Cesar,
// de 19/10/2026). A prévia analisa a planilha inteira sem gravar; a gravação
// analisa de novo (o hotel pode ter mudado) e cria só as linhas novas, uma
// unit of work por linha, aprovadas (M4) e com a chave de importação. Quem
// importa é o Implantador e a gestão do hotel (podeImportarAtivos); a regra é
// injetável para o teste provar que a RLS ainda barra.
import {
  type Atribuicao,
  type CategoriaDaImportacao,
  type Contexto,
  ErroDeDominio,
  type ErroDaLinha,
  type LinhaAnalisada,
  NaoEncontrado,
  type ReferenciasDaImportacao,
  type ResultadoDaImportacao,
  type Resultado,
  analisarImportacao,
  exigir,
  lerDefinicoes,
  podeImportarAtivos,
} from '@hubkeep/dominio';
import { CATALOGOS, IDIOMAS } from '@hubkeep/i18n';
import type {
  CategoriaParaImportar,
  PortaImportacaoDeAtivos,
} from '../portas/importacao-de-ativos';
import type { PortaAtribuicoes, Relogio } from '../portas/papeis';

export type SituacaoDaLinhaGravada = 'criada' | 'ja_importada' | 'invalida';

export interface LinhaGravada {
  numero: number;
  situacao: SituacaoDaLinhaGravada;
  nome: string | null;
  erros: ErroDaLinha[];
  /** O ativo criado; só na linha criada. */
  ativoId: string | null;
}

export interface ResultadoDaGravacao {
  linhas: LinhaGravada[];
  criadas: number;
  jaImportadas: number;
  invalidas: number;
}

export interface CasosDeUsoDeImportacaoDeAtivos {
  /** A prévia: todas as linhas, com a situação e os erros, sem gravar. */
  prever(ctx: Contexto, hotelId: string, csv: string): Promise<ResultadoDaImportacao>;
  /** A gravação das linhas novas; as outras voltam como na prévia. */
  importar(ctx: Contexto, hotelId: string, csv: string): Promise<ResultadoDaGravacao>;
}

/** Os nomes que a planilha pode usar para a categoria: os gravados e, na padrão, os do catálogo. */
export function nomesDaCategoria(
  c: Pick<CategoriaParaImportar, 'nomes' | 'chavePadrao'>,
): string[] {
  const gravados =
    typeof c.nomes === 'object' && c.nomes !== null
      ? Object.values(c.nomes).filter((v): v is string => typeof v === 'string')
      : [];
  const doCatalogo =
    c.chavePadrao === null
      ? []
      : IDIOMAS.map(
          (i) =>
            (CATALOGOS[i] as Record<string, string | undefined>)[
              `categoria_ativo.padrao.${c.chavePadrao}`
            ],
        ).filter((v): v is string => v !== undefined);
  return [...new Set([...gravados, ...doCatalogo])];
}

export function criarCasosDeUsoDeImportacaoDeAtivos(deps: {
  importacao: PortaImportacaoDeAtivos;
  atribuicoes: Pick<PortaAtribuicoes, 'doUsuario'>;
  relogio: Relogio;
  /** Padrão: podeImportarAtivos do domínio. Só o teste de aceite troca. */
  podeImportar?: (
    minhas: readonly Atribuicao[],
    hotel: { id: string; bandeiraId: string | null },
    agora: Date,
  ) => Resultado;
}): CasosDeUsoDeImportacaoDeAtivos {
  const podeImportar = deps.podeImportar ?? podeImportarAtivos;
  const analisar = async (ctx: Contexto, hotelId: string, csv: string) => {
    const hotel = await deps.importacao.hotel(ctx, hotelId);
    if (!hotel) throw new NaoEncontrado('hotel_nao_encontrado', 'Hotel não encontrado.');
    exigir(podeImportar(await deps.atribuicoes.doUsuario(ctx), hotel, deps.relogio.agora()));
    const [locais, categorias, modelos, chaves] = await Promise.all([
      deps.importacao.locais(ctx, hotelId),
      deps.importacao.categorias(ctx),
      deps.importacao.modelos(ctx),
      deps.importacao.chaves(ctx, hotelId),
    ]);
    const refs: ReferenciasDaImportacao = {
      locais,
      categorias: categorias.map((c): CategoriaDaImportacao => ({
        id: c.id,
        ativa: c.ativa,
        definicoes: lerDefinicoes(c.campos),
        nomes: nomesDaCategoria(c),
      })),
      modelos,
      chavesExistentes: new Set(chaves),
    };
    return analisarImportacao(csv, refs);
  };
  const semAtivo = (l: LinhaAnalisada, situacao: SituacaoDaLinhaGravada): LinhaGravada => ({
    numero: l.numero,
    situacao,
    nome: l.nome,
    erros: l.erros,
    ativoId: null,
  });
  return {
    prever: analisar,
    async importar(ctx, hotelId, csv) {
      const r = await analisar(ctx, hotelId, csv);
      const linhas: LinhaGravada[] = [];
      for (const l of r.linhas) {
        if (l.situacao !== 'nova' || l.ativo === null) {
          linhas.push(semAtivo(l, l.situacao === 'ja_importada' ? 'ja_importada' : 'invalida'));
          continue;
        }
        try {
          const criado = await deps.importacao.criar(ctx, hotelId, l.ativo);
          linhas.push(
            criado === 'ja_importada'
              ? semAtivo(l, 'ja_importada')
              : { ...semAtivo(l, 'criada'), ativoId: criado.id },
          );
        } catch (e) {
          // A regra que o banco recusou (o local desativado nesse meio-tempo,
          // por exemplo) fica na linha; o resto do arquivo segue.
          if (!(e instanceof ErroDeDominio)) throw e;
          linhas.push({
            ...semAtivo(l, 'invalida'),
            erros: [{ codigo: e.codigo, coluna: null, parametros: e.parametros }],
          });
        }
      }
      return {
        linhas,
        criadas: linhas.filter((l) => l.situacao === 'criada').length,
        jaImportadas: linhas.filter((l) => l.situacao === 'ja_importada').length,
        invalidas: linhas.filter((l) => l.situacao === 'invalida').length,
      };
    },
  };
}
