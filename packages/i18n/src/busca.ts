// Texto de busca (ADR-022, ADR-030): sem acento, em minúsculas e com os
// espaços reduzidos. A aplicação grava a coluna `busca` com esta função, e o
// termo digitado passa pela mesma, para "acucar" achar "Açúcar". O banco não
// normaliza nada (sem unaccent e sem função nova, regra 4).

/** Letras que a decomposição Unicode não separa do acento. */
const LETRAS_SEM_DECOMPOSICAO: Record<string, string> = {
  ß: 'ss',
  æ: 'ae',
  œ: 'oe',
  ø: 'o',
  đ: 'd',
  ł: 'l',
};

/** Tamanho mínimo do termo, porque o índice de trigramas precisa de ao menos um trigrama. */
export const TAMANHO_MINIMO_DA_BUSCA = 3;

export function textoDeBusca(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[ßæœøđł]/g, (c) => LETRAS_SEM_DECOMPOSICAO[c] ?? c)
    .replace(/\s+/g, ' ')
    .trim();
}
