// Políticas configuráveis (ADR-026, fase 1a A7). Cada chave tem o formato do
// valor, validado aqui (o domínio não importa Zod; o contrato da API repete o
// formato para o OpenAPI, e tests/politicas.test.ts compara os dois), e um
// valor padrão do código. A resolução na 1a é hotel → grupo → padrão; a
// estrutura (app.politica) já comporta a bandeira, que a 1c liga com o SLA.
//
// O registro que usa uma política guarda uma cópia do valor aplicado (o
// chamado, na abertura; C2): mudar a política não altera o que já foi aberto.
import { PermissaoNegada, RegraViolada } from './erros';
import { type Resultado, ehAdminGrupo } from './permissoes';
import type { Atribuicao } from './tipos';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const objeto = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

export interface AceiteAutomatico {
  /** Desligado por padrão: o job que aceita sozinho entra na 1c. */
  ligado: boolean;
  /** Dias depois da conclusão sem aceite nem reabertura. */
  dias: number;
}

/** Categoria de ativo (id) → prioridade padrão do chamado (id). As duas entram em B2 e C1. */
export type PrioridadePadraoPorCategoria = Record<string, string>;

export interface ValoresDePolitica {
  'os.aceite_automatico': AceiteAutomatico;
  'chamado.prioridade_padrao_por_categoria': PrioridadePadraoPorCategoria;
}
export type ChaveDePolitica = keyof ValoresDePolitica;

interface DefinicaoDePolitica<C extends ChaveDePolitica> {
  padrao: ValoresDePolitica[C];
  valido(v: unknown): v is ValoresDePolitica[C];
}

export const POLITICAS: { [C in ChaveDePolitica]: DefinicaoDePolitica<C> } = {
  'os.aceite_automatico': {
    padrao: { ligado: false, dias: 7 },
    valido: (v): v is AceiteAutomatico =>
      objeto(v) &&
      Object.keys(v).length === 2 &&
      typeof v['ligado'] === 'boolean' &&
      Number.isInteger(v['dias']) &&
      (v['dias'] as number) >= 1 &&
      (v['dias'] as number) <= 60,
  },
  'chamado.prioridade_padrao_por_categoria': {
    padrao: {},
    valido: (v): v is PrioridadePadraoPorCategoria =>
      objeto(v) &&
      Object.entries(v).every(
        ([categoria, prioridade]) =>
          UUID.test(categoria) && typeof prioridade === 'string' && UUID.test(prioridade),
      ),
  },
};

export const CHAVES_DE_POLITICA = Object.keys(POLITICAS) as ChaveDePolitica[];

export const ehChaveDePolitica = (c: unknown): c is ChaveDePolitica =>
  typeof c === 'string' && c in POLITICAS;

/** Confere a chave e o formato do valor; lança com código se não valer. */
export function validarPolitica<C extends ChaveDePolitica>(
  chave: C,
  valor: unknown,
): ValoresDePolitica[C];
export function validarPolitica(chave: string, valor: unknown): unknown;
export function validarPolitica(chave: string, valor: unknown): unknown {
  if (!ehChaveDePolitica(chave)) {
    throw new RegraViolada('politica_desconhecida', 'Política desconhecida.', { chave });
  }
  if (!POLITICAS[chave].valido(valor)) {
    throw new RegraViolada('politica_valor_invalido', 'Valor fora do formato da política.', {
      chave,
    });
  }
  return valor;
}

/**
 * Valor efetivo: o do hotel, senão o do grupo, senão o padrão do código. Um
 * valor gravado fora do formato (política antiga, por exemplo) não vale e cai
 * para o nível seguinte.
 */
export function resolverPolitica<C extends ChaveDePolitica>(
  chave: C,
  niveis: { hotel?: unknown; grupo?: unknown },
): ValoresDePolitica[C] {
  const definicao = POLITICAS[chave] as DefinicaoDePolitica<C>;
  for (const v of [niveis.hotel, niveis.grupo])
    if (v !== undefined && definicao.valido(v)) return v;
  return definicao.padrao;
}

/** Gravar política e configurar o tenant e o hotel: só o Admin do grupo. */
export function podeGerirPoliticas(minhas: readonly Atribuicao[], agora: Date): Resultado {
  return ehAdminGrupo(minhas, agora)
    ? { permitido: true }
    : {
        permitido: false,
        erro: new PermissaoNegada(
          'configuracao_so_admin',
          'Só o Admin do grupo altera a configuração.',
        ),
      };
}

/**
 * País (ISO 3166-1 alfa-2), subdivisão (ISO 3166-2, do mesmo país) e moeda
 * (ISO 4217). O banco confere os mesmos formatos por restrição; aqui a
 * aplicação recusa antes, com código por campo.
 */
export function validarRegiao(r: {
  pais?: string | null;
  subdivisao?: string | null;
  moeda?: string | null;
}): void {
  if (r.pais != null && !/^[A-Z]{2}$/.test(r.pais)) {
    throw new RegraViolada('pais_invalido', 'País inválido.', { pais: r.pais });
  }
  if (r.subdivisao != null) {
    if (
      !/^[A-Z]{2}-[A-Z0-9]{1,3}$/.test(r.subdivisao) ||
      (r.pais != null && !r.subdivisao.startsWith(`${r.pais}-`))
    ) {
      throw new RegraViolada('subdivisao_invalida', 'Subdivisão inválida para o país.', {
        subdivisao: r.subdivisao,
      });
    }
  }
  if (r.moeda != null && !/^[A-Z]{3}$/.test(r.moeda)) {
    throw new RegraViolada('moeda_invalida', 'Moeda inválida.', { moeda: r.moeda });
  }
}
