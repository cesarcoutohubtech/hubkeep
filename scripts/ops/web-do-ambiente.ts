// Variáveis do web de um ambiente, para os scripts que rodam os casos de uso
// da aplicação pelo vitest (kit de teste e provisionamento). Lê o arquivo do
// ambiente (apps/web/.env.local no dev, apps/web/.env.staging.local no
// staging) e confere, antes de qualquer conexão, que as strings dos papéis e
// a URL do Supabase são do mesmo projeto que o ref de [remotes.<ambiente>]:
// uma variável de outro ambiente esquecida no arquivo para tudo aqui.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ClientConfig } from 'pg';
import { ARQUIVO_DA_CA, type Ambiente, refEsperado } from './ambiente.ts';

export const RAIZ = join(import.meta.dirname, '..', '..');

export const ARQUIVO_DO_WEB: Partial<Record<Ambiente, string>> = {
  dev: 'apps/web/.env.local',
  staging: 'apps/web/.env.staging.local',
};

export function exigir(nome: string): string {
  const v = process.env[nome];
  if (!v) throw new Error(`${nome} não está definida. Veja docs/10-kit-de-teste.md.`);
  return v;
}

/** Carrega o arquivo do web do ambiente e confere o projeto de cada conexão. Devolve o ref. */
export function carregarWebDoAmbiente(ambiente: Ambiente): string {
  const arquivo = ARQUIVO_DO_WEB[ambiente];
  if (!arquivo) throw new Error(`Sem arquivo do web para ${ambiente}.`);
  const caminho = join(RAIZ, arquivo);
  if (existsSync(caminho)) process.loadEnvFile(caminho);
  const ref = refEsperado(ambiente);
  if (!ref) throw new Error(`Sem ref para conferir o ${ambiente}. Nada foi gravado.`);
  for (const nome of ['DATABASE_URL_APP', 'DATABASE_URL_WORKER', 'DATABASE_URL_INGESTAO']) {
    const usuario = decodeURIComponent(new URL(exigir(nome)).username);
    if (!usuario.endsWith(`.${ref}`)) {
      throw new Error(`${nome} não é do ${ambiente} (usuário sem o ref ${ref}). Nada foi gravado.`);
    }
  }
  if (new URL(exigir('NEXT_PUBLIC_SUPABASE_URL')).hostname !== `${ref}.supabase.co`) {
    throw new Error(`NEXT_PUBLIC_SUPABASE_URL não é do ${ambiente}. Nada foi gravado.`);
  }
  return ref;
}

/** A string do dono para o pg, com o certificado conferido contra a CA do Supabase (ADR-032). */
export function urlDoDonoComCa(dono: ClientConfig): string {
  const u = new URL('postgresql://h');
  u.hostname = String(dono.host);
  u.port = String(dono.port);
  u.username = encodeURIComponent(String(dono.user));
  u.password = encodeURIComponent(String(dono.password));
  u.pathname = `/${String(dono.database)}`;
  u.searchParams.set('sslmode', 'verify-full');
  u.searchParams.set('sslrootcert', fileURLToPath(ARQUIVO_DA_CA));
  return u.toString();
}

/** Roda um arquivo de execução do web pelo vitest, com a config dada, e devolve o código de saída. */
export function rodarNoWeb(config: string, env: Record<string, string>): number {
  const r = spawnSync(
    process.execPath,
    [
      join(RAIZ, 'apps/web/node_modules/vitest/vitest.mjs'),
      'run',
      '--config',
      config,
      '--root',
      join(RAIZ, 'apps/web'),
    ],
    { stdio: 'inherit', env: { ...process.env, ...env } },
  );
  return r.status ?? 1;
}
