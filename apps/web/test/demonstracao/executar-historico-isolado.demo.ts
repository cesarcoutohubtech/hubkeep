/**
 * Segundo histórico do Intelligence, somente no DEV.
 * --verificar é read-only. --executar exige tenant e contas V2 inexistentes.
 * Nenhum arquivo do gerador original é modificado.
 */
import pg from 'pg';
import { expect, it } from 'vitest';
import { TENANT_DO_HISTORICO, baseDoKit, gravarHistorico } from './gravacao-historico';
import { NOME_DO_GRUPO } from './historico-inteligencia';
import { IDENTIDADE_HISTORICO_V2 as V2, conferirIsolamentoV2 } from './isolamento-historico-v2';

const TABELAS = [
  'app.chamado',
  'app.os',
  'app.insight',
  'app.metrica_ativo_diaria',
  'app.membro',
  'licenca.modulo',
] as const;
type Contagens = Record<(typeof TABELAS)[number], number>;

function exigir(nome: string): string {
  const valor = process.env[nome];
  if (!valor) throw new Error(`Variável ausente: ${nome}. Nada foi gravado.`);
  return valor;
}

async function consultarAntigo(url: string): Promise<Contagens> {
  const banco = new pg.Client({ connectionString: url });
  await banco.connect();
  try {
    await banco.query('BEGIN READ ONLY');
    const contagens = {} as Contagens;
    for (const tabela of TABELAS) {
      const sql = `select count(*)::int as n from ${tabela} where tenant_id = $1`;
      const r = await banco.query<{ n: number }>(sql, [TENANT_DO_HISTORICO]);
      contagens[tabela] = r.rows[0]?.n ?? 0;
    }
    await banco.query('COMMIT');
    return contagens;
  } catch (erro) {
    await banco.query('ROLLBACK');
    throw erro;
  } finally {
    await banco.end();
  }
}

async function verificarAntes(url: string): Promise<Contagens> {
  conferirIsolamentoV2(TENANT_DO_HISTORICO);
  const banco = new pg.Client({ connectionString: url });
  await banco.connect();
  try {
    await banco.query('BEGIN READ ONLY');
    const sql = 'select nome from app.tenant where id = $1';
    const antigo = await banco.query(sql, [TENANT_DO_HISTORICO]);
    const novo = await banco.query(sql, [V2.tenantId]);
    const authSql = 'select count(*)::int as n from auth.users where lower(email) like $1';
    const auth = await banco.query<{ n: number }>(authSql, [`%@${V2.dominio}`]);
    await banco.query('COMMIT');

    if (!antigo.rows.length) {
      throw new Error('Tenant original não localizado em DEV. Nada foi gravado.');
    }
    if (novo.rows.length || (auth.rows[0]?.n ?? 0) !== 0) {
      throw new Error('Tenant ou contas V2 já existentes. Inspecionar antes de retomar.');
    }
  } catch (erro) {
    try {
      await banco.query('ROLLBACK');
    } catch {
      // Sem transação pendente se a conferência local falhou depois do COMMIT.
    }
    throw erro;
  } finally {
    await banco.end();
  }
  return consultarAntigo(url);
}

async function renomearNovo(url: string): Promise<void> {
  const banco = new pg.Client({ connectionString: url });
  await banco.connect();
  try {
    const sql = 'update app.tenant set nome = $1 where id = $2 and nome = $3 returning id';
    const parametros = [V2.nome, V2.tenantId, NOME_DO_GRUPO];
    const resultado = await banco.query(sql, parametros);
    if (resultado.rowCount !== 1) {
      throw new Error('Falha ao nomear grupo V2; verificar somente o novo tenant.');
    }
  } finally {
    await banco.end();
  }
}

it('histórico V2 isolado', { timeout: 8 * 3_600_000 }, async () => {
  const modo = exigir('HK_HISTORICO_V2_MODO');
  if (modo !== 'verificar' && modo !== 'executar') {
    throw new Error('Modo inválido. Use --verificar ou --executar.');
  }
  const url = exigir('HK_HISTORICO_V2_URL_DONO');
  const fim = exigir('HK_HISTORICO_V2_FIM');
  const antes = await verificarAntes(url);

  console.log(`Antigo intacto: ${JSON.stringify(antes)}`);
  console.log(`Tenant V2: ${V2.tenantId}; domínio: ${V2.dominio}.`);
  if (modo === 'verificar') {
    console.log('VERIFICAÇÃO APROVADA. Nenhum dado foi gravado.');
    return;
  }

  const resultado = await gravarHistorico({
    fim,
    tenantId: V2.tenantId,
    dominio: V2.dominio,
    urlDono: url,
    base: baseDoKit({
      senha: exigir('HK_DEMO_SENHA'),
      site: process.env['HK_URL_SITE'] ?? 'http://localhost:3000',
      log: (linha: string) => console.log(linha),
    }),
    log: (linha: string) => console.log(linha),
  });
  await renomearNovo(url);

  expect(await consultarAntigo(url)).toEqual(antes);
  expect(resultado.tenantId).toBe(V2.tenantId);
  expect(resultado.inesperados).toEqual([]);
  console.log(`V2: ${resultado.chamados} chamados; ${resultado.diasCalculados} dias.`);
  console.log('Contagens da demonstração original preservadas.');
});
