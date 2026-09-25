// Leitura da configuração do projeto Supabase remoto pela Management API — o
// ÚNICO caminho para isso (regra do incidente 2, docs/diario-fase-0.md).
//
//   pnpm ops:config-remota --ambiente dev [--endpoint auth|postgrest|storage|rede|ssl|chaves|pooler]
//
// Regras:
//   - só GET; nada aqui escreve no remoto;
//   - a resposta nunca é impressa nem gravada inteira: cada endpoint declara a
//     lista de campos que pode sair (allowlist), e o resto é descartado no
//     mesmo processo, sem passar por arquivo. Nunca se filtra por exclusão;
//   - endpoints que devolvem segredo (postgrest traz o jwt_secret; config/auth
//     traz senha SMTP e segredos de hooks, SMS e provedores) seguem a mesma
//     regra: o segredo não entra em nenhuma lista;
//   - o access token vem de SUPABASE_ACCESS_TOKEN e não é impresso; erro HTTP
//     mostra só o status, nunca o corpo;
//   - só o ambiente dev: o access token pessoal não é usado em staging nem em
//     produção (F0-12).
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

interface Endpoint {
  caminho: (ref: string) => string;
  /** Campos que podem sair, em notação de ponto. */
  campos: readonly string[];
  /** A resposta é uma lista (ou `{ keys: [...] }`): os campos valem por item. */
  lista?: boolean;
  /** Campos derivados, calculados em memória (ex.: hash de um template longo). */
  derivados?: Record<string, (resposta: Record<string, unknown>) => unknown>;
}

const sha256 = (v: unknown) =>
  typeof v === 'string' ? createHash('sha256').update(v).digest('hex') : null;

export type NomeDoEndpoint =
  'auth' | 'postgrest' | 'storage' | 'rede' | 'ssl' | 'chaves' | 'pooler';

export const ENDPOINTS: Record<NomeDoEndpoint, Endpoint> = {
  auth: {
    caminho: (ref) => `/v1/projects/${ref}/config/auth`,
    campos: [
      'site_url',
      'uri_allow_list',
      'disable_signup',
      'external_email_enabled',
      'external_phone_enabled',
      'external_anonymous_users_enabled',
      'mfa_totp_enroll_enabled',
      'mfa_totp_verify_enabled',
      'mfa_phone_enroll_enabled',
      'mfa_phone_verify_enabled',
      'mailer_autoconfirm',
      'mailer_secure_email_change_enabled',
      'mailer_otp_length',
      'mailer_otp_exp',
      'mailer_subjects_invite',
      'smtp_max_frequency',
      'jwt_exp',
      'refresh_token_rotation_enabled',
      'security_refresh_token_reuse_interval',
      'security_manual_linking_enabled',
      'security_update_password_require_reauthentication',
      'password_min_length',
      'password_required_characters',
      'rate_limit_email_sent',
      'sms_provider',
    ],
    derivados: {
      // O template é longo; o hash basta para comparar com supabase/templates/convite.html.
      mailer_templates_invite_content_sha256: (r) => sha256(r['mailer_templates_invite_content']),
    },
  },
  postgrest: {
    caminho: (ref) => `/v1/projects/${ref}/postgrest`,
    campos: ['db_schema', 'db_extra_search_path', 'max_rows', 'db_pool'],
  },
  storage: {
    caminho: (ref) => `/v1/projects/${ref}/config/storage`,
    campos: [
      'fileSizeLimit',
      'features.imageTransformation.enabled',
      'features.s3Protocol.enabled',
      'features.icebergCatalog.enabled',
      'features.vectorBuckets.enabled',
    ],
  },
  rede: {
    caminho: (ref) => `/v1/projects/${ref}/network-restrictions`,
    campos: ['status', 'config.dbAllowedCidrs', 'config.dbAllowedCidrsV6'],
  },
  ssl: {
    caminho: (ref) => `/v1/projects/${ref}/ssl-enforcement`,
    campos: ['currentConfig.database', 'appliedSuccessfully'],
  },
  chaves: {
    caminho: (ref) => `/v1/projects/${ref}/config/auth/signing-keys`,
    campos: ['id', 'algorithm', 'status', 'created_at', 'updated_at'],
    lista: true,
  },
  pooler: {
    caminho: (ref) => `/v1/projects/${ref}/config/database/pooler`,
    campos: [
      'database_type',
      'pool_mode',
      'default_pool_size',
      'max_client_conn',
      'db_port',
      'is_using_scram_auth',
    ],
    lista: true,
  },
};

function pegar(obj: unknown, caminho: string): unknown {
  let atual: unknown = obj;
  for (const parte of caminho.split('.')) {
    if (atual === null || typeof atual !== 'object') return undefined;
    atual = (atual as Record<string, unknown>)[parte];
  }
  return atual;
}

function filtrarObjeto(obj: unknown, ep: Endpoint): Record<string, unknown> {
  const saida: Record<string, unknown> = {};
  for (const campo of ep.campos) {
    const v = pegar(obj, campo);
    if (v !== undefined) saida[campo] = v;
  }
  for (const [nome, calcular] of Object.entries(ep.derivados ?? {})) {
    saida[nome] = calcular((obj ?? {}) as Record<string, unknown>);
  }
  return saida;
}

/** Aplica a allowlist do endpoint. Tudo o que não está na lista é descartado. */
export function filtrar(nome: NomeDoEndpoint, resposta: unknown): unknown {
  const ep = ENDPOINTS[nome];
  if (!ep.lista) return filtrarObjeto(resposta, ep);
  const itens = Array.isArray(resposta)
    ? resposta
    : ((resposta as { keys?: unknown[] } | null)?.keys ?? []);
  return itens.map((item) => filtrarObjeto(item, ep));
}

function refDoDev(): string {
  // O project_id do dev é o do bloco [remotes.dev] do config.toml (PR #10).
  const toml = readFileSync(new URL('../../supabase/config.toml', import.meta.url), 'utf8');
  const bloco = /\[remotes\.dev\][^[]*?project_id\s*=\s*"([a-z]{20})"/.exec(toml);
  if (!bloco?.[1]) throw new Error('project_id de [remotes.dev] não encontrado no config.toml.');
  return bloco[1];
}

async function principal(argv: string[]): Promise<void> {
  const i = argv.indexOf('--ambiente');
  if (argv[i + 1] !== 'dev') {
    throw new Error(
      'Só --ambiente dev: o access token pessoal não é usado em staging nem em produção (F0-12).',
    );
  }
  const j = argv.indexOf('--endpoint');
  const pedido = j >= 0 ? argv[j + 1] : undefined;
  const nomes = (Object.keys(ENDPOINTS) as NomeDoEndpoint[]).filter(
    (n) => pedido === undefined || n === pedido,
  );
  if (!nomes.length) {
    throw new Error(`Endpoint desconhecido. Use: ${Object.keys(ENDPOINTS).join(', ')}.`);
  }
  const token = process.env['SUPABASE_ACCESS_TOKEN'];
  if (!token) throw new Error('SUPABASE_ACCESS_TOKEN não está definida.');

  const ref = refDoDev();
  const saida: Record<string, unknown> = { projeto: ref };
  for (const nome of nomes) {
    const r = await fetch(`https://api.supabase.com${ENDPOINTS[nome].caminho(ref)}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });
    // Corpo de erro não é impresso: pode ecoar o pedido ou dados do projeto.
    saida[nome] = r.ok ? filtrar(nome, await r.json()) : { erro_http: r.status };
  }
  console.log(JSON.stringify(saida, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  principal(process.argv.slice(2)).catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : 'falhou');
    process.exit(1);
  });
}
