// Políticas do Intelligence (ADR-035): uma chave por score, com o formato
// validado aqui e o padrão do código (os PADRAO_* de cada módulo). Só o Admin
// do grupo altera (podeGerirPoliticas, do domínio).
//
// O módulo não tem resolução própria (adendo ao ADR-026, 06/10/2026): as
// chaves entram no registroDePoliticas do núcleo pela EXTENSAO_DE_POLITICAS_
// DO_INTELLIGENCE, montada na composição do web (montarInteligencia), e a
// resolução é a do registro, hotel → bandeira → grupo → padrão. A extensão é
// registrada ligada ao módulo inteligencia: vale só para o tenant com o módulo
// vigente em licenca.modulo (I7; adendo ao ADR-026 de 10/10/2026).
//
// O formato é o do padrão: as mesmas chaves, números finitos e não negativos,
// ao menos um peso positivo, o limite do insight até 100 e faixas válidas. Os
// intervalos de cada campo esperam os dados do piloto.
//
// A sexta chave, inteligencia.metrica_janela_leitura (ADR-035, revisão de
// 06/10/2026, aprovada pelos dois em 07/10/2026), é a janela de leitura da
// métrica diária (ADR-036). Ela precisa ser pelo menos o dobro da janela da
// efetividade, para caber o antes e o depois: conferido ao gravar qualquer das
// duas (validarJanelaDeLeitura) e pelo job na leitura (janelaDeLeituraEfetiva).
//
// A sétima, inteligencia.visibilidade_telas (adendo de 12/10/2026, aprovado
// por Cesar; aguarda o Kaio), é quando e para quem as telas aparecem
// (visibilidade.ts). Vale só no nível do grupo.
import { type ExtensaoDePolitica, RegraViolada } from '@hubkeep/dominio';
import { PADRAO_ATENCAO, type ConfigAtencao, configAtencaoValida } from './atencao';
import {
  PADRAO_EFETIVIDADE,
  type ConfigEfetividade,
  limiaresDeEfetividadeValidos,
} from './efetividade';
import { PADRAO_REINCIDENCIA, type ConfigReincidencia } from './reincidencia';
import { FAIXAS_PADRAO } from './score';
import { PADRAO_SISTEMICO, type ConfigSistemico, configSistemicoValida } from './sistemico';
import { PADRAO_SUBSTITUICAO, type ConfigSubstituicao } from './substituicao';
import {
  type ConfigVisibilidadeTelas,
  PADRAO_VISIBILIDADE_TELAS,
  configVisibilidadeValida,
} from './visibilidade';

/** Janela de leitura da métrica diária, em dias (ADR-036). */
export interface ConfigJanelaDeLeitura {
  dias: number;
}
export const MINIMO_DA_JANELA_DE_LEITURA_DIAS = 180;
export const MAXIMO_DA_JANELA_DE_LEITURA_DIAS = 730;
export const PADRAO_JANELA_DE_LEITURA: ConfigJanelaDeLeitura = {
  dias: MINIMO_DA_JANELA_DE_LEITURA_DIAS,
};

export interface ValoresDePoliticaDoIntelligence {
  'inteligencia.reincidencia': ConfigReincidencia;
  'inteligencia.atencao_ativo': ConfigAtencao;
  'inteligencia.efetividade': ConfigEfetividade;
  'inteligencia.sistemico': ConfigSistemico;
  'inteligencia.substituicao': ConfigSubstituicao;
  'inteligencia.metrica_janela_leitura': ConfigJanelaDeLeitura;
  'inteligencia.visibilidade_telas': ConfigVisibilidadeTelas;
}
export type ChaveDePoliticaDoIntelligence = keyof ValoresDePoliticaDoIntelligence;

export const PADROES_DO_INTELLIGENCE: {
  [C in ChaveDePoliticaDoIntelligence]: ValoresDePoliticaDoIntelligence[C];
} = {
  'inteligencia.reincidencia': PADRAO_REINCIDENCIA,
  'inteligencia.atencao_ativo': PADRAO_ATENCAO,
  'inteligencia.efetividade': PADRAO_EFETIVIDADE,
  'inteligencia.sistemico': PADRAO_SISTEMICO,
  'inteligencia.substituicao': PADRAO_SUBSTITUICAO,
  'inteligencia.metrica_janela_leitura': PADRAO_JANELA_DE_LEITURA,
  'inteligencia.visibilidade_telas': PADRAO_VISIBILIDADE_TELAS,
};

export const CHAVES_DE_POLITICA_DO_INTELLIGENCE = Object.keys(
  PADROES_DO_INTELLIGENCE,
) as ChaveDePoliticaDoIntelligence[];

export const ehChaveDePoliticaDoIntelligence = (c: unknown): c is ChaveDePoliticaDoIntelligence =>
  typeof c === 'string' && Object.hasOwn(PADROES_DO_INTELLIGENCE, c);

const objeto = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const CHAVES_DE_FAIXA = new Set(FAIXAS_PADRAO.map((f) => f.chave));

/**
 * Faixas: chaves do catálogo (as do PRD), cada uma uma vez, a primeira desde 0
 * e os limites crescentes até 100.
 */
function faixasValidas(v: unknown): boolean {
  if (!Array.isArray(v) || v.length === 0) return false;
  const vistas = new Set<string>();
  let anterior = -1;
  for (const f of v) {
    if (!objeto(f) || Object.keys(f).length !== 2) return false;
    const { desde, chave } = f;
    if (typeof chave !== 'string' || !CHAVES_DE_FAIXA.has(chave) || vistas.has(chave)) return false;
    if (typeof desde !== 'number' || !Number.isFinite(desde) || desde <= anterior || desde > 100)
      return false;
    if (anterior === -1 && desde !== 0) return false;
    vistas.add(chave);
    anterior = desde;
  }
  return true;
}

/**
 * Campos que entraram depois da primeira versão da política e podem faltar no
 * valor gravado antes deles: ausentes, vale o padrão. Sem isso, a política
 * gravada antes deixaria de valer inteira, e o resolvedor voltaria ao padrão.
 * O mesmo modelo v4 (Kaio, 15/10/2026): a população mínima e o percentual afetado.
 */
const CAMPOS_QUE_PODEM_FALTAR = new Set(['minPopulacao', 'percentualMinimoAfetado']);

/** Mesmas chaves do padrão, recursivamente; número finito e não negativo onde o padrão tem número. */
function mesmoFormato(v: unknown, padrao: unknown, campo: string): boolean {
  if (campo === 'faixas') return faixasValidas(v);
  if (campo === 'limiteInsight') return typeof v === 'number' && v >= 0 && v <= 100;
  if (typeof padrao === 'boolean') return typeof v === 'boolean';
  if (typeof padrao === 'number') return typeof v === 'number' && Number.isFinite(v) && v >= 0;
  if (!objeto(padrao) || !objeto(v)) return false;
  const chaves = Object.keys(padrao);
  if (!Object.keys(v).every((k) => Object.hasOwn(padrao, k))) return false;
  const campoValido = (k: string) =>
    Object.hasOwn(v, k) ? mesmoFormato(v[k], padrao[k], k) : CAMPOS_QUE_PODEM_FALTAR.has(k);
  if (!chaves.every(campoValido)) return false;
  if (campo === 'pesos') return Object.values(v).some((p) => (p as number) > 0);
  return true;
}

export function valorValidoDoIntelligence<C extends ChaveDePoliticaDoIntelligence>(
  chave: C,
  valor: unknown,
): valor is ValoresDePoliticaDoIntelligence[C] {
  if (chave === 'inteligencia.metrica_janela_leitura') {
    return (
      objeto(valor) &&
      Object.keys(valor).length === 1 &&
      Number.isInteger(valor['dias']) &&
      (valor['dias'] as number) >= MINIMO_DA_JANELA_DE_LEITURA_DIAS &&
      (valor['dias'] as number) <= MAXIMO_DA_JANELA_DE_LEITURA_DIAS
    );
  }
  if (chave === 'inteligencia.visibilidade_telas') return configVisibilidadeValida(valor);
  if (!mesmoFormato(valor, PADROES_DO_INTELLIGENCE[chave], '')) return false;
  // Atenção: o mínimo de medições é inteiro e de pelo menos 1.
  if (chave === 'inteligencia.atencao_ativo') return configAtencaoValida(valor as ConfigAtencao);
  // Efetividade: os limiares precisam estar na ordem (parcial < observada ≤ 100).
  if (chave === 'inteligencia.efetividade')
    return limiaresDeEfetividadeValidos(valor as ConfigEfetividade);
  // Sistêmico: mínimos inteiros de pelo menos 1, taxa e razão contra a base positivas.
  if (chave === 'inteligencia.sistemico') return configSistemicoValida(valor as ConfigSistemico);
  return true;
}

/** Confere a chave e o formato do valor; lança com código se não valer. */
export function validarPoliticaDoIntelligence<C extends ChaveDePoliticaDoIntelligence>(
  chave: C,
  valor: unknown,
): ValoresDePoliticaDoIntelligence[C];
export function validarPoliticaDoIntelligence(chave: string, valor: unknown): unknown;
export function validarPoliticaDoIntelligence(chave: string, valor: unknown): unknown {
  if (!ehChaveDePoliticaDoIntelligence(chave)) {
    throw new RegraViolada('politica_desconhecida', 'Política desconhecida.', { chave });
  }
  if (!valorValidoDoIntelligence(chave, valor)) {
    throw new RegraViolada('politica_valor_invalido', 'Valor fora do formato da política.', {
      chave,
    });
  }
  return valor;
}

/** As chaves do Intelligence para o registroDePoliticas do núcleo (prefixo inteligencia.). */
export const EXTENSAO_DE_POLITICAS_DO_INTELLIGENCE: ExtensaoDePolitica = {
  prefixo: 'inteligencia.',
  chaves: CHAVES_DE_POLITICA_DO_INTELLIGENCE,
  padrao: (chave) =>
    ehChaveDePoliticaDoIntelligence(chave) ? PADROES_DO_INTELLIGENCE[chave] : undefined,
  valido: (chave, valor) =>
    ehChaveDePoliticaDoIntelligence(chave) && valorValidoDoIntelligence(chave, valor),
};

/** O menor valor da janela de leitura que cabe a efetividade: o dobro dela, e nunca menos que 180 dias. */
export const minimoDaJanelaDeLeitura = (efetividadeDias: number): number =>
  Math.max(MINIMO_DA_JANELA_DE_LEITURA_DIAS, 2 * efetividadeDias);

/**
 * Validação entre chaves (ADR-035): ao gravar a janela de leitura ou a janela da
 * efetividade, o valor novo é conferido contra o valor resolvido da outra no
 * mesmo escopo. Quem grava recusa com este erro (422).
 */
export function validarJanelaDeLeitura(janelaDias: number, efetividadeDias: number): void {
  const minimo = minimoDaJanelaDeLeitura(efetividadeDias);
  if (janelaDias < minimo) {
    throw new RegraViolada(
      'janela_de_leitura_curta',
      'A janela de leitura precisa ser pelo menos o dobro da janela da efetividade.',
      { janelaDias, efetividadeDias, minimo },
    );
  }
}

/** Aviso de configuração que o job registra quando corrige a janela na leitura. */
export interface AvisoDeJanelaDeLeitura {
  codigo: 'janela_de_leitura_menor_que_o_dobro';
  janelaDias: number;
  efetividadeDias: number;
  usadoDias: number;
}

/**
 * Conferência na leitura (ADR-035): a relação pode quebrar sem gravação, quando
 * o hotel herda um valor novo do grupo. Se a janela resolvida for menor que o
 * dobro da efetividade, o job usa o dobro e devolve o aviso para registrar.
 */
export function janelaDeLeituraEfetiva(
  janelaDias: number,
  efetividadeDias: number,
): { dias: number; aviso: AvisoDeJanelaDeLeitura | null } {
  const minimo = minimoDaJanelaDeLeitura(efetividadeDias);
  if (janelaDias >= minimo) return { dias: janelaDias, aviso: null };
  return {
    dias: minimo,
    aviso: {
      codigo: 'janela_de_leitura_menor_que_o_dobro',
      janelaDias,
      efetividadeDias,
      usadoDias: minimo,
    },
  };
}
