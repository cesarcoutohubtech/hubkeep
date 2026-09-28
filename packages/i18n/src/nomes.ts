// Nome de exibição de um registro configurável do tenant (categoria de ativo,
// situação, prioridade) em quatro idiomas, com a volta do ADR-027:
//   1. o nome do tenant no idioma de quem vê;
//   2. o nome padrão do catálogo (quando o registro é um dos padrão);
//   3. o nome do tenant no idioma padrão do tenant;
//   4. qualquer nome do tenant, na ordem da lista de idiomas.
// Sem nenhum, devolve null (quem exibe decide o que mostrar).
import { IDIOMAS, type Idioma, type IdiomaDeExibicao } from './idiomas';

export type NomesPorIdioma = Partial<Record<Idioma, string>>;

export function resolverNome(
  nomes: NomesPorIdioma,
  idioma: IdiomaDeExibicao,
  opcoes: { doCatalogo?: string | null | undefined; idiomaPadrao: Idioma },
): string | null {
  const doTenant = (i: string) => {
    const v = (nomes as Record<string, string | undefined>)[i]?.trim();
    return v ? v : undefined;
  };
  return (
    doTenant(idioma) ??
    (opcoes.doCatalogo || undefined) ??
    doTenant(opcoes.idiomaPadrao) ??
    IDIOMAS.map(doTenant).find((v) => v !== undefined) ??
    null
  );
}
