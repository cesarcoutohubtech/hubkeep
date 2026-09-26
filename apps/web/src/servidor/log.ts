// Log estruturado: uma linha JSON por evento, na saída padrão (a Vercel coleta).
// Os campos de escopo têm sempre o mesmo nome (request_id, tenant_id,
// usuario_id, hotel_id), para filtrar um pedido ou um tenant nos logs.
// Nunca entra corpo de requisição, token, cookie ou senha.

export type Nivel = 'info' | 'warn' | 'error';

export interface CamposDeLog {
  request_id?: string;
  tenant_id?: string | null;
  usuario_id?: string | null;
  hotel_id?: string | null;
  [campo: string]: unknown;
}

export type Registrador = (nivel: Nivel, evento: string, campos: CamposDeLog) => void;

export const registrarNoConsole: Registrador = (nivel, evento, campos) => {
  const linha = JSON.stringify({ em: new Date().toISOString(), nivel, evento, ...campos });
  if (nivel === 'error') console.error(linha);
  else console.log(linha);
};
