import { describe, expect, it } from 'vitest';
import { TENANT_DO_HISTORICO } from './gravacao-historico';
import {
  IDENTIDADE_HISTORICO_V2,
  conferirIsolamentoV2,
} from './isolamento-historico-v2';

describe('isolamento do segundo histórico do Intelligence', () => {
  it('tem tenant e domínio distintos da demonstração original', () => {
    expect(() => conferirIsolamentoV2(TENANT_DO_HISTORICO)).not.toThrow();
    expect(IDENTIDADE_HISTORICO_V2.tenantId).not.toBe(TENANT_DO_HISTORICO);
    expect(IDENTIDADE_HISTORICO_V2.dominio).toBe('intelligence-v2.demo.hubkeep.test');
    expect(Object.isFrozen(IDENTIDADE_HISTORICO_V2)).toBe(true);
  });

  it('recusa quando o tenant original coincidir com o da v2', () => {
    expect(() => conferirIsolamentoV2(IDENTIDADE_HISTORICO_V2.tenantId))
      .toThrow(/coincide/);
  });
});
