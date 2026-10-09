// Quem executa a OS e o custo informado (fase 1b, I4). Versão mínima, fora do
// PWA (decisão do Cesar de 05/10/2026): na triagem, a equipe interna ou um
// fornecedor do grupo (I3); no aceite, o custo, opcional, em reais, sem
// aprovação nem alçada. O módulo de custos e fornecedores segue na fase 2.
// O banco repete a lista de quem executa num check (os_executado_por_lista,
// migração 0034) e amarra o fornecedor a ela (os_fornecedor_quando_externo);
// o teste tests/valores-canonicos-banco.test.ts confere a paridade.
import type { EstadoDaOs } from './corretiva';
import { NaoEncontrado, RegraViolada } from './erros';

export const EXECUTORES_DA_OS = ['equipe_interna', 'fornecedor'] as const;
export type ExecutadoPor = (typeof EXECUTORES_DA_OS)[number];

export const ehExecutorDaOs = (v: unknown): v is ExecutadoPor =>
  typeof v === 'string' && (EXECUTORES_DA_OS as readonly string[]).includes(v);

export interface QuemExecuta {
  executadoPor: ExecutadoPor;
  /** O fornecedor do grupo, só quando executada por fornecedor. */
  fornecedorId: string | null;
}

/** O que a OS grava quando a triagem não diz nada: a equipe interna. */
export const EXECUCAO_PADRAO: QuemExecuta = { executadoPor: 'equipe_interna', fornecedorId: null };

/**
 * O pedido da triagem, com o fornecedor lido pela aplicação (null se não
 * existe ou não é visível). Com fornecedor: o id é obrigatório (422), o
 * fornecedor precisa existir (404) e estar ativo (422). Com a equipe interna,
 * o id não vai (422).
 */
export function decidirQuemExecuta(
  pedido: { executadoPor: ExecutadoPor; fornecedorId?: string | null | undefined },
  fornecedor: { ativo: boolean } | null,
): QuemExecuta {
  const fornecedorId = pedido.fornecedorId ?? null;
  if (pedido.executadoPor === 'equipe_interna') {
    if (fornecedorId !== null) {
      throw new RegraViolada(
        'os_fornecedor_indevido',
        'A OS executada pela equipe interna não leva fornecedor.',
      );
    }
    return EXECUCAO_PADRAO;
  }
  if (fornecedorId === null) {
    throw new RegraViolada('os_fornecedor_obrigatorio', 'Informe o fornecedor que executa a OS.');
  }
  if (fornecedor === null) {
    throw new NaoEncontrado('fornecedor_nao_encontrado', 'Fornecedor não encontrado.');
  }
  if (!fornecedor.ativo) {
    throw new RegraViolada('os_fornecedor_desativado', 'O fornecedor escolhido está desativado.');
  }
  return { executadoPor: 'fornecedor', fornecedorId };
}

/** Quem executa se corrige até a conclusão; depois, a OS já foi feita. */
export const ESTADOS_COM_EXECUTOR_AJUSTAVEL: readonly EstadoDaOs[] = [
  'atribuida',
  'em_execucao',
  'pausada',
];

/** Teto do numeric(12,2) da coluna: dez dígitos inteiros e dois decimais. */
export const CUSTO_MAXIMO = 9_999_999_999.99;

/**
 * Custo informado no aceite, em reais: opcional (null), finito, não negativo,
 * até o teto da coluna e com no máximo dois decimais. Fora disso, 422.
 */
export function normalizarCustoInformado(valor: number | null | undefined): number | null {
  if (valor === null || valor === undefined) return null;
  const centavos = valor * 100;
  if (
    !Number.isFinite(valor) ||
    valor < 0 ||
    valor > CUSTO_MAXIMO ||
    Math.abs(centavos - Math.round(centavos)) > 1e-6
  ) {
    throw new RegraViolada('os_custo_invalido', 'Custo informado inválido.', {
      maximo: CUSTO_MAXIMO,
    });
  }
  return Math.round(centavos) / 100;
}
