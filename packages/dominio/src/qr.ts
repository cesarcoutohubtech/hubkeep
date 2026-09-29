// Código do QR individual do ativo (fase 1a, B5): 10 caracteres do alfabeto de
// Crockford (sem I, L, O e U), aleatórios e sem relação com o id. A geração
// recebe os bytes aleatórios de fora (o domínio não faz IO); a leitura aceita
// o que uma pessoa digitaria olhando a etiqueta: minúsculas, hífens e espaços,
// O no lugar de 0, I e L no lugar de 1. O formato é conferido de novo pelo
// check do banco (migração 0018).

export const ALFABETO_DO_QR = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const TAMANHO_DO_CODIGO_QR = 10;
const FORMATO = /^[0-9A-HJKMNP-TV-Z]{10}$/;

/**
 * Código a partir de bytes aleatórios, um caractere por byte (32 divide 256:
 * cada caractere é igualmente provável). São 50 bits, e a busca pelo código
 * passa pelo escopo de quem pede.
 */
export function codigoQrDeBytes(bytes: Uint8Array): string {
  if (bytes.length < TAMANHO_DO_CODIGO_QR) {
    throw new Error(`São precisos ${TAMANHO_DO_CODIGO_QR} bytes para o código do QR.`);
  }
  let codigo = '';
  for (let i = 0; i < TAMANHO_DO_CODIGO_QR; i++) {
    codigo += ALFABETO_DO_QR[(bytes[i] ?? 0) % ALFABETO_DO_QR.length];
  }
  return codigo;
}

/** O código no formato gravado, ou null se o texto não pode ser um código. */
export function lerCodigoQr(texto: string): string | null {
  const codigo = texto.toUpperCase().replace(/[\s-]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
  return FORMATO.test(codigo) ? codigo : null;
}

/** O caminho impresso no QR, relativo ao endereço do PWA. */
export const caminhoDoQr = (codigo: string): string => `/q/${codigo}`;
