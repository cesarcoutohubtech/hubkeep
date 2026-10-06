// O HubKeep Intelligence no servidor do web (liberação estreita no lint,
// decisão do Cesar de 06/10/2026). Só esta pasta, no servidor, importa
// @hubkeep/inteligencia, e a composição chega a ela só por montarInteligencia
// (tests/composicao-inteligencia.test.ts). Desligar o módulo é tirar esta
// chamada da composição: nada mais do núcleo depende daqui.
//
// O conteúdo é do agente do Intelligence. Por enquanto não registra nada: a
// extensão das políticas entra junto com o filtro por módulo contratado
// (licenca.modulo, fase 1b), para o tenant sem o Intelligence não ver nem
// gravar as chaves dele.
import type { ExtensaoDePolitica } from '@hubkeep/dominio';

export interface MontagemDoIntelligence {
  /** Somadas às chaves do núcleo no registro de políticas da composição. */
  extensoesDePolitica: readonly ExtensaoDePolitica[];
}

export function montarInteligencia(): MontagemDoIntelligence {
  return { extensoesDePolitica: [] };
}
