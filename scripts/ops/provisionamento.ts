// Leitura e conferência do pedido de provisionamento de cliente (sem conexão),
// separadas do script para o teste (tests/provisionamento-ops.test.ts).
import { uuidV7 } from './modulos.ts';

export interface PedidoLido {
  /** null: grupo novo (o id é gerado aqui); com id: completar um grupo já provisionado. */
  tenant: string | null;
  nome: string;
  adminEmail: string;
  adminNome: string;
  maxHoteis: number;
  maxUhs: number;
  por: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
// Conferência de forma, só para pegar erro de digitação; quem decide é o Auth.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function valor(argv: readonly string[], nome: string): string | undefined {
  const i = argv.indexOf(nome);
  return i >= 0 ? argv[i + 1] : undefined;
}

function exigido(argv: readonly string[], nome: string): string {
  const v = valor(argv, nome)?.trim();
  if (!v || v.startsWith('--')) throw new Error(`Informe ${nome}.`);
  return v;
}

function inteiro(argv: readonly string[], nome: string, maximo: number): number {
  const v = exigido(argv, nome);
  const n = /^\d+$/.test(v) ? Number(v) : Number.NaN;
  if (!Number.isInteger(n) || n < 1 || n > maximo) {
    throw new Error(`${nome} precisa de um número inteiro de 1 a ${maximo}.`);
  }
  return n;
}

/**
 *   --nome "Grupo X" --admin-email pessoa@cliente.com.br --admin-nome "Nome"
 *   --max-hoteis 4 --max-uhs 600 --por "Cesar" [--tenant <uuid>]
 */
export function lerPedidoDeProvisionamento(argv: readonly string[]): PedidoLido {
  const tenantBruto = valor(argv, '--tenant');
  if (tenantBruto !== undefined && !UUID.test(tenantBruto)) {
    throw new Error('--tenant precisa ser o id (uuid) de um grupo já provisionado.');
  }
  const nome = exigido(argv, '--nome');
  if (nome.length > 120) throw new Error('--nome tem no máximo 120 caracteres.');
  const adminEmail = exigido(argv, '--admin-email').toLowerCase();
  if (!EMAIL.test(adminEmail)) throw new Error('--admin-email não é um e-mail.');
  // Conta com senha de teste é do kit (pnpm demo:dados), nunca do provisionamento.
  if (adminEmail.endsWith('.test')) {
    throw new Error('--admin-email do domínio .test é do kit de teste, não de um cliente.');
  }
  return {
    tenant: tenantBruto ?? null,
    nome,
    adminEmail,
    adminNome: exigido(argv, '--admin-nome'),
    maxHoteis: inteiro(argv, '--max-hoteis', 1000),
    maxUhs: inteiro(argv, '--max-uhs', 100000),
    por: exigido(argv, '--por'),
  };
}

/** Id do grupo: o informado (completar) ou um UUID v7 novo. */
export const idDoGrupo = (p: PedidoLido): string => p.tenant ?? uuidV7();
