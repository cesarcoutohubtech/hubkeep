// Porta Criptografia (packages/aplicacao) com node:crypto: segredo da
// credencial do agente e hashes de lote e de registro.
import type { Criptografia } from '@hubkeep/aplicacao';
import { createHash, randomBytes } from 'node:crypto';

export const criptografiaDoServidor: Criptografia = {
  segredoAleatorio: () => randomBytes(32).toString('base64url'),
  sha256Hex: async (texto) => createHash('sha256').update(texto, 'utf8').digest('hex'),
};
