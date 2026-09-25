// Resolução de ambiente para os scripts de operação de papéis de banco.
//
// Nenhuma credencial entra por argumento de linha de comando: tudo vem de
// variável de ambiente, e nada daqui imprime senha. `descrever()` mostra o alvo
// (host, porta, usuário, banco) para quem roda conferir antes de aplicar.
//
// Cada script declara no topo os ambientes em que roda (AMBIENTES_PERMITIDOS) e
// os passa a lerArgs. Antes de qualquer conexão, conexaoDono confere que a
// string de conexão é mesmo do ambiente pedido (conferirAlvo): o nome da
// variável não prova nada — a string do staging colada em DEV_SESSION_POOLER
// faria um script de fixture gravar e apagar no staging achando que é o dev.
import { readFileSync } from 'node:fs';
import type { ClientConfig } from 'pg';

export const AMBIENTES = ['dev', 'staging', 'producao', 'ci'] as const;
export type Ambiente = (typeof AMBIENTES)[number];

export const PAPEIS_COM_LOGIN = ['hk_app', 'hk_worker', 'hk_ingestao'] as const;
export const PAPEIS_SEM_LOGIN = ['hk_backoffice', 'hk_authz'] as const;
export type PapelComLogin = (typeof PAPEIS_COM_LOGIN)[number];

/** Variável com a string de conexão do dono (postgres) em cada ambiente. */
export const CONEXAO_DONO: Record<Ambiente, string> = {
  dev: 'DEV_SESSION_POOLER',
  staging: 'DATABASE_URL_OWNER',
  producao: 'DATABASE_URL_OWNER',
  ci: 'CI_DATABASE_URL_OWNER',
};

/** HK_APP_SENHA_DEV, HK_WORKER_SENHA_STAGING, ... */
export const variavelSenha = (papel: PapelComLogin, amb: Ambiente) =>
  `${papel.toUpperCase()}_SENHA_${amb.toUpperCase()}`;

/**
 * Lê `--ambiente` e recusa o que não está na lista do script. `padrao` só para
 * script de um ambiente só, que roda sem o argumento (testar-banco-dev).
 */
export function lerArgs(
  argv: string[],
  permitidos: readonly Ambiente[],
  padrao?: Ambiente,
): {
  ambiente: Ambiente;
  dryRun: boolean;
  producao: boolean;
} {
  const i = argv.indexOf('--ambiente');
  const amb = i >= 0 ? argv[i + 1] : padrao;
  const ambiente = permitidos.find((p) => p === amb);
  if (!ambiente) {
    const conhecido = AMBIENTES.some((a) => a === amb);
    throw new Error(
      `${conhecido ? `Este script não roda em ${amb}. ` : ''}Informe --ambiente ${permitidos.join('|')}.`,
    );
  }
  return {
    ambiente,
    dryRun: argv.includes('--dry-run'),
    producao: argv.includes('--confirmar-producao'),
  };
}

const HOSTS_LOCAIS = new Set(['localhost', '127.0.0.1', '::1']);
const hostLocal = (host: string) => HOSTS_LOCAIS.has(host.toLowerCase().replace(/^\[|\]$/g, ''));

/**
 * Project ref do HubKeep-dev: o `project_id` do bloco `[remotes.dev]` do
 * supabase/config.toml. Lido do arquivo, e não fixado aqui, para haver uma
 * fonte só — a mesma que a CLI usa para saber qual remoto é o dev.
 */
export function refDoDevNoConfig(toml: string): string {
  let noBloco = false;
  // O trim() também tira o fim de linha CRLF de um config.toml salvo no Windows.
  for (const linha of toml.split('\n')) {
    const t = linha.trim();
    if (t.startsWith('[')) noBloco = t === '[remotes.dev]';
    else if (noBloco) {
      const m = /^project_id\s*=\s*"([^"]*)"/.exec(t);
      if (m) {
        const ref = m[1] ?? '';
        if (!/^[a-z]{20}$/.test(ref)) {
          throw new Error('project_id de [remotes.dev] no config.toml não é um project ref.');
        }
        return ref;
      }
    }
  }
  throw new Error('project_id de [remotes.dev] não encontrado no supabase/config.toml.');
}

export const lerRefDoDev = () =>
  refDoDevNoConfig(readFileSync(new URL('../../supabase/config.toml', import.meta.url), 'utf8'));

/**
 * Confere, sem conectar, que a string de conexão é do ambiente pedido:
 *   - ci: Postgres local do runner. É o ambiente sem TLS e o que grava
 *     fixtures à vontade; apontado para fora, faria as duas coisas num banco
 *     de verdade.
 *   - dev: o usuário (`postgres.<ref>` no Supavisor) ou o host
 *     (`db.<ref>.supabase.co`) contém o ref do dev. A senha fica fora da busca.
 *   - staging e producao: sem ref no config.toml ainda (F0-12); produção
 *     continua exigindo --confirmar-producao (exigirConfirmacaoProducao).
 * As mensagens nunca incluem a string de conexão, que tem a senha.
 */
export function conferirAlvo(
  amb: Ambiente,
  nomeVar: string,
  bruta: string,
  refDev: string | undefined,
): void {
  let u: URL;
  try {
    u = new URL(bruta);
  } catch {
    throw new Error(`${nomeVar} não é uma URL postgresql:// válida.`);
  }
  if (amb === 'ci' && !hostLocal(u.hostname)) {
    throw new Error(
      `${nomeVar} precisa apontar para o Postgres local da CI (localhost, 127.0.0.1 ou ::1). Nada foi conectado.`,
    );
  }
  if (amb === 'dev') {
    if (!refDev) throw new Error('Ref do dev não informado para conferir o alvo.');
    const usuario = decodeURIComponent(u.username);
    if (!usuario.includes(refDev) && !u.hostname.includes(refDev)) {
      throw new Error(
        `${nomeVar} não é do HubKeep-dev: a string de conexão não contém o ref ${refDev} ` +
          '([remotes.dev] project_id em supabase/config.toml). Nada foi conectado.',
      );
    }
  }
}

function lerUrl(amb: Ambiente): URL {
  const nomeVar = CONEXAO_DONO[amb];
  const bruta = process.env[nomeVar];
  if (!bruta) throw new Error(`${nomeVar} não está definida.`);
  conferirAlvo(amb, nomeVar, bruta, amb === 'dev' ? lerRefDoDev() : undefined);
  return new URL(bruta);
}

const ssl = (amb: Ambiente): ClientConfig['ssl'] =>
  // O Supabase exige TLS no pooler. A CA do Supabase não está na cadeia do
  // Node; fixar essa CA é tarefa da F0-12 (ambientes).
  amb === 'ci' ? false : { rejectUnauthorized: false };

/**
 * Conexão do dono, usada para ALTER ROLE e para as fixtures da verificação.
 * Toda conexão dos scripts passa por aqui (conexaoPapel também), então é aqui
 * que o alvo é conferido.
 */
export function conexaoDono(amb: Ambiente): ClientConfig {
  const u = lerUrl(amb);
  return {
    host: u.hostname,
    port: Number(u.port || 5432),
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: decodeURIComponent(u.pathname.slice(1)) || 'postgres',
    ssl: ssl(amb),
    application_name: 'hubkeep-ops-papeis',
  };
}

/**
 * Conexão de um papel da aplicação. Nos ambientes Supabase, é o Supavisor em
 * modo transação (porta 6543, usuário `<papel>.<ref>`), exatamente como a API
 * vai conectar. Na CI não há Supavisor: conexão direta ao Postgres do runner.
 */
export function conexaoPapel(amb: Ambiente, papel: string, senha: string): ClientConfig {
  const dono = conexaoDono(amb);
  if (amb === 'ci') return { ...dono, user: papel, password: senha };
  const usuarioDono = String(dono.user);
  const ref = usuarioDono.startsWith('postgres.') ? usuarioDono.slice('postgres.'.length) : '';
  if (!ref || !String(dono.host).endsWith('.pooler.supabase.com')) {
    throw new Error(
      `${CONEXAO_DONO[amb]} precisa ser a string do Supavisor (usuário postgres.<ref>, host *.pooler.supabase.com).`,
    );
  }
  return { ...dono, port: 6543, user: `${papel}.${ref}`, password: senha };
}

export const descrever = (c: ClientConfig) =>
  `${String(c.user)}@${String(c.host)}:${String(c.port)}/${String(c.database)}`;

export function exigirConfirmacaoProducao(amb: Ambiente, confirmado: boolean): void {
  if (amb === 'producao' && !confirmado) {
    throw new Error(
      'Produção exige --confirmar-producao, e só roda com autorização explícita do Cesar na sessão.',
    );
  }
}
