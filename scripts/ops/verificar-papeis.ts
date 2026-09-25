// F0-03 — aceite dos papéis num ambiente, pelo mesmo caminho que a API usa.
//
//   node --experimental-strip-types scripts/ops/verificar-papeis.ts --ambiente dev
//
// Confere:
//   1. hk_app conecta (no Supabase, pelo Supavisor em modo transação, porta 6543);
//   2. hk_authz e hk_backoffice não conectam;
//   3. numa mesma conexão do pooler, o contexto (set_config local) de uma
//      transação não aparece na seguinte;
//   4. consulta sem contexto não vê nada — com dado presente, e com a prova de
//      que o mesmo papel, com contexto válido, vê esse dado.
//
// Para o item 4 não passar por acidente numa tabela vazia, o dono grava uma
// fixture fictícia e comitada (um tenant, um usuário, um hotel) e a apaga no
// fim, com ou sem falha. Os ids são fixos e o script limpa antes de começar,
// então uma execução interrompida não deixa lixo para a seguinte.
import { randomBytes, randomUUID } from 'node:crypto';
import pg from 'pg';
import {
  type Ambiente,
  conexaoDono,
  conexaoPapel,
  descrever,
  lerArgs,
  variavelSenha,
} from './ambiente.ts';

// Grava e apaga a fixture (inclusive em auth.users) com o dono: só na CI
// (Postgres local do runner) e no dev, conferido pelo ref de [remotes.dev]
// antes de conectar (conexaoDono). Staging fica para a F0-12 (pendência em
// docs/04); produção, nunca.
const AMBIENTES_PERMITIDOS: readonly Ambiente[] = ['ci', 'dev'];

const FIX = {
  tenant: 'f0030000-0000-4000-8000-000000000001',
  usuario: 'f0030000-0000-4000-8000-000000000002',
  hotel: 'f0030000-0000-4000-8000-000000000003',
  atribuicao: 'f0030000-0000-4000-8000-000000000004',
};

const resultados: { ok: boolean; nome: string; detalhe?: string }[] = [];
const registrar = (ok: boolean, nome: string, detalhe?: string) => {
  resultados.push(detalhe === undefined ? { ok, nome } : { ok, nome, detalhe });
  console.log(`${ok ? 'ok    ' : 'FALHOU'} ${nome}${detalhe ? ` — ${detalhe}` : ''}`);
};

async function limparFixture(dono: pg.Client) {
  await dono.query('delete from app.atribuicao_escopo where id = $1', [FIX.atribuicao]);
  await dono.query('delete from app.hotel where id = $1', [FIX.hotel]);
  await dono.query('delete from app.membro where tenant_id = $1', [FIX.tenant]);
  await dono.query('delete from app.tenant where id = $1', [FIX.tenant]);
  await dono.query('delete from auth.users where id = $1', [FIX.usuario]);
}

async function criarFixture(dono: pg.Client) {
  await dono.query('begin');
  try {
    await dono.query(
      `insert into auth.users (id, email) values ($1, 'verificacao-f0-03@hubkeep.invalid')`,
      [FIX.usuario],
    );
    await dono.query(
      `insert into app.tenant (id, nome) values ($1, 'Verificação F0-03 (fictício)')`,
      [FIX.tenant],
    );
    await dono.query(
      `insert into app.membro (tenant_id, usuario_id, nome, email)
       values ($1, $2, 'Verificação F0-03', 'verificacao-f0-03@hubkeep.invalid')`,
      [FIX.tenant, FIX.usuario],
    );
    await dono.query(
      `insert into app.hotel (id, tenant_id, nome, fuso, status)
       values ($1, $2, 'Hotel de verificação', 'America/Sao_Paulo', 'ativo')`,
      [FIX.hotel, FIX.tenant],
    );
    await dono.query(
      `insert into app.atribuicao_escopo (id, tenant_id, usuario_id, papel, escopo_tipo, concedido_por)
       values ($1, $2, $3, 'admin_grupo', 'grupo', $3)`,
      [FIX.atribuicao, FIX.tenant, FIX.usuario],
    );
    await dono.query('commit');
  } catch (e) {
    await dono.query('rollback');
    throw e;
  }
}

async function conectaComo(amb: Parameters<typeof conexaoPapel>[0], papel: string, senha: string) {
  const c = new pg.Client({ ...conexaoPapel(amb, papel, senha), connectionTimeoutMillis: 15_000 });
  try {
    await c.connect();
    await c.end();
    return { conectou: true, erro: '' };
  } catch (e) {
    return { conectou: false, erro: (e as Error).message };
  }
}

async function main() {
  const { ambiente } = lerArgs(process.argv.slice(2), AMBIENTES_PERMITIDOS);
  const senhaApp = process.env[variavelSenha('hk_app', ambiente)];
  if (!senhaApp) throw new Error(`${variavelSenha('hk_app', ambiente)} não está definida.`);

  const cfgApp = conexaoPapel(ambiente, 'hk_app', senhaApp);
  console.log(`Ambiente: ${ambiente}\nhk_app:   ${descrever(cfgApp)}\n`);

  const dono = new pg.Client(conexaoDono(ambiente));
  await dono.connect();
  try {
    await limparFixture(dono);
    await criarFixture(dono);

    // 1. hk_app conecta pelo mesmo caminho da API.
    const app = new pg.Client({ ...cfgApp, connectionTimeoutMillis: 15_000 });
    await app.connect();
    try {
      const quem = (await app.query<{ u: string }>('select current_user as u')).rows[0]?.u;
      registrar(quem === 'hk_app', 'hk_app conecta', `current_user = ${quem}`);

      // 2. Papéis sem LOGIN não conectam. A senha é aleatória: o que se prova é
      //    que não há caminho, e o hk_app acima prova que o endpoint responde.
      for (const papel of ['hk_authz', 'hk_backoffice']) {
        const r = await conectaComo(ambiente, papel, randomBytes(24).toString('base64url'));
        registrar(!r.conectou, `${papel} não conecta`, r.conectou ? 'conectou!' : r.erro);
      }

      // 3. Contexto não vaza entre transações na mesma conexão do pooler. Várias
      //    rodadas: no modo transação cada uma pode cair num backend diferente.
      let vazou = '';
      for (let i = 0; i < 10 && !vazou; i++) {
        const t = randomUUID();
        const u = randomUUID();
        await app.query('begin');
        const dentro = (
          await app.query<{ t: string; u: string }>(
            `select set_config('app.tenant_id', $1, true) as t, set_config('app.usuario_id', $2, true) as u`,
            [t, u],
          )
        ).rows[0];
        await app.query('commit');
        const depois = (
          await app.query<{ t: string | null; u: string | null }>(
            `select current_setting('app.tenant_id', true) as t, current_setting('app.usuario_id', true) as u`,
          )
        ).rows[0];
        if (dentro?.t !== t || dentro?.u !== u) vazou = `rodada ${i}: set_config não aplicou`;
        else if (depois?.t || depois?.u)
          vazou = `rodada ${i}: transação seguinte viu tenant/usuário`;
      }
      registrar(
        !vazou,
        'contexto de uma transação não aparece na seguinte (10 rodadas)',
        vazou || undefined,
      );

      // 4. Sem contexto, nada; com contexto válido, o hotel da fixture.
      const sem = Number((await app.query('select count(*)::int as n from app.hotel')).rows[0]?.n);
      registrar(sem === 0, 'consulta sem contexto retorna vazio', `hotéis visíveis = ${sem}`);

      await app.query('begin');
      await app.query(
        `select set_config('app.tenant_id', $1, true), set_config('app.usuario_id', $2, true)`,
        [FIX.tenant, FIX.usuario],
      );
      const com = Number((await app.query('select count(*)::int as n from app.hotel')).rows[0]?.n);
      await app.query('commit');
      registrar(
        com === 1,
        'com contexto válido, o mesmo papel vê o hotel (controle)',
        `hotéis visíveis = ${com}`,
      );
    } finally {
      await app.end();
    }
  } finally {
    await limparFixture(dono);
    await dono.end();
  }

  const falhas = resultados.filter((r) => !r.ok).length;
  console.log(
    `\n${falhas === 0 ? 'PASSOU' : 'FALHOU'} — ${resultados.length - falhas}/${resultados.length}`,
  );
  process.exit(falhas === 0 ? 0 : 1);
}

main().catch((e: unknown) => {
  console.error(`ERRO: ${(e as Error).message}`);
  process.exit(1);
});
