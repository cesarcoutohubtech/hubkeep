// O verificador SCRAM é a única coisa do script de papéis que não se pode
// conferir olhando: um erro aqui gera um verificador bem-formado que nunca
// autentica. O teste usa o exemplo de troca completa da RFC 7677 §3 (usuário
// "user", senha "pencil") e recalcula as duas assinaturas a partir das chaves
// derivadas: se StoredKey ou ServerKey estiverem errados, nenhuma bate.
import { createHash, createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { derivarChaves, validarSenha, verificadorScram } from '../scripts/ops/scram.ts';

const RFC7677 = {
  senha: 'pencil',
  salt: Buffer.from('W22ZaJ0SNY7soEsUEjb6gQ==', 'base64'),
  iteracoes: 4096,
  authMessage:
    'n=user,r=rOprNGfwEbeRWgbNEkqO,' +
    'r=rOprNGfwEbeRWgbNEkqO%hvYDpWUa2RaTCAfuxFIlj)hNlF$k0,s=W22ZaJ0SNY7soEsUEjb6gQ==,i=4096,' +
    'c=biws,r=rOprNGfwEbeRWgbNEkqO%hvYDpWUa2RaTCAfuxFIlj)hNlF$k0',
  clientProof: 'dHzbZapWIk4jUhN+Ute9ytag9zjfMHgsqmmiz7AndVQ=',
  serverSignature: '6rriTRBi23WpRR/wtup+mMhUZUn/dB5nLTJRsjl95G4=',
};

const hmac = (k: Buffer, m: string) => createHmac('sha256', k).update(m).digest();

describe('verificador SCRAM-SHA-256', () => {
  const chaves = derivarChaves(RFC7677.senha, RFC7677.salt, RFC7677.iteracoes);

  it('ServerKey reproduz a assinatura do servidor da RFC 7677', () => {
    expect(hmac(chaves.serverKey, RFC7677.authMessage).toString('base64')).toBe(
      RFC7677.serverSignature,
    );
  });

  it('StoredKey valida a prova do cliente da RFC 7677, como o servidor faz', () => {
    const assinatura = hmac(chaves.storedKey, RFC7677.authMessage);
    const prova = Buffer.from(RFC7677.clientProof, 'base64');
    const clientKey = Buffer.from(prova.map((b, i) => b ^ (assinatura[i] ?? 0)));
    expect(createHash('sha256').update(clientKey).digest().equals(chaves.storedKey)).toBe(true);
  });

  it('monta o formato que o PostgreSQL grava em pg_authid', () => {
    const v = verificadorScram(RFC7677.senha, RFC7677.salt, RFC7677.iteracoes);
    expect(v).toBe(
      `SCRAM-SHA-256$4096:W22ZaJ0SNY7soEsUEjb6gQ==` +
        `$${chaves.storedKey.toString('base64')}:${chaves.serverKey.toString('base64')}`,
    );
  });

  it('usa salt aleatório: a mesma senha gera verificadores diferentes', () => {
    const senha = 'a'.repeat(40);
    expect(verificadorScram(senha)).not.toBe(verificadorScram(senha));
  });

  it('recusa senha curta ou fora de ASCII imprimível', () => {
    expect(() => validarSenha('curta', 'x')).toThrow(/32/);
    expect(() => validarSenha('ç'.repeat(40), 'x')).toThrow(/ASCII/);
    expect(() => validarSenha('a b'.repeat(20), 'x')).toThrow(/ASCII/);
    expect(() => validarSenha('A1!'.repeat(12), 'x')).not.toThrow();
  });
});
