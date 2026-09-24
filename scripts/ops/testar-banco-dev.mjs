#!/usr/bin/env node
// Roda os testes pgTAP de supabase/tests/database contra o projeto Supabase de
// dev (HubKeep-dev), pelo Session pooler, sem Docker (ADR-015).
//
//   DEV_SESSION_POOLER=<string do botão Connect → Session pooler>  (variável de ambiente)
//   node scripts/ops/testar-banco-dev.mjs
//
// A string de conexão contém a senha. Ela nunca vai para o argv do psql (fica
// visível na lista de processos) nem para a saída: é desmontada aqui e entregue
// pelas variáveis PG* que o libpq lê sozinho. Os testes abrem transação e fazem
// rollback; não deixam dado no banco.
//
// Sai com código 1 se algum teste falhar, se o total de "ok" não bater com o
// plano declarado (1..N) ou se o psql abortar.
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const DIR_TESTES = 'supabase/tests/database';

function localizarPsql() {
  if (process.env.PSQL) return process.env.PSQL;
  const windows = 'C:\\Program Files\\PostgreSQL\\17\\bin\\psql.exe';
  return process.platform === 'win32' && existsSync(windows) ? windows : 'psql';
}

function ambienteDeConexao() {
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
  if (!url.hostname.endsWith('.pooler.supabase.com') || url.port !== '5432') {
    // Session pooler = porta 5432 no host *.pooler.supabase.com. O Transaction
    // pooler (6543) não serve: os testes usam SET LOCAL ROLE dentro da transação.
    console.error(
      'DEV_SESSION_POOLER não parece ser o Session pooler (host *.pooler.supabase.com, porta 5432).',
    );
    process.exit(2);
  }
  return {
    ...process.env,
    PGHOST: url.hostname,
    PGPORT: url.port,
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGDATABASE: decodeURIComponent(url.pathname.replace(/^\//, '')) || 'postgres',
    PGSSLMODE: 'require',
    PGAPPNAME: 'hubkeep-testar-banco-dev',
    DEV_SESSION_POOLER: '',
  };
}

function rodar(psql, env, arquivo) {
  const r = spawnSync(psql, ['-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1', '-f', arquivo], {
    env,
    encoding: 'utf8',
  });
  if (r.error) throw r.error;
  const linhas = r.stdout
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter(Boolean);
  const plano = linhas.map((l) => /^1\.\.(\d+)$/.exec(l)).find(Boolean);
  const oks = linhas.filter((l) => /^ok \d+/.test(l)).length;
  const falhas = linhas.filter((l) => /^not ok \d+/.test(l));
  for (const l of linhas) if (/^(not )?ok \d+|^#|^1\.\./.test(l)) console.log(`  ${l}`);
  const erros = r.stderr.split(/\r?\n/).filter((l) => l && !/NOTICE:/.test(l));
  for (const l of erros) console.error(`  ${l}`);
  const esperado = plano ? Number(plano[1]) : null;
  const passou = r.status === 0 && esperado !== null && falhas.length === 0 && oks === esperado;
  return { passou, oks, esperado, falhas: falhas.length };
}

const psql = localizarPsql();
const env = ambienteDeConexao();
const arquivos = readdirSync(DIR_TESTES)
  .filter((f) => f.endsWith('.test.sql'))
  .sort();

let total = 0;
let falhou = false;
for (const f of arquivos) {
  console.log(`# ${f}`);
  const r = rodar(psql, env, join(DIR_TESTES, f));
  total += r.oks;
  console.log(
    `# ${r.passou ? 'PASSOU' : 'FALHOU'}: ${r.oks}/${r.esperado ?? '?'} ok, ${r.falhas} falha(s)\n`,
  );
  if (!r.passou) falhou = true;
}
console.log(`${falhou ? 'FALHOU' : 'PASSOU'} — ${total} testes ok em ${arquivos.length} arquivos`);
process.exit(falhou ? 1 : 0);
