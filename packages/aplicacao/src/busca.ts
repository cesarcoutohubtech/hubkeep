// Busca por trecho, sem acento (fase 1a, B6; ADR-030). O texto gravado na
// coluna `busca` e o termo digitado passam pela mesma normalização de
// packages/i18n. Os repositórios de packages/db chamam as funções de gravação
// em todo INSERT e UPDATE que muda os campos pesquisáveis.
import { RegraViolada } from '@hubkeep/dominio';
import { TAMANHO_MINIMO_DA_BUSCA, textoDeBusca } from '@hubkeep/i18n';

/** O que se acha do local: o nome. */
export const buscaDeLocal = (nome: string): string => textoDeBusca(nome);

/** O que se acha do ativo: nome, fabricante, modelo e número de série. */
export const buscaDeAtivo = (d: {
  nome: string;
  fabricante: string | null;
  modelo: string | null;
  numeroSerie: string | null;
}): string =>
  textoDeBusca([d.nome, d.fabricante, d.modelo, d.numeroSerie].filter(Boolean).join(' '));

/**
 * Termo digitado, normalizado; sem termo (ausente ou só espaços), undefined,
 * e a lista vem inteira. Abaixo do mínimo: RegraViolada busca_curta.
 */
export function termoDeBusca(bruto: string | null | undefined): string | undefined {
  const termo = textoDeBusca(bruto ?? '');
  if (termo === '') return undefined;
  if (termo.length < TAMANHO_MINIMO_DA_BUSCA)
    throw new RegraViolada('busca_curta', 'Termo de busca curto demais.', {
      minimo: TAMANHO_MINIMO_DA_BUSCA,
    });
  return termo;
}
