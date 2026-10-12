// Padrões que todo grupo novo recebe, no provisionamento de cliente e no kit
// de teste: categorias, situações e prioridades, códigos de falha, causa e
// solução e a prioridade padrão por categoria. Tudo pelos casos de uso, no
// contexto do primeiro Admin, e idempotente: rodar de novo não duplica nem
// sobrescreve o que o grupo já mudou pela tela.
import type { CategoriaPadrao, Contexto } from '@hubkeep/dominio';
import {
  casosDeUsoDeCategorias,
  casosDeUsoDeCodigos,
  casosDeUsoDeConfiguracao,
  casosDeUsoDeSituacoes,
} from '../../src/servidor/composicao';

/**
 * Prioridade padrão por categoria, gravada como política do grupo (ADR-026),
 * no que se espera de um hotel: parar um elevador ou a segurança é urgente;
 * frio, energia, água e cozinha param a operação ou o quarto; o resto espera.
 */
export const PRIORIDADE_POR_CATEGORIA = {
  elevadores: 'urgente',
  seguranca: 'urgente',
  refrigeracao: 'alta',
  eletrica: 'alta',
  hidraulica: 'alta',
  cozinha: 'alta',
  lavanderia: 'media',
  eletronicos: 'media',
  piscina: 'media',
  mobiliario: 'baixa',
} as const satisfies Record<CategoriaPadrao, string>;

const POLITICA_DE_PRIORIDADE = 'chamado.prioridade_padrao_por_categoria';

/**
 * Instala os padrões do grupo. A política de prioridade só é gravada se o
 * grupo ainda não tem a dele (`sobrescreverPrioridade` falso): o que o Admin
 * mudou pela tela fica.
 */
export async function instalarPadroesDoGrupo(
  ctxAdmin: Contexto,
  opcoes: { sobrescreverPrioridade: boolean },
): Promise<{ categorias: number; prioridades: number; codigos: number }> {
  const categoriasUc = await casosDeUsoDeCategorias();
  await categoriasUc.instalarCategoriasPadrao(ctxAdmin);
  const { categorias } = await categoriasUc.listarCategorias(ctxAdmin);

  const situacoesUc = await casosDeUsoDeSituacoes();
  await situacoesUc.instalarPadrao(ctxAdmin);
  const { prioridades } = await situacoesUc.listarSituacoesEPrioridades(ctxAdmin);

  // Os códigos padrão vêm depois das categorias: a falha de cada categoria padrão entra junto.
  const codigosUc = await casosDeUsoDeCodigos();
  await codigosUc.instalarCodigosPadrao(ctxAdmin);
  const { codigos } = await codigosUc.listarCodigos(ctxAdmin);

  const configuracaoUc = await casosDeUsoDeConfiguracao();
  const jaTem = (await configuracaoUc.lerConfiguracao(ctxAdmin)).politicas.some(
    (p) => p.chave === POLITICA_DE_PRIORIDADE && p.grupo !== null,
  );
  if (opcoes.sobrescreverPrioridade || !jaTem) {
    const idDaPrioridade = (chave: string) => prioridades.find((p) => p.chavePadrao === chave)?.id;
    await configuracaoUc.gravarPolitica(
      ctxAdmin,
      POLITICA_DE_PRIORIDADE,
      { tipo: 'grupo' },
      Object.fromEntries(
        categorias.flatMap((c) => {
          const chave = PRIORIDADE_POR_CATEGORIA[c.chavePadrao as CategoriaPadrao];
          const id = chave ? idDaPrioridade(chave) : undefined;
          return id ? [[c.id, id]] : [];
        }),
      ),
    );
  }
  return {
    categorias: categorias.length,
    prioridades: prioridades.length,
    codigos: codigos.length,
  };
}
