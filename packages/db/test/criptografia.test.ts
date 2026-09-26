// Porta Criptografia com node:crypto: formato do segredo e SHA-256 conhecido.
import { describe, expect, it } from 'vitest';
import { lerCredencial } from '@hubkeep/aplicacao';
import { criptografiaDoServidor } from '../src/criptografia';

describe('criptografia do servidor', () => {
  it('segredo: 32 bytes em base64url, aceito pelo formato da credencial', () => {
    const a = criptografiaDoServidor.segredoAleatorio();
    const b = criptografiaDoServidor.segredoAleatorio();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a).not.toBe(b);
    const tenant = '10000000-0000-4000-8000-000000000001';
    expect(lerCredencial(`hk_${tenant}_${a}`)).toEqual({ tenantId: tenant, segredo: a });
  });

  it('SHA-256 em hexadecimal (vetor conhecido)', async () => {
    expect(await criptografiaDoServidor.sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});
