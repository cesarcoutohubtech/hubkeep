// Dados de demonstração do kit de teste (docs/10-kit-de-teste.md), só no dev:
//
//   pnpm demo:dados --ambiente dev
//
// Lê o apps/web/.env.local (o mesmo do `pnpm dev`) e, do ambiente, a
// DEV_SESSION_POOLER (dono do banco, só para o tenant, a licença e o primeiro
// Admin) e a HK_DEMO_SENHA (senha de teste de todas as contas). Antes de
// conectar, confere que TODAS as conexões são do HubKeep-dev: a do dono pelo
// ref de [remotes.dev] (ambiente.ts), as dos papéis e a URL do Supabase pelo
// mesmo ref. Uma variável do staging esquecida no .env.local para tudo aqui.
//
// A gravação é do script apps/web/test/demonstracao/semear.ts, que usa os
// casos de uso da aplicação; aqui só se confere o alvo e se chama o vitest,
// como o db:fumaca. Nada em argv, nada de senha na tela.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ARQUIVO_DA_CA, type Ambiente, conexaoDono, lerArgs, lerRefDoDev } from './ambiente.ts';

const AMBIENTES_PERMITIDOS: readonly Ambiente[] = ['dev'];
const { ambiente } = lerArgs(process.argv.slice(2), AMBIENTES_PERMITIDOS);

const raiz = join(import.meta.dirname, '..', '..');
const envDoWeb = join(raiz, 'apps/web/.env.local');
if (existsSync(envDoWeb)) process.loadEnvFile(envDoWeb);

const exigir = (nome: string): string => {
  const v = process.env[nome];
  if (!v) throw new Error(`${nome} não está definida. Veja docs/10-kit-de-teste.md.`);
  return v;
};

const ref = lerRefDoDev();
const dono = conexaoDono(ambiente); // confere o ref antes de qualquer conexão
for (const nome of ['DATABASE_URL_APP', 'DATABASE_URL_WORKER', 'DATABASE_URL_INGESTAO']) {
  const usuario = decodeURIComponent(new URL(exigir(nome)).username);
  if (!usuario.endsWith(`.${ref}`)) {
    throw new Error(`${nome} não é do HubKeep-dev (usuário sem o ref ${ref}). Nada foi gravado.`);
  }
}
if (new URL(exigir('NEXT_PUBLIC_SUPABASE_URL')).hostname !== `${ref}.supabase.co`) {
  throw new Error(`NEXT_PUBLIC_SUPABASE_URL não é do HubKeep-dev. Nada foi gravado.`);
}
if (exigir('HK_DEMO_SENHA').length < 12) {
  throw new Error('HK_DEMO_SENHA precisa de pelo menos 12 caracteres.');
}

// Certificado conferido contra a CA do Supabase e pelo nome do host (ADR-032).
const urlDono = new URL('postgresql://h');
urlDono.hostname = String(dono.host);
urlDono.port = String(dono.port);
urlDono.username = encodeURIComponent(String(dono.user));
urlDono.password = encodeURIComponent(String(dono.password));
urlDono.pathname = `/${String(dono.database)}`;
urlDono.searchParams.set('sslmode', 'verify-full');
urlDono.searchParams.set('sslrootcert', fileURLToPath(ARQUIVO_DA_CA));

console.log(`Ambiente: ${ambiente} (ref ${ref})\n`);
const r = spawnSync(
  process.execPath,
  [
    join(raiz, 'apps/web/node_modules/vitest/vitest.mjs'),
    'run',
    '--config',
    'vitest.demonstracao.config.ts',
    '--root',
    join(raiz, 'apps/web'),
  ],
  {
    stdio: 'inherit',
    env: { ...process.env, HK_DEMO_URL_DONO: urlDono.toString() },
  },
);
process.exit(r.status ?? 1);
