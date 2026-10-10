// O HubKeep Intelligence no servidor do web (liberação estreita no lint,
// decisão do Cesar de 06/10/2026). Só esta pasta, no servidor, importa
// @hubkeep/inteligencia, e a composição chega a ela só por montarInteligencia
// (tests/composicao-inteligencia.test.ts). Desligar o módulo é tirar esta
// chamada da composição: nada mais do núcleo depende daqui.
//
// O conteúdo é do agente do Intelligence. As chaves inteligencia.* entram no
// registro de políticas ligadas ao módulo 'inteligencia': valem só para o
// tenant com o módulo vigente em licenca.modulo (I7; adendo ao ADR-026 de
// 10/10/2026). O tenant sem o Intelligence não as grava (politica_desconhecida).
import type { ExtensaoDeModulo } from '@hubkeep/dominio';
import { EXTENSAO_DE_POLITICAS_DO_INTELLIGENCE } from '@hubkeep/inteligencia';

export interface MontagemDoIntelligence {
  /** Somadas às chaves do núcleo só para o tenant com o módulo vigente. */
  extensoesDePolitica: readonly ExtensaoDeModulo[];
}

export function montarInteligencia(): MontagemDoIntelligence {
  return {
    extensoesDePolitica: [
      { modulo: 'inteligencia', extensao: EXTENSAO_DE_POLITICAS_DO_INTELLIGENCE },
    ],
  };
}
