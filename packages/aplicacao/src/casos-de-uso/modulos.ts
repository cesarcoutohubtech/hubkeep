// Políticas por módulo contratado (I7; adendo ao ADR-026 de 10/10/2026): as
// chaves de um módulo valem só para o tenant que tem o módulo vigente. Os
// registros são montados na partida (registrosDePoliticasPorModulo); a cada
// request, lê-se licenca.modulo com o contexto de quem pede e escolhe-se o
// registro pela vigência (modulosVigentes). Quem não lê licenca.modulo fica
// com o registro do núcleo.
import {
  type Contexto,
  type RegistroDePoliticas,
  type RegistrosDePoliticas,
  modulosVigentes,
} from '@hubkeep/dominio';
import type { PortaModulos } from '../portas/modulos';
import type { Relogio } from '../portas/papeis';

/** O registro de políticas do tenant de quem pede. */
export type PoliticasDoTenant = (ctx: Contexto) => Promise<RegistroDePoliticas>;

export function criarPoliticasDoTenant(deps: {
  registros: RegistrosDePoliticas;
  modulos: PortaModulos;
  relogio: Relogio;
}): PoliticasDoTenant {
  return async (ctx) =>
    deps.registros.doTenant(
      modulosVigentes(await deps.modulos.contratados(ctx), deps.relogio.agora()),
    );
}
