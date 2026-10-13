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
//
// Na OS (ADR-045): a marca é a cópia da regra na geração; quem tria ajusta a
// marca até o aceite, com motivo. O aviso ao locador sai uma vez por OS: na
// geração já marcada como dele, ou no primeiro ajuste para ele.
import {
  type AtorDaCorretiva,
  type ChamadoParaRegra,
  type EstadoDaOs,
  normalizarMotivo,
  podeTriar,
} from './corretiva';
import { Conflito } from './erros';
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

/** Até o aceite: a OS aceita ou cancelada não muda de responsável. */
export const ESTADOS_COM_ARRENDAMENTO_AJUSTAVEL: readonly EstadoDaOs[] = [
  'atribuida',
  'em_execucao',
  'pausada',
  'concluida',
];

/**
 * Ajustar a marca do arrendamento: papel da triagem no hotel (403), a OS com
 * marca (409: fora do hotel arrendado e nas OS anteriores à 0047 não há o que
 * ajustar), ainda antes do aceite (409) e o motivo (422). Devolve o motivo
 * normalizado.
 */
export function podeAjustarArrendamento(
  ator: AtorDaCorretiva,
  chamado: ChamadoParaRegra,
  os: { estado: EstadoDaOs; responsavelArrendamento: ResponsavelDoArrendamento | null },
  motivo: string | null | undefined,
  agora: Date,
): string {
  podeTriar(ator, chamado.hotel, agora);
  if (os.responsavelArrendamento === null) {
    throw new Conflito('os_sem_arrendamento', 'A OS não tem responsável de arrendamento.', {});
  }
  if (!ESTADOS_COM_ARRENDAMENTO_AJUSTAVEL.includes(os.estado)) {
    throw new Conflito('transicao_invalida', 'A ação não vale no estado atual.', {
      acao: 'ajustar_arrendamento',
      estado: os.estado,
    });
  }
  return normalizarMotivo(motivo);
}

/** O aviso ao locador sai uma vez por OS: marcada como dele e ainda sem aviso. */
export const avisaOLocador = (
  responsavel: ResponsavelDoArrendamento | null,
  avisadoEm: Date | null,
): boolean => responsavel === 'locador' && avisadoEm === null;
