// A porta do job diário do Intelligence (ADR-036): uma sessão por tenant, com o
// hk_worker, numa unit of work só (executarComoSistema). O conteúdo da sessão
// está em repositorios/inteligencia.ts; as regras ficam no packages/inteligencia,
// que este pacote não importa (ADR-037).
import type { AcessoBanco } from './acesso';
import {
  type SessaoDoJobDoIntelligence,
  sessaoDoJobDoIntelligence,
} from './repositorios/inteligencia';

export interface PortaDoJobDoIntelligence {
  /** Roda `fn` numa transação do tenant: tudo o que ela gravar entra junto, ou nada. */
  noTenant<T>(tenantId: string, fn: (sessao: SessaoDoJobDoIntelligence) => Promise<T>): Promise<T>;
}

export function criarPortaDoJobDoIntelligence(banco: AcessoBanco): PortaDoJobDoIntelligence {
  return {
    noTenant: (tenantId, fn) =>
      banco.executarComoSistema({ tenantId }, (uow) => fn(sessaoDoJobDoIntelligence(uow))),
  };
}
