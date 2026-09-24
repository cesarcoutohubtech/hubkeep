// Verificador SCRAM-SHA-256 no formato que o PostgreSQL guarda em
// pg_authid.rolpassword (RFC 5802 / RFC 7677):
//
//   SCRAM-SHA-256$<iterações>:<salt b64>$<StoredKey b64>:<ServerKey b64>
//
// O ALTER ROLE ... PASSWORD recebe este verificador em vez da senha: o
// PostgreSQL reconhece o formato e o grava como está. Assim a senha nunca
// trafega nem aparece em log de statement do servidor.
import { createHash, createHmac, pbkdf2Sync, randomBytes } from 'node:crypto';

/** Iterações padrão do PostgreSQL (scram_iterations). */
export const ITERACOES_PADRAO = 4096;

export interface ChavesScram {
  clientKey: Buffer;
  storedKey: Buffer;
  serverKey: Buffer;
}

const hmac = (chave: Buffer, msg: string) => createHmac('sha256', chave).update(msg).digest();

/**
 * O PostgreSQL aplica SASLprep à senha antes do PBKDF2. Para ASCII imprimível
 * o SASLprep é a identidade; fora disso o resultado dependeria de normalização
 * Unicode que não reimplementamos. Por isso a senha é restrita a ASCII
 * imprimível sem espaço — o que qualquer gerenciador de senhas produz.
 */
export function validarSenha(senha: string, rotulo: string): void {
  if (senha.length < 32) throw new Error(`${rotulo}: a senha precisa ter ao menos 32 caracteres.`);
  if (!/^[\x21-\x7e]+$/.test(senha)) {
    throw new Error(`${rotulo}: use só ASCII imprimível, sem espaço (SASLprep).`);
  }
}

export function derivarChaves(senha: string, salt: Buffer, iteracoes: number): ChavesScram {
  const saltedPassword = pbkdf2Sync(senha, salt, iteracoes, 32, 'sha256');
  const clientKey = hmac(saltedPassword, 'Client Key');
  return {
    clientKey,
    storedKey: createHash('sha256').update(clientKey).digest(),
    serverKey: hmac(saltedPassword, 'Server Key'),
  };
}

export function verificadorScram(
  senha: string,
  salt: Buffer = randomBytes(16),
  iteracoes: number = ITERACOES_PADRAO,
): string {
  const { storedKey, serverKey } = derivarChaves(senha, salt, iteracoes);
  return (
    `SCRAM-SHA-256$${iteracoes}:${salt.toString('base64')}` +
    `$${storedKey.toString('base64')}:${serverKey.toString('base64')}`
  );
}
