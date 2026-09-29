// Situações e prioridades do tenant (fase 1a, C1; ADR-027). A situação é o que
// a tela mostra: nome em quatro idiomas, ordem e cor, ligada a um estado
// canônico do chamado ou da OS (corretiva.ts), que é o que as regras usam. A
// prioridade tem nome, ordem e peso; o peso fica para o SLA da 1c. As padrão
// têm chave e nome no catálogo (situacao.padrao.<chave>, prioridade.padrao.<chave>).
//
// A prioridade padrão do chamado vem da política
// chamado.prioridade_padrao_por_categoria (A7), resolvida hotel → grupo →
// padrão (politicas.ts); sem regra para a categoria, vale a prioridade ativa de
// menor peso.
import { normalizarRotulos, type Rotulos } from './campos-tipados';
import {
  ESTADOS_DA_OS,
  ESTADOS_DO_CHAMADO,
  type EstadoDaOs,
  type EstadoDoChamado,
} from './corretiva';
import { PermissaoNegada, RegraViolada } from './erros';
import { type Resultado, ehAdminGrupo } from './permissoes';
import type { PrioridadePadraoPorCategoria } from './politicas';
import type { Atribuicao } from './tipos';

export const ENTIDADES_COM_SITUACAO = ['chamado', 'os'] as const;
export type EntidadeComSituacao = (typeof ENTIDADES_COM_SITUACAO)[number];

export const ESTADOS_POR_ENTIDADE: {
  chamado: readonly EstadoDoChamado[];
  os: readonly EstadoDaOs[];
} = { chamado: ESTADOS_DO_CHAMADO, os: ESTADOS_DA_OS };

export const ehEstadoDe = (entidade: EntidadeComSituacao, estado: unknown): boolean =>
  typeof estado === 'string' &&
  (ESTADOS_POR_ENTIDADE[entidade] as readonly string[]).includes(estado);

/** Cor da situação na tela. */
const COR = /^#[0-9a-f]{6}$/;
const CORES_PADRAO: Record<string, string> = {
  aberto: '#2563eb',
  em_triagem: '#7c3aed',
  atribuida: '#7c3aed',
  em_execucao: '#d97706',
  pausada: '#6b7280',
  aguardando_aceite: '#0891b2',
  concluida: '#0891b2',
  concluido: '#16a34a',
  aceita: '#16a34a',
  cancelado: '#dc2626',
  cancelada: '#dc2626',
};

export interface SituacaoPadrao {
  chave: string;
  entidade: EntidadeComSituacao;
  estado: string;
  ordem: number;
  cor: string;
}

/** Uma situação padrão por estado canônico: chave `<entidade>_<estado>`. */
export const SITUACOES_PADRAO: readonly SituacaoPadrao[] = ENTIDADES_COM_SITUACAO.flatMap(
  (entidade) =>
    ESTADOS_POR_ENTIDADE[entidade].map((estado, i) => ({
      chave: `${entidade}_${estado}`,
      entidade,
      estado,
      ordem: (i + 1) * 10,
      cor: CORES_PADRAO[estado] ?? '#6b7280',
    })),
);

export interface PrioridadePadrao {
  chave: string;
  ordem: number;
  peso: number;
}

/** Na tela, da mais urgente para a menos urgente. */
export const PRIORIDADES_PADRAO: readonly PrioridadePadrao[] = [
  { chave: 'urgente', ordem: 10, peso: 100 },
  { chave: 'alta', ordem: 20, peso: 70 },
  { chave: 'media', ordem: 30, peso: 40 },
  { chave: 'baixa', ordem: 40, peso: 10 },
];

export const LIMITES_DA_CONFIGURACAO = { ordem: 999, peso: 1000, nome: 120 } as const;

/** Situações são do tenant: só o Admin do grupo cria e altera. */
export function podeGerirSituacoes(minhas: readonly Atribuicao[], agora: Date): Resultado {
  return ehAdminGrupo(minhas, agora)
    ? { permitido: true }
    : {
        permitido: false,
        erro: new PermissaoNegada('situacoes_so_admin', 'Só o Admin do grupo gere situações.'),
      };
}

/** Prioridades são do tenant: só o Admin do grupo cria e altera. */
export function podeGerirPrioridades(minhas: readonly Atribuicao[], agora: Date): Resultado {
  return ehAdminGrupo(minhas, agora)
    ? { permitido: true }
    : {
        permitido: false,
        erro: new PermissaoNegada('prioridades_so_admin', 'Só o Admin do grupo gere prioridades.'),
      };
}

/**
 * Nomes por idioma. A situação ou prioridade do tenant precisa de ao menos um
 * nome; a padrão pode ficar sem nenhum (o nome vem do catálogo).
 */
export function validarNomesDeConfiguracao(
  tipo: 'situacao' | 'prioridade',
  nomes: unknown,
  chavePadrao: string | null,
): Rotulos {
  const r = normalizarRotulos(nomes, chavePadrao !== null);
  if (!r) {
    throw new RegraViolada(`${tipo}_nome_invalido`, 'Nome inválido.', {
      maximo: LIMITES_DA_CONFIGURACAO.nome,
    });
  }
  return r;
}

export function validarOrdem(ordem: unknown): number {
  if (!Number.isInteger(ordem) || (ordem as number) < 1 || (ordem as number) > 999) {
    throw new RegraViolada('ordem_invalida', 'Ordem inválida.', {
      maximo: LIMITES_DA_CONFIGURACAO.ordem,
    });
  }
  return ordem as number;
}

export function validarPeso(peso: unknown): number {
  if (!Number.isInteger(peso) || (peso as number) < 1 || (peso as number) > 1000) {
    throw new RegraViolada('peso_invalido', 'Peso inválido.', {
      maximo: LIMITES_DA_CONFIGURACAO.peso,
    });
  }
  return peso as number;
}

/** Cor em `#rrggbb`, guardada em minúsculas. */
export function validarCor(cor: unknown): string {
  const c = typeof cor === 'string' ? cor.trim().toLowerCase() : '';
  if (!COR.test(c)) throw new RegraViolada('cor_invalida', 'Cor inválida.');
  return c;
}

/** O estado canônico da situação nova precisa ser um do chamado ou da OS. */
export function validarEstadoDaSituacao(
  entidade: unknown,
  estado: unknown,
): {
  entidade: EntidadeComSituacao;
  estado: string;
} {
  if (
    !(ENTIDADES_COM_SITUACAO as readonly unknown[]).includes(entidade) ||
    !ehEstadoDe(entidade as EntidadeComSituacao, estado)
  ) {
    throw new RegraViolada('estado_invalido', 'Estado inválido para a situação.');
  }
  return { entidade: entidade as EntidadeComSituacao, estado: estado as string };
}

export interface SituacaoParaRegra {
  id: string;
  entidade: EntidadeComSituacao;
  estado: string;
  ordem: number;
  ativa: boolean;
}

export interface PrioridadeParaRegra {
  id: string;
  ordem: number;
  peso: number;
  ativa: boolean;
}

/**
 * Todo estado canônico precisa de uma situação ativa, para a transição ter
 * onde cair: desativar a última do estado é recusado.
 */
export function exigirSituacaoRestante(
  situacoes: readonly SituacaoParaRegra[],
  desativando: string,
): void {
  const alvo = situacoes.find((s) => s.id === desativando);
  if (!alvo) return;
  const outras = situacoes.some(
    (s) => s.id !== alvo.id && s.ativa && s.entidade === alvo.entidade && s.estado === alvo.estado,
  );
  if (!outras) {
    throw new RegraViolada('ultima_situacao_do_estado', 'É a última situação ativa do estado.', {
      entidade: alvo.entidade,
      estado: alvo.estado,
    });
  }
}

/** O chamado sempre tem prioridade: desativar a última ativa é recusado. */
export function exigirPrioridadeRestante(
  prioridades: readonly PrioridadeParaRegra[],
  desativando: string,
): void {
  if (!prioridades.some((p) => p.id !== desativando && p.ativa)) {
    throw new RegraViolada('ultima_prioridade', 'É a última prioridade ativa.');
  }
}

/**
 * Situação do registro ao entrar num estado: a pedida, se estiver ativa e for
 * desse estado; sem pedido, a ativa de menor ordem do estado.
 */
export function situacaoPara(
  situacoes: readonly SituacaoParaRegra[],
  entidade: EntidadeComSituacao,
  estado: string,
  pedida?: string | null,
): string {
  const doEstado = situacoes
    .filter((s) => s.ativa && s.entidade === entidade && s.estado === estado)
    .sort((a, b) => a.ordem - b.ordem || a.id.localeCompare(b.id));
  if (pedida != null) {
    if (!doEstado.some((s) => s.id === pedida)) {
      throw new RegraViolada('situacao_fora_do_estado', 'A situação não vale para este estado.', {
        estado,
      });
    }
    return pedida;
  }
  const primeira = doEstado[0];
  if (!primeira) {
    throw new RegraViolada('sem_situacao_para_estado', 'Nenhuma situação ativa para o estado.', {
      entidade,
      estado,
    });
  }
  return primeira.id;
}

/**
 * Prioridade padrão do chamado. `porCategoria` é o valor já resolvido da
 * política (hotel → grupo → padrão). A prioridade da categoria vale se estiver
 * ativa; senão, ou sem categoria, vale a ativa de menor peso. A origem vai na
 * cópia da política aplicada, no chamado (ADR-026, C2).
 */
export function prioridadePadraoDoChamado(p: {
  porCategoria: PrioridadePadraoPorCategoria;
  categoriaId: string | null;
  prioridades: readonly PrioridadeParaRegra[];
}): { prioridadeId: string; origem: 'categoria' | 'menor_peso' } {
  const ativas = p.prioridades.filter((x) => x.ativa);
  const daCategoria = p.categoriaId !== null ? p.porCategoria[p.categoriaId] : undefined;
  if (daCategoria && ativas.some((x) => x.id === daCategoria)) {
    return { prioridadeId: daCategoria, origem: 'categoria' };
  }
  const menor = [...ativas].sort(
    (a, b) => a.peso - b.peso || b.ordem - a.ordem || a.id.localeCompare(b.id),
  )[0];
  if (!menor) throw new RegraViolada('sem_prioridade_ativa', 'Nenhuma prioridade ativa.');
  return { prioridadeId: menor.id, origem: 'menor_peso' };
}
