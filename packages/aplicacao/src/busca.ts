// Busca por trecho, sem acento (fase 1a, B6; ADR-030). O texto gravado na
// coluna `busca` e o termo digitado passam pela mesma normalização de
// packages/i18n. O texto gravado é calculado só em packages/db
// (repositorios/busca.ts), a partir dos campos, com a função reexportada aqui.
import { RegraViolada } from '@hubkeep/dominio';
import { TAMANHO_MINIMO_DA_BUSCA, textoDeBusca } from '@hubkeep/i18n';

export { textoDeBusca };

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
