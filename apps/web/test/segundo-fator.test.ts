// MFA obrigatório (SP1, ADR-049): o nível da sessão sai do token assinado, e o
// portão do contexto recusa em aal1 quem tem papel que exige o segundo fator.
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Atribuicao, Papel } from '@hubkeep/dominio';
import { SignJWT, exportJWK, generateKeyPair } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { exigirSegundoFatorNoContexto } from '../src/servidor/contexto';
import { criarVerificadorJwks } from '../src/servidor/identidade';
import { codigoTotp } from './segundo-fator-de-teste';

const USUARIO = '0192f000-0000-7000-8000-000000000001';
const ctx = { usuarioId: USUARIO, tenantId: '0192f000-0000-7000-8000-0000000000aa' };
const agora = new Date('2026-10-21T12:00:00Z');
const atr = (papel: Papel): Atribuicao => ({
  id: `a-${papel}`,
  usuarioId: USUARIO,
  papel,
  escopo: { tipo: 'grupo' },
  validoAte: null,
  revogadoEm: null,
});
const codigoDe = async (p: Promise<unknown>) => {
  try {
    await p;
    return null;
  } catch (e) {
    return (e as { codigo?: string }).codigo ?? String(e);
  }
};

describe('portão do segundo fator no contexto', () => {
  const COM_EXIGENCIA: Papel[] = ['admin_grupo', 'gestor_csc', 'implantador'];
  const SEM_EXIGENCIA: Papel[] = ['gerente_hotel', 'tecnico', 'solicitante', 'proprietario'];

  for (const papel of COM_EXIGENCIA) {
    it(`${papel}: recusa em aal1, passa em aal2`, async () => {
      const deps = { atribuicoes: async () => [atr(papel)], agora: () => agora };
      expect(await codigoDe(exigirSegundoFatorNoContexto(ctx, 'aal1', deps))).toBe(
        'segundo_fator_obrigatorio',
      );
      expect(await codigoDe(exigirSegundoFatorNoContexto(ctx, 'aal2', deps))).toBeNull();
    });
  }

  for (const papel of SEM_EXIGENCIA) {
    it(`${papel}: passa em aal1`, async () => {
      const deps = { atribuicoes: async () => [atr(papel)], agora: () => agora };
      expect(await codigoDe(exigirSegundoFatorNoContexto(ctx, 'aal1', deps))).toBeNull();
    });
  }

  it('em aal2, as atribuições nem são lidas', async () => {
    let lidas = 0;
    const deps = {
      atribuicoes: async () => {
        lidas++;
        return [atr('admin_grupo')];
      },
      agora: () => agora,
    };
    await exigirSegundoFatorNoContexto(ctx, 'aal2', deps);
    expect(lidas).toBe(0);
  });
});

describe('o nível da sessão vem do token assinado', () => {
  let servidor: Server;
  let base: string;
  let assinar: (claims: Record<string, unknown>) => Promise<string>;

  beforeAll(async () => {
    const { privateKey, publicKey } = await generateKeyPair('ES256');
    const jwk = { ...(await exportJWK(publicKey)), kid: 'k1', alg: 'ES256', use: 'sig' };
    servidor = createServer((_req, res) => {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ keys: [jwk] }));
    });
    await new Promise<void>((ok) => servidor.listen(0, '127.0.0.1', ok));
    base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
    assinar = (claims) =>
      new SignJWT({ role: 'authenticated', ...claims })
        .setProtectedHeader({ alg: 'ES256', kid: 'k1' })
        .setSubject(USUARIO)
        .setIssuer(`${base}/auth/v1`)
        .setAudience('authenticated')
        .setExpirationTime('5m')
        .sign(privateKey);
  });

  afterAll(() => {
    servidor?.close();
  });

  it('aal2 no token: aal2', async () => {
    const u = await criarVerificadorJwks(base).verificar(await assinar({ aal: 'aal2' }));
    expect(u.nivel).toBe('aal2');
  });

  it('aal1, claim ausente ou valor desconhecido: aal1', async () => {
    const v = criarVerificadorJwks(base);
    for (const claims of [{ aal: 'aal1' }, {}, { aal: 'aal3' }, { aal: true }]) {
      expect((await v.verificar(await assinar(claims))).nivel).toBe('aal1');
    }
  });
});

describe('o TOTP dos testes de integração (segundo-fator-de-teste.ts)', () => {
  // RFC 6238, apêndice B: segredo ASCII "12345678901234567890" (SHA1); os 6 últimos dígitos.
  const SEGREDO = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
  it('bate com os vetores da RFC 6238', () => {
    expect(codigoTotp(SEGREDO, 59_000)).toBe('287082');
    expect(codigoTotp(SEGREDO, 1_111_111_109_000)).toBe('081804');
    expect(codigoTotp(SEGREDO, 1_234_567_890_000)).toBe('005924');
    expect(codigoTotp(SEGREDO, 2_000_000_000_000)).toBe('279037');
  });
});
