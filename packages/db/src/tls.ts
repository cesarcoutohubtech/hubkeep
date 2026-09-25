// Decisão de TLS da conexão do app com o banco. Pura (sem IO) para ser testada
// sem banco e usada pela raiz de composição de cada app.
//
// O pooler do Supabase exige TLS. Sem TLS só existe um caso legítimo: a CI, que
// conecta ao Postgres do runner em 127.0.0.1. HK_BANCO_SEM_TLS=1 esquecido na
// Vercel ou copiado para uma máquina com a URL do dev mandaria senha e dados em
// claro pela internet, e tudo "funcionaria" sem erro nenhum. Por isso a flag só
// vale com host local; com host remoto, a inicialização falha.

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
