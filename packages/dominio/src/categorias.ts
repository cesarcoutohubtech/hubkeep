// Categorias de ativo (fase 1a, B2; ADR-028). A categoria é do tenant e define
// os campos estendidos dos ativos dela (campos-tipados.ts). As categorias
// padrão têm chave e nome no catálogo (packages/i18n); o tenant pode dar nome
// próprio em qualquer idioma, que vale antes do catálogo (ADR-027).
import { normalizarRotulos, type Rotulos } from './campos-tipados';
import { PermissaoNegada, RegraViolada } from './erros';
import { type Resultado, ehAdminGrupo } from './permissoes';
import type { Atribuicao } from './tipos';

/** Chaves das categorias padrão; o nome de cada uma está no catálogo (categoria_ativo.padrao.<chave>). */
export const CATEGORIAS_PADRAO = [
  'refrigeracao',
  'eletrica',
  'hidraulica',
  'elevadores',
  'cozinha',
  'lavanderia',
  'mobiliario',
  'eletronicos',
  'piscina',
  'seguranca',
] as const;
export type CategoriaPadrao = (typeof CATEGORIAS_PADRAO)[number];

export const ehCategoriaPadrao = (c: unknown): c is CategoriaPadrao =>
  typeof c === 'string' && (CATEGORIAS_PADRAO as readonly string[]).includes(c);

/** Categorias são do tenant: só o Admin do grupo cria e altera. */
export function podeGerirCategorias(minhas: readonly Atribuicao[], agora: Date): Resultado {
  return ehAdminGrupo(minhas, agora)
    ? { permitido: true }
    : {
        permitido: false,
        erro: new PermissaoNegada(
          'categorias_so_admin',
          'Só o Admin do grupo gere categorias de ativo.',
        ),
      };
}

/**
 * Nomes da categoria por idioma. A categoria do tenant precisa de ao menos um
 * nome; a padrão pode ficar sem nenhum (o nome vem do catálogo).
 */
export function validarNomesDeCategoria(nomes: unknown, chavePadrao: string | null): Rotulos {
  const r = normalizarRotulos(nomes, chavePadrao !== null);
  if (!r) {
    throw new RegraViolada('categoria_nome_invalido', 'Nome de categoria inválido.', {
      maximo: 120,
    });
  }
  return r;
}
