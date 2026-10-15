/**
 * Identidade fixa e exclusiva da demonstração v2 do Intelligence (DEV).
 * Não altera a identidade ou as operações da demonstração original.
 * Nunca usar em staging ou produção.
 */
import { createHash } from 'node:crypto';

function idFixo(base: string, chave: string): string {
  const h = createHash('sha256').update(`${base}:${chave}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

export const IDENTIDADE_HISTORICO_V2 = Object.freeze({
  tenantId: idFixo('hubkeep', 'historico-inteligencia-v2-isolada-20261015'),
  dominio: 'intelligence-v2.demo.hubkeep.test',
  nome: 'Grupo Demonstração — Intelligence V2',
});

export function conferirIsolamentoV2(tenantOriginal: string): void {
  if (IDENTIDADE_HISTORICO_V2.tenantId === tenantOriginal) {
    throw new Error('Tenant v2 coincide com a demonstração original. Nada foi gravado.');
  }
  if (
    !IDENTIDADE_HISTORICO_V2.dominio.endsWith('.test') ||
    IDENTIDADE_HISTORICO_V2.dominio === 'intelligence.demo.hubkeep.test'
  ) {
    throw new Error('Domínio de contas da v2 não é isolado. Nada foi gravado.');
  }
}
