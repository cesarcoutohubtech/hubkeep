#!/usr/bin/env node
// Identificação de hotéis fictícios do HubKeep-dev para o ensaio Mews Demo.
// EXCLUSIVAMENTE LEITURA. Não escolhe hotel, não cria vínculo e não faz sync.
// Sem nomes de usuários, e-mails, EnterpriseId, tokens ou credencial_ref.
// Somente o operador local com DEV_SESSION_POOLER pode executar este script.
import pg from 'pg';
import { conexaoDono, lerArgs } from './ambiente.ts';

const argv = process.argv.slice(2);
if (argv.length !== 2 || argv[0] !== '--ambiente' || argv[1] !== 'dev') {
  throw new Error('Use apenas --ambiente dev. Nenhuma conexão foi aberta.');
}
const { ambiente } = lerArgs(argv, ['dev']);

const LIMITE = 20;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const limpar = (texto) =>
  String(texto ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 75);
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
      [LIMITE + 1],
    );
    if (r.rows.length > LIMITE) {
      throw new Error('muitos_candidatos');
    }
    console.log(`Hotéis encontrados no dev (máximo ${LIMITE}): ${r.rows.length}`);
    for (const row of r.rows) {
      if (!UUID.test(row.hotel_id) || !UUID.test(row.tenant_id)) {
        throw new Error('identificador_invalido');
      }
      const elegivel = row.hotel_ficticio === true &&
        row.status === 'ativo' && row.possui_vinculo === false;
      console.log(`\nGrupo: ${limpar(row.grupo)}`);
      console.log(`Hotel: ${limpar(row.hotel)}`);
      console.log(`tenant_id: ${row.tenant_id}`);
      console.log(`hotel_id: ${row.hotel_id}`);
      console.log(`Status: ${limpar(row.status)}`);
      console.log(`Vínculo Mews: ${row.vinculo_ativo ? 'ativo' :
        row.possui_vinculo ? 'existente (não ativo)' : 'inexistente'}`);
      console.log(`Candidato: ${elegivel ? 'SIM, sujeito à seleção humana' : 'NÃO, exige revisão'}`);
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
