/**
 * Execução separada do histórico Intelligence V2 no DEV.
 *
 * O modo de verificação é somente leitura e se recusa a gravar.
 * O modo executar é opt-in, cria exclusivamente tenant + contas v2 e
 * chama o gerador já existente, preservando seu tenant e seus dados originais.
 * Não é incluído na suíte normal: requer vitest.historico-isolado.config.ts.
 */
import pg from 'pg';
import { expect, it } from 'vitest';
import { TENANT_DO_HISTORICO, baseDoKit, gravarHistorico } from './gravacao-historico';
import { NOME_DO_GRUPO } from './historico-inteligencia';
import { IDENTIDADE_HISTORICO_V2 as NOVO, conferirIsolamentoV2 } from './isolamento-historico-v2';

const exigir = (nome: string): string => {
  const valor = process.env[nome];
  if (!valor) throw new Error(`${nome} ausente. Use o script de operações da raiz.`);
  return valor;
};

const OBSERVADAS = [
  'app.chamado',
  'app.os',
  'app.insight',
  'app.metrica_ativo_diaria',
  'app.membro',
  'licenca.modulo',
] as const;

type Registro = Record<(typeof OBSERVADAS)[number], number>;

async function fotografiaAntigo(url: string): Promise<Registro> {
  const banco = new pg.Client({ connectionString: url });
  await banco.connect();
  try {
    await banco.query('BEGIN READ ONLY');
    const registro = {} as Registro;
    for (const tabela of OBSERVADAS) {
      // Cada tabela vem da lista fixa do próprio código, nunca de argv.
      const r = await banco.query<{ n: number }>(
        `select count(*)::int as n from ${tabela} where tenant_id = $1`,
        [TENANT_DO_HISTORICO],
      );
      registro[tabela] = r.rows[0]?.n ?? 0;
    }
    await banco.query('COMMIT');
    return registro;
  } catch (erro) {
    await banco.query('ROLLBACK');
    throw erro;
  } finally {
    await banco.end();
  }
}

async function conferirAntes(url: string): Promise<Registro> {
  conferirIsolamentoV2(TENANT_DO_HISTORICO);
  const banco = new pg.Client({ connectionString: url });
  await banco.connect();
  try {
    await banco.query('BEGIN READ ONLY');
    const antigo = await banco.query<{ nome: string }>(
      'select nome from app.tenant where id = $1',
      [TENANT_DO_HISTORICO],
    );
    const novo = await banco.query<{ nome: string }>(
      'select nome from app.tenant where id = $1',
      [NOVO.tenantId],
    );
    const contasNovas = await banco.query<{ total: number }>(
      'select count(*)::int as total from auth.users where lower(email) like $1',
      [`%@${NOVO.dominio}`],
    );
    await banco.query('COMMIT');
    if (!antigo.rows.length) {
      throw new Error('Histórico original não encontrado em DEV. Nada foi gravado.');
    }
    if (novo.rows.length || (contasNovas.rows[0]?.total ?? 0) > 0) {
      throw new Error(
        'Tenant ou contas da v2 já existem. Não reexecutar sem inspecionar o estado.',
      );
    }
  } catch (erro) {
    try {
      await banco.query('ROLLBACK');
    } catch {
      // A transação pode ter sido concluída antes da validação local.
    }
    throw erro;
  } finally {
    await banco.end();
  }
  return fotografiaAntigo(url);
}

async function nomearApenasNovoGrupo(url: string): Promise<void> {
  const banco = new pg.Client({ connectionString: url });
  await banco.connect();
  try {
    const r = await banco.query(
      'update app.tenant set nome = $1 where id = $2 and nome = $3 returning id',
      [NOVO.nome, NOVO.tenantId, NOME_DO_GRUPO],
    );
    if (r.rowCount !== 1) {
      throw new Error('Nome do grupo v2 não atualizado; conferir somente esse tenant.');
    }
  } finally {
    await banco.end();
  }
}

it('histórico Intelligence V2 isolado', { timeout: 8 * 3_600_000 }, async () => {
  if (
    process.env['HK_HISTORICO_V2_MODO'] !== 'verificar' &&
    process.env['HK_HISTORICO_V2_MODO'] !== 'executar'
  ) {
    throw new Error('Modo v2 inválido. Use --verificar ou --executar.');
  }
  const executar = process.env['HK_HISTORICO_V2_MODO'] === 'executar';
  const url = exigir('HK_HISTORICO_V2_URL_DONO');
  const fim = exigir('HK_HISTORICO_V2_FIM');
  const anterior = await conferirAntes(url);

  console.log(`DEV confirmado; histórico antigo preservado: ${JSON.stringify(anterior)}`);
  console.log(`Novo tenant de demonstração: ${NOVO.tenantId}, domínio ${NOVO.dominio}.`);

  if (!executar) {
    console.log(
      'VERIFICAÇÃO APROVADA: nenhuma escrita feita. Para criar v2, execute com --executar.',
    );
    return;
  }

  const resultado = await gravarHistorico({
    fim,
    tenantId: NOVO.tenantId,
    dominio: NOVO.dominio,
    urlDono: url,
    base: baseDoKit({
      senha: exigir('HK_DEMO_SENHA'),
      site: process.env['HK_URL_SITE'] ?? 'http://localhost:3000',
      log: (linha: string) => console.log(linha),
    }),
    log: (linha: string) => console.log(linha),
  });
  await nomearApenasNovoGrupo(url);

  const depois = await fotografiaAntigo(url);
  expect(depois).toEqual(anterior);
  expect(resultado.tenantId).toBe(NOVO.tenantId);
  expect(resultado.inesperados).toEqual([]);

  console.log(
    `V2 criada: ${NOVO.nome}; chamados=${resultado.chamados}; dias=${resultado.diasCalculados}; ` +
      `insights=${resultado.insightsAbertos}; decisões=${resultado.decisoes}.\n` +
      'Contagens do grupo antigo preservadas nas tabelas verificadas.',
  );
});
