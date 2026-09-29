// Fumaça do packages/db num ambiente Supabase: roda a MESMA suíte de
// integração da CI (packages/db/test/integracao.test.ts), mas com hk_app e
// hk_worker entrando pelo Supavisor em modo transação (porta 6543), que é como
// a API vai conectar. Prova que withContext, a unit of work e a guarda de papel
// funcionam com a configuração de pool do pacote atrás do pooler.
//
//   pnpm db:fumaca --ambiente dev
//
// As senhas vêm de HK_APP_SENHA_<AMB>/HK_WORKER_SENHA_<AMB> e a conexão do dono
// da variável do ambiente (ambiente.ts). As URLs montadas aqui vão para o
// processo do vitest por variável de ambiente: nada em argv, nada na tela.
// A suíte grava uma fixture fictícia e a apaga no fim.
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ARQUIVO_DA_CA,
  type Ambiente,
  conexaoDono,
  conexaoPapel,
  descrever,
  lerArgs,
  variavelSenha,
} from './ambiente.ts';

// A suíte grava e apaga fixtures com o dono: só no dev, conferido pelo ref de
// [remotes.dev] antes de conectar (conexaoDono). Na CI a mesma suíte já roda
// direto, sem Supavisor. Staging fica para a F0-12 (pendência em docs/04);
// produção, nunca.
const AMBIENTES_PERMITIDOS: readonly Ambiente[] = ['dev'];

function url(c: ReturnType<typeof conexaoDono>): string {
  const u = new URL('postgresql://h');
  u.hostname = String(c.host);
  u.port = String(c.port);
  u.username = encodeURIComponent(String(c.user));
  u.password = encodeURIComponent(String(c.password));
  u.pathname = `/${String(c.database)}`;
  // Certificado conferido contra a CA do Supabase e pelo nome do host (ADR-032).
  // Os testes montam o pool sem a opção ssl, então vale o que a URL diz.
  u.searchParams.set('sslmode', 'verify-full');
  u.searchParams.set('sslrootcert', fileURLToPath(ARQUIVO_DA_CA));
  return u.toString();
}

const { ambiente } = lerArgs(process.argv.slice(2), AMBIENTES_PERMITIDOS);

const senha = (papel: 'hk_app' | 'hk_worker') => {
  const v = process.env[variavelSenha(papel, ambiente)];
  if (!v) throw new Error(`${variavelSenha(papel, ambiente)} não está definida.`);
  return v;
};

const app = conexaoPapel(ambiente, 'hk_app', senha('hk_app'));
const worker = conexaoPapel(ambiente, 'hk_worker', senha('hk_worker'));
console.log(`Ambiente: ${ambiente}`);
console.log(`hk_app:    ${descrever(app)}`);
console.log(`hk_worker: ${descrever(worker)}\n`);

const raiz = join(import.meta.dirname, '..', '..');
const r = spawnSync(
  process.execPath,
  [
    join(raiz, 'packages/db/node_modules/vitest/vitest.mjs'),
    'run',
    '--reporter',
    'verbose',
    '--root',
    join(raiz, 'packages/db'),
  ],
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      HK_EXIGIR_BANCO: '1',
      HK_TESTE_VIA_POOLER: '1',
      HK_TESTE_URL_APP: url(app),
      HK_TESTE_URL_WORKER: url(worker),
      HK_TESTE_URL_DONO: url(conexaoDono(ambiente)),
    },
  },
);
process.exit(r.status ?? 1);
