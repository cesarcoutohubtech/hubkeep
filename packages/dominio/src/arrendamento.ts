// Arrendado mínimo (1c; decisões 5 a 8 do Cesar, de 13/10/2026): a matriz de
// responsabilidade do hotel arrendado diz, por categoria do chamado, quem
// responde pelo custo da OS, a arrendatária (quem opera) ou o locador (o
// proprietário do hotel inteiro, ADR-031; sem papel novo).
//
//   - a matriz é a política hotel.matriz_arrendamento, com herança só grupo →
//     hotel (decisão 5): a bandeira não entra;
//   - vale só no hotel com modelo contratual "arrendado" (I2); nos outros, a
//     OS não tem responsável de arrendamento;
//   - a regra usa a categoria do próprio chamado (ADR-042), e não a do ativo
//     (decisão 7, com o ajuste do Cesar). A categoria sem regra, e o chamado
//     sem categoria, ficam com a arrendatária.
import type { ModeloContratual } from './hoteis';

export const RESPONSAVEIS_DO_ARRENDAMENTO = ['arrendataria', 'locador'] as const;
export type ResponsavelDoArrendamento = (typeof RESPONSAVEIS_DO_ARRENDAMENTO)[number];

/** Categoria de ativo (id) → quem responde por ela no hotel arrendado. */
export type MatrizDeArrendamento = Record<string, ResponsavelDoArrendamento>;

/** No máximo uma regra por categoria; o limite é o das exceções do SLA. */
export const LIMITE_DA_MATRIZ = 200;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const ehResponsavelDoArrendamento = (v: unknown): v is ResponsavelDoArrendamento =>
  typeof v === 'string' && (RESPONSAVEIS_DO_ARRENDAMENTO as readonly string[]).includes(v);

export function matrizDeArrendamentoValida(v: unknown): v is MatrizDeArrendamento {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false;
  const regras = Object.entries(v);
  return (
    regras.length <= LIMITE_DA_MATRIZ &&
    regras.every(
      ([categoria, responsavel]) =>
        UUID.test(categoria) && ehResponsavelDoArrendamento(responsavel),
    )
  );
}

/**
 * Quem responde pela OS: nulo fora do hotel arrendado (inclusive o modelo não
 * informado); no arrendado, a regra da categoria, ou a arrendatária.
 */
export function responsavelDoArrendamento(
  modeloContratual: ModeloContratual | null,
  matriz: MatrizDeArrendamento,
  categoriaId: string | null,
): ResponsavelDoArrendamento | null {
  if (modeloContratual !== 'arrendado') return null;
  if (categoriaId === null) return 'arrendataria';
  const regra = Object.hasOwn(matriz, categoriaId) ? matriz[categoriaId] : undefined;
  return regra ?? 'arrendataria';
}
