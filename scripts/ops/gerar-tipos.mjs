// pnpm db:types: gera packages/db/src/tipos-banco.ts a partir do HubKeep-dev.
//
// O kysely-codegen tenta TLS sem conferir o certificado e, se o servidor
// recusar, cai para conexão sem TLS; o dev aceita as duas. Aqui a URL leva
// sslmode=verify-full e a CA do Supabase (ADR-032, condição 1), que o pg aplica
// por cima da opção do kysely-codegen: sem certificado conferido, não conecta.
// A URL (com a senha) vai por variável de ambiente, nunca pelo argv: o filho
// recebe DEV_SESSION_POOLER já com os parâmetros de TLS.
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const bruta = process.env.DEV_SESSION_POOLER;
if (!bruta) {
  console.error('DEV_SESSION_POOLER não está definida. Veja docs/06-setup-supabase-dev.md.');
  process.exit(2);
}
let url;
try {
  url = new URL(bruta);
} catch {
  console.error('DEV_SESSION_POOLER não é uma URL postgresql:// válida.');
  process.exit(2);
}
const pacote = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'packages', 'db');
url.searchParams.set('sslmode', 'verify-full');
url.searchParams.set('sslrootcert', join(pacote, 'certificados', 'supabase-root-2021-ca.crt'));

const require = createRequire(join(pacote, 'package.json'));
const bin = join(dirname(require.resolve('kysely-codegen/package.json')), 'dist/cli/bin.js');
const r = spawnSync(
  process.execPath,
  [
    bin,
    '--dialect',
    'postgres',
    '--url',
    'env(DEV_SESSION_POOLER)',
    '--include-pattern',
    '{app,staging,licenca}.*',
    '--out-file',
    'src/tipos-banco.ts',
    ...process.argv.slice(2),
  ],
  {
    cwd: pacote,
    stdio: 'inherit',
    env: { ...process.env, DEV_SESSION_POOLER: url.toString() },
  },
);
process.exit(r.status ?? 1);
