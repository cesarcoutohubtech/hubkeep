// IDs são UUID v7 gerados pela aplicação (CLAUDE.md, "Banco de dados"): o banco
// não gera identidade de negócio, e o v7 ordena por tempo, o que mantém os
// índices de PK compactos.
import { codigoQrDeBytes, TAMANHO_DO_CODIGO_QR } from '@hubkeep/dominio';
import { v7 } from 'uuid';

export const novoId = (): string => v7();

/**
 * Código do QR individual do ativo (B5), do gerador criptográfico: 50 bits,
 * único no tenant pelo banco. A chance de repetir é desprezível; se repetir,
 * o cadastro falha e o usuário grava de novo.
 */
export const novoCodigoQr = (): string =>
  codigoQrDeBytes(crypto.getRandomValues(new Uint8Array(TAMANHO_DO_CODIGO_QR)));
