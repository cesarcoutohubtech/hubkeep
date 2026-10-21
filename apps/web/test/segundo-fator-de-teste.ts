// Segundo fator nos testes contra o Supabase do runner (SP1, ADR-049): Admin
// do grupo, Gestor CSC e Implantador só passam pelo portão da API com a
// sessão em aal2. O auxiliar cadastra um TOTP de teste na primeira vez e
// verifica o código, gerado aqui pela RFC 6238 (HMAC-SHA1, 30 s, 6 dígitos).
import { createHmac, randomUUID } from 'node:crypto';
import type { Session, SupabaseClient } from '@supabase/supabase-js';

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function deBase32(texto: string): Buffer {
  let bits = '';
  for (const c of texto.replace(/=+$/, '').toUpperCase()) {
    const v = BASE32.indexOf(c);
    if (v < 0) throw new Error('segredo TOTP fora do base32');
    bits += v.toString(2).padStart(5, '0');
  }
  const bytes = bits.match(/.{8}/g) ?? [];
  return Buffer.from(bytes.map((b) => Number.parseInt(b, 2)));
}

/** O código TOTP do segredo (base32) no instante dado. */
export function codigoTotp(segredo: string, instante = Date.now()): string {
  const passo = Math.floor(instante / 1000 / 30);
  const contador = Buffer.alloc(8);
  contador.writeBigUInt64BE(BigInt(passo));
  const hmac = createHmac('sha1', deBase32(segredo)).update(contador).digest();
  const inicio = (hmac[hmac.length - 1] ?? 0) & 0x0f;
  const numero = hmac.readUInt32BE(inicio) & 0x7fffffff;
  return String(numero % 1_000_000).padStart(6, '0');
}

const fatores = new Map<string, { fatorId: string; segredo: string }>();

/**
 * Leva a sessão do cliente (já logado com a senha) a aal2: cadastra o TOTP do
 * usuário na primeira chamada e verifica o código. O mesmo código não serve
 * duas vezes na mesma janela: se a verificação falhar, tenta na janela seguinte.
 */
export async function elevarParaAal2(cliente: SupabaseClient): Promise<Session> {
  const { data: atual } = await cliente.auth.getSession();
  const usuarioId = atual.session?.user.id;
  if (!usuarioId) throw new Error('elevarParaAal2: o cliente não tem sessão');
  let fator = fatores.get(usuarioId);
  if (!fator) {
    const { data, error } = await cliente.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: `teste-${randomUUID().slice(0, 8)}`,
    });
    if (error || !data) throw new Error(`cadastro do TOTP falhou: ${error?.message}`);
    fator = { fatorId: data.id, segredo: data.totp.secret };
    fatores.set(usuarioId, fator);
  }
  const verificar = (instante: number) =>
    cliente.auth.mfa.challengeAndVerify({
      factorId: fator.fatorId,
      code: codigoTotp(fator.segredo, instante),
    });
  let { error } = await verificar(Date.now());
  if (error) {
    const proxima = (Math.floor(Date.now() / 30_000) + 1) * 30_000;
    await new Promise((ok) => setTimeout(ok, proxima - Date.now() + 500));
    ({ error } = await verificar(Date.now()));
  }
  if (error) throw new Error(`verificação do TOTP falhou: ${error.message}`);
  const { data } = await cliente.auth.getSession();
  if (!data.session) throw new Error('elevarParaAal2: sessão sumiu depois da verificação');
  return data.session;
}
