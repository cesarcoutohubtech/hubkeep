#!/usr/bin/env node
// Pré-voo Mews V1 no HubKeep-dev: somente SELECT em transação READ ONLY.
// Não usa credenciais de aplicação privilegiadas, não faz db push, DDL, fixture, teste com escrita,
// nem imprime senha, URL ou identificadores de hotéis e de usuários.
//
// Uso: node --experimental-strip-types --no-warnings=ExperimentalWarning
//      scripts/ops/mews-preflight-dev.mjs --ambiente dev
// Requer DEV_SESSION_POOLER (veja docs/06-setup-supabase-dev.md).
import pg from 'pg';
import { conexaoDono, lerArgs } from './ambiente.ts';

const MIGRACOES = [
  ['20261017183000', '0054: persistência Mews'],
  ['20261017230500', '0055: lock de worker'],
  ['20261018010500', '0056: leitura administrativa'],
];
const TABELAS = ['mews_vinculo', 'mews_checkpoint', 'mews_recurso', 'mews_bloqueio'];
const PROJECOES = ['mews_checkpoint', 'mews_recurso', 'mews_bloqueio'];
const COLUNAS_PERMITIDAS = [
  ['mews_checkpoint', 'versao'],
  ['mews_checkpoint', 'ultimo_updated_utc'],
  ['mews_checkpoint', 'ultimo_sweep_utc'],
  ['mews_checkpoint', 'concluido_em'],
  ['mews_recurso', 'ativo'],
  ['mews_bloqueio', 'tipo'],
  ['mews_bloqueio', 'ativo'],
];
const COLUNAS_PROIBIDAS = [
  ['mews_vinculo', 'credencial_ref'],
  ['mews_checkpoint', 'digest_incremental'],
  ['mews_checkpoint', 'digest_sweep'],
  ['mews_checkpoint', 'enterprise_id'],
  ['mews_recurso', 'enterprise_id'],
  ['mews_recurso', 'resource_id'],
  ['mews_bloqueio', 'enterprise_id'],
  ['mews_bloqueio', 'resource_id'],
  ['mews_bloqueio', 'block_id'],
  ['mews_bloqueio', 'inicio_utc'],
  ['mews_bloqueio', 'fim_utc'],
];

const { ambiente } = lerArgs(process.argv.slice(2), ['dev']);
const resultados = [];
function registrar(ok, descricao) {
  resultados.push({ ok, descricao });
  console.log(`${ok ? 'OK' : 'FALHOU'} — ${descricao}`);
}
function erroSeguro(e) {
  return typeof e?.code === 'string' ? e.code : 'falha_de_conexao_ou_consulta';
}

async function executar() {
  // A função comum valida o project ref de [remotes.dev] antes de conectar.
  const config = conexaoDono(ambiente);
  const cliente = new pg.Client({
    ...config,
    application_name: 'hubkeep-mews-preflight-readonly',
    connectionTimeoutMillis: 12000,
    query_timeout: 12000,
  });
  let abriu = false;
  try {
    await cliente.connect();
    await cliente.query('BEGIN TRANSACTION READ ONLY');
    abriu = true;
    await cliente.query("SET LOCAL statement_timeout = '10000ms'");

    const historico = await cliente.query(
      'select version from supabase_migrations.schema_migrations where version = any($1::text[])',
      [MIGRACOES.map(([versao]) => versao)],
    );
    const presentes = new Set(historico.rows.map((r) => r.version));
    for (const [versao, descricao] of MIGRACOES) {
      registrar(
        presentes.has(versao),
        `Migração ${descricao} (${versao}) consta no histórico remoto`,
      );
    }
    if (presentes.size !== MIGRACOES.length) {
      console.log(
        'Ambiente ainda não preparado: verificações de privilégios não foram executadas.',
      );
      return;
    }

    const rls = await cliente.query(
      `select c.relname as tabela, c.relrowsecurity as rls,
              c.relforcerowsecurity as rls_forcada
         from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'app' and c.relname = any($1::text[])
          and c.relkind in ('r', 'p')`,
      [TABELAS],
    );
    const porTabela = new Map(rls.rows.map((r) => [r.tabela, r]));
    for (const tabela of TABELAS) {
      const r = porTabela.get(tabela);
      registrar(r?.rls === true && r?.rls_forcada === true, `RLS ENABLE/FORCE: app.${tabela}`);
    }

    const policies = await cliente.query(
      `select tablename, roles from pg_policies
        where schemaname = 'app' and policyname = 'app_admin_select'
          and tablename = any($1::text[])`,
      [PROJECOES],
    );
    const porPolicy = new Map(policies.rows.map((r) => [r.tablename, r.roles]));
    for (const tabela of PROJECOES) {
      const roles = porPolicy.get(tabela);
      registrar(
        Array.isArray(roles) && roles.includes('hk_app'),
        `Policy de leitura Admin: app.${tabela}`,
      );
    }

    for (const [tabela, coluna] of COLUNAS_PERMITIDAS) {
      const p = await cliente.query('select has_column_privilege($1, $2, $3, $4) as liberado', [
        'hk_app',
        `app.${tabela}`,
        coluna,
        'SELECT',
      ]);
      registrar(p.rows[0]?.liberado === true, `Leitura permitida: ${tabela}.${coluna}`);
    }
    for (const [tabela, coluna] of COLUNAS_PROIBIDAS) {
      const p = await cliente.query('select has_column_privilege($1, $2, $3, $4) as liberado', [
        'hk_app',
        `app.${tabela}`,
        coluna,
        'SELECT',
      ]);
      registrar(p.rows[0]?.liberado === false, `Leitura negada: ${tabela}.${coluna}`);
    }
    for (const tabela of PROJECOES) {
      const p = await cliente.query(
        `select has_table_privilege('hk_app', $1, 'INSERT') as ins,
                has_table_privilege('hk_app', $1, 'UPDATE') as upd,
                has_table_privilege('hk_app', $1, 'DELETE') as del`,
        [`app.${tabela}`],
      );
      const r = p.rows[0];
      registrar(
        r?.ins === false && r?.upd === false && r?.del === false,
        `Sem escrita hk_app: app.${tabela}`,
      );
    }

    const esquema = await cliente.query(
      `select has_schema_privilege('anon', 'app', 'USAGE') as anon,
              has_schema_privilege('authenticated', 'app', 'USAGE') as autenticado`,
    );
    registrar(
      esquema.rows[0]?.anon === false && esquema.rows[0]?.autenticado === false,
      'Sem acesso aos schemas app por anon/authenticated',
    );
  } catch (e) {
    registrar(false, `Consulta read-only interrompida (código: ${erroSeguro(e)})`);
  } finally {
    if (abriu) {
      try {
        await cliente.query('ROLLBACK');
      } catch {
        registrar(false, 'Falha ao encerrar transação read-only');
      }
    }
    await cliente.end().catch(() => {});
  }
}

try {
  await executar();
} catch (e) {
  registrar(false, `Falha ao iniciar diagnóstico (código: ${erroSeguro(e)})`);
}
const falhas = resultados.filter((r) => !r.ok).length;
console.log(
  `RESULTADO: ${falhas === 0 ? 'APROVADO' : 'PENDENTE'} — ${resultados.length - falhas}/${resultados.length} checks.`,
);
if (falhas > 0) process.exitCode = 1;
