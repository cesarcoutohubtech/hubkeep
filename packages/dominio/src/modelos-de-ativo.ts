// Modelos de ativo por categoria (fase 1b, M1; desenho em docs/referencia/
// propostas-desenho-pv-implantacao.md, seção M1, aprovado pelo Cesar em
// 12/10/2026, e as decisões de 15/10/2026).
//
// O modelo é do grupo e só o Admin do grupo o cadastra. Ele tem a categoria
// (obrigatória), o nome, o fabricante e o modelo do fabricante, os valores
// pré-preenchidos dos campos estendidos da categoria, o checklist e a
// periodicidade sugerida para o plano. A versão sobe a cada gravação
// (ADR-029: a alteração leva a versão lida).
//
// No cadastro do ativo, no web e no PWA, escolher o modelo preenche só o que
// está vazio e nunca sobrescreve (preencherComModelo). O ativo guarda de que
// modelo nasceu (modelo_id), para a lista de sugestões de plano e os
// relatórios; os dados copiados ficam no ativo (ADR-026).
import {
  type DefinicaoDeCampo,
  type ValorDeCampo,
  lerValores,
  validarValores,
} from './campos-tipados';
import { normalizarNomeDeAtivo, normalizarTextoDoAtivo } from './ativos';
import { PermissaoNegada, RegraViolada } from './erros';
import { type Resultado, ehAdminGrupo } from './permissoes';
import { type Periodicidade, validarPeriodicidade } from './plano-preventivo';
import type { Atribuicao } from './tipos';

/** Os modelos são do grupo: só o Admin do grupo cria e altera. */
export function podeGerirModelosDeAtivo(minhas: readonly Atribuicao[], agora: Date): Resultado {
  return ehAdminGrupo(minhas, agora)
    ? { permitido: true }
    : {
        permitido: false,
        erro: new PermissaoNegada(
          'modelos_de_ativo_so_admin',
          'Só o Admin do grupo gere os modelos de ativo.',
        ),
      };
}

/** A categoria do modelo, com as definições dos campos estendidos. */
export interface CategoriaDoModelo {
  id: string;
  ativa: boolean;
  definicoes: readonly DefinicaoDeCampo[];
}

/** O checklist escolhido no modelo: precisa estar ativo e, se tem categoria, ser a do modelo. */
export interface ChecklistDoModelo {
  id: string;
  ativa: boolean;
  categoriaId: string | null;
}

export interface DadosDoModeloDeAtivo {
  categoriaId: string;
  nome: string;
  fabricante: string | null;
  modelo: string | null;
  campos: Record<string, ValorDeCampo>;
  checklistModeloId: string | null;
  planoSugerido: Periodicidade | null;
}

/**
 * Valida um modelo novo ou alterado:
 *   - categoria ativa, salvo a que o modelo já tinha (modelo_ativo_categoria_inativa);
 *   - nome, fabricante e modelo nas regras do ativo;
 *   - campos pré-preenchidos: só chaves da categoria, cada uma no tipo dela;
 *     nenhum é obrigatório, porque o modelo só sugere;
 *   - checklist ativo e da mesma categoria, quando tem categoria
 *     (modelo_ativo_checklist_invalido);
 *   - periodicidade sugerida nas regras do plano, ou nenhuma.
 */
export function validarModeloDeAtivo(
  p: {
    nome: string;
    fabricante: string | null;
    modelo: string | null;
    campos: unknown;
    planoSugerido: { intervalo: unknown; unidade: unknown } | null;
  },
  categoria: CategoriaDoModelo,
  checklist: ChecklistDoModelo | null,
  categoriaAnterior: string | null = null,
): DadosDoModeloDeAtivo {
  if (!categoria.ativa && categoria.id !== categoriaAnterior) {
    throw new RegraViolada('modelo_ativo_categoria_inativa', 'A categoria está desativada.');
  }
  if (
    checklist &&
    (!checklist.ativa || (checklist.categoriaId !== null && checklist.categoriaId !== categoria.id))
  ) {
    throw new RegraViolada(
      'modelo_ativo_checklist_invalido',
      'O checklist está desativado ou é de outra categoria.',
    );
  }
  const opcionais = categoria.definicoes.map((d) => ({ ...d, obrigatorio: false }));
  return {
    categoriaId: categoria.id,
    nome: normalizarNomeDeAtivo(p.nome),
    fabricante: normalizarTextoDoAtivo('fabricante', p.fabricante),
    modelo: normalizarTextoDoAtivo('modelo', p.modelo),
    campos: validarValores(opcionais, p.campos ?? {}),
    checklistModeloId: checklist?.id ?? null,
    planoSugerido: p.planoSugerido ? validarPeriodicidade(p.planoSugerido) : null,
  };
}

/** A periodicidade gravada, sem lançar: o que não vale mais vira "sem sugestão". */
export function lerPlanoSugerido(v: unknown): Periodicidade | null {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return null;
  try {
    const o = v as Record<string, unknown>;
    return validarPeriodicidade({ intervalo: o.intervalo, unidade: o.unidade });
  } catch {
    return null;
  }
}

/** O que o cadastro do ativo tem preenchido quando o modelo é escolhido. */
export interface AtivoEmCadastro {
  categoriaId: string | null;
  nome: string;
  fabricante: string | null;
  modelo: string | null;
  campos: Record<string, ValorDeCampo>;
}

const vazio = (v: string | null | undefined) => v === null || v === undefined || v.trim() === '';

/**
 * Escolher o modelo no cadastro do ativo preenche só o que está vazio e nunca
 * sobrescreve. A categoria vem do modelo quando o ativo não tem; categoria
 * diferente recusa (modelo_ativo_de_outra_categoria). Dos campos do modelo,
 * só entram os que a categoria ainda define, no tipo dela.
 */
export function preencherComModelo(
  ativo: AtivoEmCadastro,
  modelo: {
    categoriaId: string;
    nome: string;
    fabricante: string | null;
    modelo: string | null;
    campos: unknown;
  },
  definicoes: readonly DefinicaoDeCampo[],
): AtivoEmCadastro {
  if (ativo.categoriaId !== null && ativo.categoriaId !== modelo.categoriaId) {
    throw new RegraViolada(
      'modelo_ativo_de_outra_categoria',
      'O modelo é de outra categoria que a do ativo.',
    );
  }
  const doModelo = lerValores(definicoes, modelo.campos);
  const campos = { ...ativo.campos };
  for (const [chave, valor] of Object.entries(doModelo)) {
    const atual = campos[chave];
    if (atual === undefined || (typeof atual === 'string' && atual.trim() === '')) {
      campos[chave] = valor;
    }
  }
  return {
    categoriaId: modelo.categoriaId,
    nome: vazio(ativo.nome) ? modelo.nome : ativo.nome,
    fabricante: vazio(ativo.fabricante) ? modelo.fabricante : ativo.fabricante,
    modelo: vazio(ativo.modelo) ? modelo.modelo : ativo.modelo,
    campos,
  };
}

/**
 * O modelo escolhido na gravação do ativo: existe, está ativo e é da categoria
 * do ativo. Sem modelo, nada a conferir.
 */
export function validarModeloDoAtivo(
  modelo: { categoriaId: string; ativa: boolean } | null,
  categoriaDoAtivo: string | null,
): void {
  if (!modelo) return;
  if (!modelo.ativa) {
    throw new RegraViolada('modelo_ativo_inativo', 'O modelo de ativo está desativado.');
  }
  if (modelo.categoriaId !== categoriaDoAtivo) {
    throw new RegraViolada(
      'modelo_ativo_de_outra_categoria',
      'O modelo é de outra categoria que a do ativo.',
    );
  }
}
