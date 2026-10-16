// "Procurar ativo" no HubKeep Intelligence (Cesar e Kaio, 16/10/2026, opção a):
// a página do ativo só abria pelo insight ou pela intervenção, e o ativo com
// sinal de substituição e sem insight ficava sem caminho. A busca acha os
// ativos em uso pelo trecho do nome, fabricante, modelo ou número de série (a
// coluna `busca` do núcleo), só dos hotéis em que a pessoa decide insight,
// como a página do ativo. Não calcula nada: só leva à página.
import { podeDecidirInsight } from './insight';
import { type NomesDoPainel, type PortasDoPainel, exigirPainel, unicos } from './painel';

/** O máximo de ativos na resposta. */
export const LIMITE_DA_BUSCA_DE_ATIVOS = 20;

/** Quantos a leitura traz antes do recorte de quem decide, para o recorte não esvaziar a lista. */
export const LEITURA_DA_BUSCA_DE_ATIVOS = 100;

export interface AtivoEncontrado {
  id: string;
  nome: string;
  hotelId: string;
  bandeiraId: string | null;
}

/** O que a busca lê, além das portas do painel, no contexto de quem pede. */
export interface PortasDaBuscaDeAtivos extends PortasDoPainel {
  /**
   * Os ativos sem baixa cujo texto de busca contém o termo (já normalizado),
   * em ordem de nome, até `limite`; a RLS recorta o que quem pede lê.
   */
  ativosPorBusca(termo: string, limite: number): Promise<readonly AtivoEncontrado[]>;
}

export interface AtivosEncontrados {
  ativos: AtivoEncontrado[];
  nomes: NomesDoPainel;
}

/**
 * Os ativos do termo, nos hotéis em que a pessoa decide insight. Sem termo
 * (undefined), a lista vem vazia, sem ler: a busca não lista todos os ativos.
 */
export async function procurarAtivos(
  p: PortasDaBuscaDeAtivos,
  termo: string | undefined,
  agora: Date,
): Promise<AtivosEncontrados> {
  const atribuicoes = await exigirPainel(p, agora);
  const vazio: NomesDoPainel = { hoteis: {}, bandeiras: {}, pessoas: {}, ativos: {} };
  if (termo === undefined) return { ativos: [], nomes: vazio };
  const lidos = await p.ativosPorBusca(termo, LEITURA_DA_BUSCA_DE_ATIVOS);
  const ativos = lidos
    .filter((a) =>
      podeDecidirInsight(
        atribuicoes,
        { tipo: 'hotel', hotelId: a.hotelId, bandeiraId: a.bandeiraId },
        agora,
      ),
    )
    .slice(0, LIMITE_DA_BUSCA_DE_ATIVOS);
  if (!ativos.length) return { ativos: [], nomes: vazio };
  const nomes = await p.nomes({
    hotelIds: unicos(ativos.map((a) => a.hotelId)),
    bandeiraIds: [],
    usuarioIds: [],
    ativoIds: [],
  });
  return { ativos, nomes };
}
