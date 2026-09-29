// Decisão de TLS da conexão do app com o banco. Pura (sem IO) para ser testada
// sem banco e usada pela raiz de composição de cada app.
//
// O pooler do Supabase exige TLS. Sem TLS só existe um caso legítimo: a CI, que
// conecta ao Postgres do runner em 127.0.0.1. HK_BANCO_SEM_TLS=1 esquecido na
// Vercel ou copiado para uma máquina com a URL do dev mandaria senha e dados em
// claro pela internet, e tudo "funcionaria" sem erro nenhum. Por isso a flag só
// vale com host local; com host remoto, a inicialização falha.
//
// Com TLS, o certificado do servidor é conferido contra a CA do Supabase e pelo
// nome do host (ADR-032, condição 1): sem isso, quem estivesse no meio da
// conexão entregaria um certificado qualquer e leria a senha do papel.
import { CA_DO_SUPABASE } from './ca-supabase';

const HOSTS_LOCAIS = new Set(['localhost', '127.0.0.1', '::1']);

/** `[::1]` (forma do WHATWG URL para IPv6) e `::1` são o mesmo host. */
const hostLocal = (host: string) => HOSTS_LOCAIS.has(host.toLowerCase().replace(/^\[|\]$/g, ''));

/**
 * Diz se a conexão usa TLS. `semTls` é a flag HK_BANCO_SEM_TLS=1.
 *
 * As mensagens de erro nunca incluem a string de conexão: ela tem a senha.
 */
export function tlsDaConexao(url: string, semTls: boolean): boolean {
  if (!semTls) return true;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new Error('HK_BANCO_SEM_TLS=1: a string de conexão não é uma URL postgresql:// válida.');
  }
  // O `?host=` da string de conexão (aceito pelo pg) substitui o host da URL;
  // os dois precisam ser locais para ninguém contornar a checagem por ele.
  const hosts = [u.hostname, ...u.searchParams.getAll('host')];
  if (!u.hostname || !hosts.every(hostLocal)) {
    throw new Error(
      'HK_BANCO_SEM_TLS=1 só é aceito com o banco em localhost, 127.0.0.1 ou ::1, ' +
        'e o host da string de conexão é outro. Remova a variável: fora da CI a conexão usa TLS.',
    );
  }
  return false;
}

/**
 * Parâmetros da string de conexão com que o pg decide o TLS por cima da config
 * (pg-connection-string): `?sslmode=no-verify` ou `?ssl=true` desligariam a
 * conferência do certificado sem erro nenhum.
 */
const PARAMETROS_DE_TLS = [
  'ssl',
  'sslmode',
  'sslrootcert',
  'sslcert',
  'sslkey',
  'sslnegotiation',
  'uselibpqcompat',
];

export interface TlsVerificado {
  ca: string;
  rejectUnauthorized: true;
}

/**
 * Opção `ssl` do pg para conexão com TLS: certificado conferido contra a CA do
 * Supabase e pelo nome do host (o pg passa o host como servername). Recusa a
 * string de conexão que traz parâmetro de TLS, porque ele valeria no lugar
 * desta opção. O erro não inclui a string, que tem a senha.
 */
export function tlsVerificado(url: string): TlsVerificado {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new Error('A string de conexão com o banco não é uma URL postgresql:// válida.');
  }
  const achados = PARAMETROS_DE_TLS.filter((p) => u.searchParams.has(p));
  if (achados.length > 0) {
    throw new Error(
      `A string de conexão com o banco traz ${achados.join(', ')}. Remova: o TLS é definido ` +
        'pelo HubKeep (certificado conferido contra a CA do Supabase), não pela URL.',
    );
  }
  return { ca: CA_DO_SUPABASE, rejectUnauthorized: true };
}
