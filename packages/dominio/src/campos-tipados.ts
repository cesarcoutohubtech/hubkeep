// Campos tipados (ADR-028): o módulo comum dos campos estendidos do ativo (B2,
// B3) e do checklist tipado da preventiva (1b). Uma definição diz a chave, o
// tipo, se é obrigatório e os rótulos em quatro idiomas; os valores ficam em
// jsonb no registro e são validados aqui, na gravação.
//
// Mudar a definição não quebra o que já foi gravado: a leitura (lerValores)
// nunca falha e só descarta o que não cabe mais; o campo novo obrigatório vale
// para as gravações novas (validarValores).
import { RegraViolada } from './erros';

/** Idiomas dos rótulos. Os mesmos de @hubkeep/i18n (tests/contratos-dominio confere). */
export const IDIOMAS_DE_ROTULO = ['pt-BR', 'en', 'es', 'fr'] as const;
export type IdiomaDeRotulo = (typeof IDIOMAS_DE_ROTULO)[number];
/** Texto por idioma, parcial: a exibição cai para o catálogo e para o idioma do tenant (ADR-027). */
export type Rotulos = Partial<Record<IdiomaDeRotulo, string>>;

export const TIPOS_DE_CAMPO = ['texto', 'numero', 'data', 'lista', 'sim_nao'] as const;
export type TipoDeCampo = (typeof TIPOS_DE_CAMPO)[number];

export interface OpcaoDeLista {
  chave: string;
  rotulos: Rotulos;
}

export interface DefinicaoDeCampo {
  chave: string;
  tipo: TipoDeCampo;
  obrigatorio: boolean;
  rotulos: Rotulos;
  /** Só no número (ex.: kW, BTU/h); nulo nos outros tipos. */
  unidade: string | null;
  /** Só na lista; vazia nos outros tipos. */
  opcoes: OpcaoDeLista[];
}

export type ValorDeCampo = string | number | boolean;

export const LIMITES_DE_CAMPO = {
  campos: 50,
  opcoes: 50,
  rotulo: 120,
  unidade: 16,
  texto: 500,
} as const;

const CHAVE = /^[a-z][a-z0-9_]{0,39}$/;
const DATA = /^\d{4}-\d{2}-\d{2}$/;
const objeto = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

type MotivoDeDefinicao =
  | 'formato'
  | 'chave'
  | 'chave_repetida'
  | 'tipo'
  | 'obrigatorio'
  | 'rotulos'
  | 'unidade'
  | 'opcoes'
  | 'limite';

const definicaoInvalida = (campo: string | number, motivo: MotivoDeDefinicao): never => {
  throw new RegraViolada('definicao_de_campo_invalida', 'Definição de campo inválida.', {
    campo: String(campo),
    motivo,
  });
};

/**
 * Rótulos: objeto com idiomas da lista, textos de 1 a 120 caracteres. Com
 * `vazioPermitido`, aceita nenhum (a categoria padrão tem nome no catálogo).
 * Devolve null se não valer; quem chama lança o código do contexto.
 */
export function normalizarRotulos(v: unknown, vazioPermitido = false): Rotulos | null {
  if (!objeto(v)) return null;
  const saida: Rotulos = {};
  for (const [idioma, texto] of Object.entries(v)) {
    if (!(IDIOMAS_DE_ROTULO as readonly string[]).includes(idioma) || typeof texto !== 'string')
      return null;
    const limpo = texto.trim().replace(/\s+/g, ' ');
    if (limpo.length > LIMITES_DE_CAMPO.rotulo) return null;
    if (limpo !== '') saida[idioma as IdiomaDeRotulo] = limpo;
  }
  return vazioPermitido || Object.keys(saida).length > 0 ? saida : null;
}

/** Valida e normaliza a lista de definições. Lança definicao_de_campo_invalida com o campo e o motivo. */
export function validarDefinicoes(v: unknown): DefinicaoDeCampo[] {
  if (!Array.isArray(v)) return definicaoInvalida('lista', 'formato');
  if (v.length > LIMITES_DE_CAMPO.campos) return definicaoInvalida('lista', 'limite');
  const vistas = new Set<string>();
  return v.map((d, i): DefinicaoDeCampo => {
    if (!objeto(d)) return definicaoInvalida(i, 'formato');
    const chave = d['chave'];
    if (typeof chave !== 'string' || !CHAVE.test(chave)) return definicaoInvalida(i, 'chave');
    if (vistas.has(chave)) return definicaoInvalida(chave, 'chave_repetida');
    vistas.add(chave);
    const tipo = d['tipo'];
    if (typeof tipo !== 'string' || !(TIPOS_DE_CAMPO as readonly string[]).includes(tipo)) {
      return definicaoInvalida(chave, 'tipo');
    }
    const obrigatorio = d['obrigatorio'] ?? false;
    if (typeof obrigatorio !== 'boolean') return definicaoInvalida(chave, 'obrigatorio');
    const rotulos = normalizarRotulos(d['rotulos']);
    if (!rotulos) return definicaoInvalida(chave, 'rotulos');

    const unidadeBruta = d['unidade'] ?? null;
    let unidade: string | null = null;
    if (unidadeBruta !== null) {
      if (tipo !== 'numero' || typeof unidadeBruta !== 'string')
        return definicaoInvalida(chave, 'unidade');
      const limpa = unidadeBruta.trim();
      if (limpa.length > LIMITES_DE_CAMPO.unidade) return definicaoInvalida(chave, 'unidade');
      unidade = limpa === '' ? null : limpa;
    }

    const opcoesBrutas = d['opcoes'] ?? [];
    if (!Array.isArray(opcoesBrutas)) return definicaoInvalida(chave, 'opcoes');
    if (tipo !== 'lista' && opcoesBrutas.length > 0) return definicaoInvalida(chave, 'opcoes');
    if (
      tipo === 'lista' &&
      (opcoesBrutas.length === 0 || opcoesBrutas.length > LIMITES_DE_CAMPO.opcoes)
    ) {
      return definicaoInvalida(chave, 'opcoes');
    }
    const chavesDeOpcao = new Set<string>();
    const opcoes = opcoesBrutas.map((o): OpcaoDeLista => {
      if (
        !objeto(o) ||
        typeof o['chave'] !== 'string' ||
        !CHAVE.test(o['chave']) ||
        chavesDeOpcao.has(o['chave'])
      ) {
        return definicaoInvalida(chave, 'opcoes');
      }
      chavesDeOpcao.add(o['chave']);
      const rotulosDaOpcao = normalizarRotulos(o['rotulos']);
      if (!rotulosDaOpcao) return definicaoInvalida(chave, 'opcoes');
      return { chave: o['chave'], rotulos: rotulosDaOpcao };
    });

    return { chave, tipo: tipo as TipoDeCampo, obrigatorio, rotulos, unidade, opcoes };
  });
}

/** Definições gravadas, sem lançar: o que não vale mais é descartado (nunca quebra a leitura). */
export function lerDefinicoes(v: unknown): DefinicaoDeCampo[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((d) => {
    try {
      return validarDefinicoes([d]);
    } catch {
      return [];
    }
  });
}

/**
 * O que pode mudar numa definição existente: rótulos, obrigatoriedade,
 * unidade, opções (acrescentar e tirar) e campos novos ou removidos. Não pode:
 * mudar o tipo de uma chave que já existe, porque os valores gravados ficariam
 * com outro significado.
 */
export function validarMudancaDeDefinicoes(
  antigas: readonly DefinicaoDeCampo[],
  novas: readonly DefinicaoDeCampo[],
): void {
  for (const nova of novas) {
    const antiga = antigas.find((a) => a.chave === nova.chave);
    if (antiga && antiga.tipo !== nova.tipo) {
      throw new RegraViolada('campo_muda_de_tipo', 'O tipo de um campo existente não muda.', {
        campo: nova.chave,
        de: antiga.tipo,
        para: nova.tipo,
      });
    }
  }
}

function valorValido(d: DefinicaoDeCampo, v: unknown): ValorDeCampo | undefined {
  switch (d.tipo) {
    case 'texto': {
      if (typeof v !== 'string') return undefined;
      const limpo = v.trim();
      return limpo.length > 0 && limpo.length <= LIMITES_DE_CAMPO.texto ? limpo : undefined;
    }
    case 'numero':
      return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
    case 'data':
      return typeof v === 'string' &&
        DATA.test(v) &&
        new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v
        ? v
        : undefined;
    case 'lista':
      return typeof v === 'string' && d.opcoes.some((o) => o.chave === v) ? v : undefined;
    case 'sim_nao':
      return typeof v === 'boolean' ? v : undefined;
  }
}

/**
 * Valores para uma gravação nova: só chaves definidas, cada uma no tipo dela, e
 * todo campo obrigatório preenchido. Nulo ou ausente é "não preenchido".
 */
export function validarValores(
  definicoes: readonly DefinicaoDeCampo[],
  valores: unknown,
): Record<string, ValorDeCampo> {
  if (!objeto(valores)) {
    throw new RegraViolada('valor_de_campo_invalido', 'Valores de campo inválidos.', {
      campo: 'valores',
    });
  }
  for (const chave of Object.keys(valores)) {
    if (!definicoes.some((d) => d.chave === chave)) {
      throw new RegraViolada('campo_desconhecido', 'Campo não definido na categoria.', {
        campo: chave,
      });
    }
  }
  const saida: Record<string, ValorDeCampo> = {};
  for (const d of definicoes) {
    const bruto = valores[d.chave];
    if (bruto === undefined || bruto === null || bruto === '') {
      if (d.obrigatorio)
        throw new RegraViolada('campo_obrigatorio', 'Campo obrigatório.', { campo: d.chave });
      continue;
    }
    const v = valorValido(d, bruto);
    if (v === undefined)
      throw new RegraViolada('valor_de_campo_invalido', 'Valor fora do tipo do campo.', {
        campo: d.chave,
      });
    saida[d.chave] = v;
  }
  return saida;
}

/** Valores gravados, para exibir: nunca lança; o que a definição atual não aceita fica de fora. */
export function lerValores(
  definicoes: readonly DefinicaoDeCampo[],
  gravados: unknown,
): Record<string, ValorDeCampo> {
  if (!objeto(gravados)) return {};
  const saida: Record<string, ValorDeCampo> = {};
  for (const d of definicoes) {
    const v = valorValido(d, gravados[d.chave]);
    if (v !== undefined) saida[d.chave] = v;
  }
  return saida;
}
