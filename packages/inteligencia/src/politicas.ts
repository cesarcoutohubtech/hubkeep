// Políticas do Intelligence (ADR-035): uma chave por score, com o formato
// validado aqui e o padrão do código (os PADRAO_* de cada módulo). Só o Admin
// do grupo altera (podeGerirPoliticas, do domínio).
//
// O módulo não tem resolução própria (adendo ao ADR-026, 06/10/2026): as
// chaves entram no registroDePoliticas do núcleo pela EXTENSAO_DE_POLITICAS_
// DO_INTELLIGENCE, montada na composição do web (montarInteligencia), e a
// resolução é a do registro, hotel → bandeira → grupo → padrão. A extensão só
// é registrada junto com o filtro por módulo contratado (licenca.modulo, 1b).
//
// O formato é o do padrão: as mesmas chaves, números finitos e não negativos,
// ao menos um peso positivo, o limite do insight até 100 e faixas válidas. Os
// intervalos de cada campo esperam os dados do piloto.
import { type ExtensaoDePolitica, RegraViolada } from '@hubkeep/dominio';
import { PADRAO_ATENCAO, type ConfigAtencao } from './atencao';
import { PADRAO_EFETIVIDADE, type ConfigEfetividade } from './efetividade';
import { PADRAO_REINCIDENCIA, type ConfigReincidencia } from './reincidencia';
import { FAIXAS_PADRAO } from './score';
import { PADRAO_SISTEMICO, type ConfigSistemico } from './sistemico';
import { PADRAO_SUBSTITUICAO, type ConfigSubstituicao } from './substituicao';

export interface ValoresDePoliticaDoIntelligence {
  'inteligencia.reincidencia': ConfigReincidencia;
  'inteligencia.atencao_ativo': ConfigAtencao;
  'inteligencia.efetividade': ConfigEfetividade;
  'inteligencia.sistemico': ConfigSistemico;
  'inteligencia.substituicao': ConfigSubstituicao;
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

/** Mesmas chaves do padrão, recursivamente; número finito e não negativo onde o padrão tem número. */
function mesmoFormato(v: unknown, padrao: unknown, campo: string): boolean {
  if (campo === 'faixas') return faixasValidas(v);
  if (campo === 'limiteInsight') return typeof v === 'number' && v >= 0 && v <= 100;
  if (typeof padrao === 'number') return typeof v === 'number' && Number.isFinite(v) && v >= 0;
  if (!objeto(padrao) || !objeto(v)) return false;
  const chaves = Object.keys(padrao);
  if (Object.keys(v).length !== chaves.length) return false;
  if (!chaves.every((k) => Object.hasOwn(v, k) && mesmoFormato(v[k], padrao[k], k))) return false;
  if (campo === 'pesos') return Object.values(v).some((p) => (p as number) > 0);
  return true;
}

export function valorValidoDoIntelligence<C extends ChaveDePoliticaDoIntelligence>(
  chave: C,
  valor: unknown,
): valor is ValoresDePoliticaDoIntelligence[C] {
  return mesmoFormato(valor, PADROES_DO_INTELLIGENCE[chave], '');
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
