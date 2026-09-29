// A âncora do TLS com o banco (ADR-032, condição 1): a CA embutida no código é
// a que o Cesar baixou do painel, a cópia em arquivo (psql e kysely-codegen) é
// a mesma, e o vencimento aparece com um ano de folga.
import { X509Certificate } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CA_DO_SUPABASE, IMPRESSAO_DA_CA_DO_SUPABASE } from '../src/ca-supabase';

const ca = new X509Certificate(CA_DO_SUPABASE);
const UM_ANO_MS = 365 * 24 * 60 * 60 * 1000;

describe('CA do Supabase', () => {
  it('é a CA raiz conferida (impressão digital fixada)', () => {
    expect(ca.fingerprint256).toBe(IMPRESSAO_DA_CA_DO_SUPABASE);
    expect(ca.subject).toContain('CN=Supabase Root 2021 CA');
    expect(ca.ca).toBe(true);
    expect(ca.checkIssued(ca)).toBe(true);
  });

  it('a cópia em arquivo é idêntica', () => {
    const arquivo = readFileSync(
      new URL('../certificados/supabase-root-2021-ca.crt', import.meta.url),
      'utf8',
    );
    expect(arquivo.replace(/\r\n/g, '\n')).toBe(CA_DO_SUPABASE);
  });

  it('vale por mais um ano (senão, trocar a CA antes que a conexão pare)', () => {
    expect(new Date(ca.validTo).getTime() - Date.now()).toBeGreaterThan(UM_ANO_MS);
  });
});
