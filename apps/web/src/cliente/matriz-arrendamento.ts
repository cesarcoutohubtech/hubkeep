// Formulário da matriz do arrendado (1c, decisões 5 a 7): lê o FormData da
// tela /admin/arrendamento e monta o valor que o PUT /api/v1/politicas
// recebe. Só apresentação: quem valida é o domínio, pela API.
import type { MatrizDeArrendamento } from '@hubkeep/dominio';

/**
 * A matriz a partir do formulário. O nível gravado substitui o de cima
 * inteiro, e a categoria sem regra fica com a arrendatária: por isso só as
 * do locador entram no valor. As categorias que a tela não mostra (as
 * inativas) continuam como estavam.
 */
export function matrizDoFormulario(
  f: FormData,
  atual: MatrizDeArrendamento,
  categorias: readonly { id: string }[],
): MatrizDeArrendamento {
  const matriz = new Map(Object.entries(atual));
  for (const c of categorias) {
    if (f.get(`categoria.${c.id}`) === 'locador') matriz.set(c.id, 'locador');
    else matriz.delete(c.id);
  }
  return Object.fromEntries(matriz);
}
