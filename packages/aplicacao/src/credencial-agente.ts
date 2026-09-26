// Credencial do agente conector (ADR-008): `hk_<tenant_id>_<segredo>`.
//
// O prefixo diz à API em que tenant abrir a transação de ingestão; o segredo,
// 32 bytes aleatórios, é conferido pelo hash contra as credenciais não
// revogadas desse tenant (a RLS de hk_ingestao só mostra essas). O banco
// guarda só o hash; o segredo aparece uma vez, na criação.
//
// Gerar o segredo e calcular o hash é da porta Criptografia (implementada em
// packages/db com node:crypto): a aplicação não depende do runtime.

const FORMATO =
  /^hk_([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})_([A-Za-z0-9_-]{43})$/i;

export interface CredencialLida {
  tenantId: string;
  segredo: string;
}

/** Lê o texto da credencial; null se não estiver no formato. */
export function lerCredencial(texto: string): CredencialLida | null {
  const m = FORMATO.exec(texto.trim());
  if (!m?.[1] || !m[2]) return null;
  return { tenantId: m[1].toLowerCase(), segredo: m[2] };
}

export const formatarCredencial = (tenantId: string, segredo: string) =>
  `hk_${tenantId}_${segredo}`;

/** Comparação em tempo constante para o tamanho dos hashes. */
export function hashesIguais(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diferenca = 0;
  for (let i = 0; i < a.length; i++) diferenca |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diferenca === 0;
}

/** Lançado quando a credencial não existe, está revogada ou é de outro tenant. */
export class CredencialInvalida extends Error {
  constructor() {
    super('Credencial do agente inválida.');
    this.name = 'CredencialInvalida';
  }
}
