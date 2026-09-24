// Resolução de ambiente para os scripts de operação de papéis de banco.
//
// Nenhuma credencial entra por argumento de linha de comando: tudo vem de
// variável de ambiente, e nada daqui imprime senha. `descrever()` mostra o alvo
// (host, porta, usuário, banco) para quem roda conferir antes de aplicar.
import type { ClientConfig } from 'pg';

export type Ambiente = 'dev' | 'staging' | 'producao' | 'ci';

export const PAPEIS_COM_LOGIN = ['hk_app', 'hk_worker', 'hk_ingestao'] as const;
export const PAPEIS_SEM_LOGIN = ['hk_backoffice', 'hk_authz'] as const;
export type PapelComLogin = (typeof PAPEIS_COM_LOGIN)[number];

/** Variável com a string de conexão do dono (postgres) em cada ambiente. */
const CONEXAO_DONO: Record<Ambiente, string> = {
  dev: 'DEV_SESSION_POOLER',
  staging: 'DATABASE_URL_OWNER',
  producao: 'DATABASE_URL_OWNER',
  ci: 'CI_DATABASE_URL_OWNER',
};

/** HK_APP_SENHA_DEV, HK_WORKER_SENHA_STAGING, ... */
export const variavelSenha = (papel: PapelComLogin, amb: Ambiente) =>
  `${papel.toUpperCase()}_SENHA_${amb.toUpperCase()}`;

export function lerArgs(argv: string[]): {
  ambiente: Ambiente;
  dryRun: boolean;
  producao: boolean;
} {
  const i = argv.indexOf('--ambiente');
  const amb = i >= 0 ? argv[i + 1] : undefined;
  if (amb !== 'dev' && amb !== 'staging' && amb !== 'producao' && amb !== 'ci') {
    throw new Error('Informe --ambiente dev|staging|producao|ci.');
  }
  return {
    ambiente: amb,
    dryRun: argv.includes('--dry-run'),
    producao: argv.includes('--confirmar-producao'),
  };
}

function lerUrl(nomeVar: string): URL {
  const bruta = process.env[nomeVar];
  if (!bruta) throw new Error(`${nomeVar} não está definida.`);
  try {
    return new URL(bruta);
  } catch {
    throw new Error(`${nomeVar} não é uma URL postgresql:// válida.`);
  }
}

const ssl = (amb: Ambiente): ClientConfig['ssl'] =>
  // O Supabase exige TLS no pooler. A CA do Supabase não está na cadeia do
  // Node; fixar essa CA é tarefa da F0-12 (ambientes).
  amb === 'ci' ? false : { rejectUnauthorized: false };

/** Conexão do dono, usada para ALTER ROLE e para as fixtures da verificação. */
export function conexaoDono(amb: Ambiente): ClientConfig {
  const u = lerUrl(CONEXAO_DONO[amb]);
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
