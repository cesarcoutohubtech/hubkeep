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
//
// O job diário (ADR-036) chega à composição como jobDoDia: a composição dá a
// porta do banco do worker, os registros de políticas e o relógio, e a rota
// /api/cron/inteligencia o roda por tenant.
//
// O painel (as telas do 1.0) chega como painel: a composição dá a porta do
// banco com o hk_app, os módulos contratados, as atribuições e o relógio, e as
// rotas /api/v1/inteligencia/... chamam os casos de uso com o contexto de quem
// pede.
import type { ExtensaoDeModulo } from '@hubkeep/dominio';
import { EXTENSAO_DE_POLITICAS_DO_INTELLIGENCE, type ResumoDoJob } from '@hubkeep/inteligencia';
import { type DepsDoJobDoDia, criarJobDoDia } from './job';
import { type CasosDeUsoDoPainel, type DepsDoPainel, criarPainel } from './painel';

export type { CasosDeUsoDoPainel, PedidoDeDecisaoDoPainel, PedidoDeListaDoPainel } from './painel';

export interface MontagemDoIntelligence {
  /** Somadas às chaves do núcleo só para o tenant com o módulo vigente. */
  extensoesDePolitica: readonly ExtensaoDeModulo[];
  /** O job do dia de um tenant (hk_worker, uma transação por tenant). */
  jobDoDia(deps: DepsDoJobDoDia): (tenantId: string) => Promise<ResumoDoJob>;
  /** A leitura e a decisão do insight, com o hk_app e o contexto de quem pede. */
  painel(deps: DepsDoPainel): CasosDeUsoDoPainel;
}

export function montarInteligencia(): MontagemDoIntelligence {
  return {
    extensoesDePolitica: [
      { modulo: 'inteligencia', extensao: EXTENSAO_DE_POLITICAS_DO_INTELLIGENCE },
    ],
    jobDoDia: criarJobDoDia,
    painel: criarPainel,
  };
}
