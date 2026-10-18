#!/usr/bin/env node
// Identificação de hotéis fictícios do HubKeep-dev para o ensaio Mews Demo.
// EXCLUSIVAMENTE LEITURA. Não escolhe hotel, não cria vínculo e não faz sync.
// Sem nomes de usuários, e-mails, EnterpriseId, tokens ou credencial_ref.
// Somente o operador local com DEV_SESSION_POOLER pode executar este script.
import pg from 'pg';
import { conexaoDono, lerArgs } from './ambiente.ts';
import { formatarCandidatoMews, LIMITE_CANDIDATOS } from './mews-candidatos-core.mjs';

const argv = process.argv.slice(2);
if (argv.length !== 2 || argv[0] !== '--ambiente' || argv[1] !== 'dev') {
  throw new Error('Use apenas --ambiente dev. Nenhuma conexão foi aberta.');
}
const { ambiente } = lerArgs(argv, ['dev']);

const codigoErro = (e) =>
  typeof e?.code === 'string' && /^[A-Z0-9]{5}$/.test(e.code) ? e.code : 'nao_disponivel';

async function executar() {
  // Guarda projeto [remotes.dev] executada ANTES de abrir conexão TLS.
  const config = conexaoDono(ambiente);
  const cliente = new pg.Client({
    ...config,
    application_name: 'hubkeep-mews-candidatos-readonly',
    connectionTimeoutMillis: 12000,
    query_timeout: 12000,
  });
  let iniciou = false;
  let sucesso = false;
  try {
    await cliente.connect();
    await cliente.query('BEGIN TRANSACTION READ ONLY');
    iniciou = true;
    await cliente.query("SET LOCAL statement_timeout = '10000ms'");
    const r = await cliente.query(
      `select h.id as hotel_id, h.tenant_id,
              h.nome as hotel, t.nome as grupo,
              h.status,
              (h.cod_externo like 'DEMO-%' or h.nome ~* '(demonstra|demo)') as hotel_ficticio,
              (v.id is not null) as possui_vinculo,
              (v.id is not null and v.revogado_em is null) as vinculo_ativo
         from app.hotel h
         join app.tenant t on t.id = h.tenant_id
         left join app.mews_vinculo v
           on v.tenant_id = h.tenant_id and v.hotel_id = h.id
        where h.cod_externo like 'DEMO-%'
           or h.nome ~* '(demonstra|demo)'
           or t.nome ~* '(demonstra|demo)'
        order by t.nome, h.nome, h.id
        limit $1`,
      [LIMITE_CANDIDATOS + 1],
    );
    if (r.rows.length > LIMITE_CANDIDATOS) {
      throw new Error('muitos_candidatos');
    }
    console.log(`Hotéis encontrados no dev (máximo ${LIMITE_CANDIDATOS}): ${r.rows.length}`);
    for (const row of r.rows) {
      const candidato = formatarCandidatoMews(row);
      console.log('\n' + candidato.linhas.join('\n'));
    }
    if (r.rows.length === 0) {
      console.log('Nenhum hotel fictício correspondente. Não criar nem alterar hotéis.');
    }
    console.log('\nNÃO cria vínculo, NÃO consulta Mews e NÃO altera o banco.');
    sucesso = true;
  } catch (e) {
    console.error(`PENDENTE — consulta somente leitura (código ${codigoErro(e)})`);
  } finally {
    if (iniciou) {
      try {
        await cliente.query('ROLLBACK');
      } catch {
        sucesso = false;
        console.error('PENDENTE — falha ao encerrar a transação somente leitura.');
      }
    }
    await cliente.end().catch(() => {});
  }
  if (!sucesso) process.exitCode = 1;
}

try {
  await executar();
} catch (e) {
  console.error(`PENDENTE — não foi possível iniciar (código ${codigoErro(e)})`);
  process.exitCode = 1;
}
