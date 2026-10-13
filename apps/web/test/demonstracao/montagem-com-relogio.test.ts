// A montagem com o relógio do roteiro (montagem-com-relogio.ts):
//   - sem rede: recusa a Vercel, o banco de produção, um projeto fora de
//     [remotes.dev] e [remotes.staging] e um host remoto sem ref, antes de
//     conectar; aceita o Postgres local (a CI) e o projeto do dev;
//   - contra o Supabase do runner (só na CI): o ativo cadastrado e desativado
//     pela montagem tem as datas do roteiro, e a auditoria fica com a data real
//     da gravação, a do banco.
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type MontagemComRelogio,
  conferirAlvoDaMontagem,
  montarComRelogio,
  refDoRemoto,
} from './montagem-com-relogio';

const REF_DEV = 'aaaaaaaaaaaaaaaaaaaa';
const REF_STAGING = 'bbbbbbbbbbbbbbbbbbbb';
const REF_PRODUCAO = 'cccccccccccccccccccc';
const TOML = `[api]\nport = 54321\n\n[remotes.dev]\nproject_id = "${REF_DEV}"\n\n[remotes.dev.api]\nenabled = false\n`;
const doPooler = (ref: string) =>
  `postgresql://hk_app.${ref}:x@aws-0-sa-east-1.pooler.supabase.com:5432/postgres`;
const LOCAL = 'postgresql://hk_app:x@127.0.0.1:54322/postgres';

describe('a recusa da montagem, sem rede', () => {
  const conferir =
    (url: string, ambiente: Record<string, string> = {}) =>
    () =>
      conferirAlvoDaMontagem({ ambiente, url, refsPermitidos: [REF_DEV, REF_STAGING] });

  it('lê o ref de [remotes.dev] e nada de um bloco que não existe', () => {
    expect(refDoRemoto(TOML, 'dev')).toBe(REF_DEV);
    expect(refDoRemoto(TOML, 'staging')).toBeNull();
  });

  it('aceita o Postgres local da CI e os projetos da lista', () => {
    expect(conferir(LOCAL)).not.toThrow();
    expect(conferir(doPooler(REF_DEV))).not.toThrow();
    expect(conferir(doPooler(REF_STAGING), { HK_REF_PRODUCAO: REF_PRODUCAO })).not.toThrow();
  });

  it('recusa a Vercel, mesmo com o banco local', () => {
    expect(conferir(LOCAL, { VERCEL_ENV: 'preview' })).toThrow(/Vercel/);
    expect(conferir(LOCAL, { VERCEL: '1' })).toThrow(/Vercel/);
  });

  it('recusa o banco de produção, mesmo que ele estivesse na lista', () => {
    expect(() =>
      conferirAlvoDaMontagem({
        ambiente: { HK_REF_PRODUCAO: REF_PRODUCAO },
        url: doPooler(REF_PRODUCAO),
        refsPermitidos: [REF_DEV, REF_PRODUCAO],
      }),
    ).toThrow(/produção/);
  });

  it('recusa um projeto fora da lista e um host remoto sem ref', () => {
    expect(conferir(doPooler(REF_PRODUCAO))).toThrow(/fora de \[remotes\.dev\]/);
    expect(conferir('postgresql://hk_app:x@banco.exemplo.test:5432/postgres')).toThrow(
      /sem project ref/,
    );
    // O `?host=` remoto não passa por local.
    expect(conferir(`${LOCAL}?host=banco.exemplo.test`)).toThrow(/sem project ref/);
  });

  it('nunca põe a string de conexão (com a senha) na mensagem', () => {
    const url = 'postgresql://hk_app:senha-secreta@banco.exemplo.test:5432/postgres';
    expect(conferir(url)).toThrow(
      expect.objectContaining({ message: expect.not.stringContaining('senha-secreta') }),
    );
  });

  it('recusa antes de conectar: a montagem na Vercel não abre conexão', async () => {
    await expect(
      montarComRelogio({
        relogio: { agora: () => new Date() },
        ambiente: { VERCEL_ENV: 'production', DATABASE_URL_APP: doPooler(REF_DEV) },
        configToml: TOML,
      }),
    ).rejects.toThrow(/Vercel/);
    await expect(
      montarComRelogio({
        relogio: { agora: () => new Date() },
        ambiente: { HK_REF_PRODUCAO: REF_PRODUCAO, DATABASE_URL_APP: doPooler(REF_PRODUCAO) },
        configToml: TOML,
      }),
    ).rejects.toThrow(/produção/);
  });
});

const URL_DONO = process.env['HK_TESTE_URL_DONO'];
const temBanco = Boolean(URL_DONO && process.env['DATABASE_URL_APP']);
if (!temBanco && process.env['HK_EXIGIR_BANCO'] === '1') {
  throw new Error('HK_EXIGIR_BANCO=1, mas faltam HK_TESTE_URL_DONO e DATABASE_URL_APP.');
}

const TENANT = randomUUID();
const HOTEL = randomUUID();
const UH = randomUUID();
const GERENTE = randomUUID();
const ADMIN = randomUUID();
const ctx = { usuarioId: GERENTE, tenantId: TENANT };
const NO_CADASTRO = new Date('2026-04-01T13:00:00.000Z');
const NA_DESATIVACAO = new Date('2026-04-10T18:30:00.000Z');

describe.skipIf(!temBanco)('a montagem grava com o relógio do roteiro', { timeout: 60_000 }, () => {
  let dono: pg.Client;
  let montagem: MontagemComRelogio;
  let agora = NO_CADASTRO;

  beforeAll(async () => {
    dono = new pg.Client({ connectionString: URL_DONO });
    await dono.connect();
    await dono.query(`insert into app.tenant (id, nome) values ($1, 'Grupo da montagem')`, [
      TENANT,
    ]);
    await dono.query(
      `insert into app.hotel (id, tenant_id, nome, fuso, status)
       values ($1, $2, 'Hotel da montagem', 'America/Sao_Paulo', 'ativo')`,
      [HOTEL, TENANT],
    );
    await dono.query(
      `insert into app.local (id, tenant_id, hotel_id, tipo, nome, busca, status)
       values ($1, $2, $3, 'uh', 'UH 101', 'uh 101', 'ativo')`,
      [UH, TENANT, HOTEL],
    );
    for (const id of [GERENTE, ADMIN]) {
      await dono.query(`insert into auth.users (id, email) values ($1, $2)`, [
        id,
        `${id}@hubkeep.invalid`,
      ]);
      await dono.query(
        `insert into app.membro (tenant_id, usuario_id, nome, email) values ($1, $2, 'Pessoa', $3)`,
        [TENANT, id, `${id}@hubkeep.invalid`],
      );
    }
    await dono.query(
      `insert into app.atribuicao_escopo (id, tenant_id, usuario_id, papel, escopo_tipo, hotel_id, concedido_por)
       values ($1, $2, $3, 'gerente_hotel', 'hotel', $4, $5)`,
      [randomUUID(), TENANT, GERENTE, HOTEL, ADMIN],
    );
    montagem = await montarComRelogio({ relogio: { agora: () => agora } });
  });

  afterAll(async () => {
    await montagem?.encerrar();
    if (!dono) return;
    for (const t of [
      'app.evento_dominio',
      'app.auditoria',
      'app.ativo',
      'app.atribuicao_escopo',
      'app.local',
      'app.hotel',
      'app.membro',
    ]) {
      await dono.query(`delete from ${t} where tenant_id = $1`, [TENANT]);
    }
    await dono.query(`delete from app.tenant where id = $1`, [TENANT]);
    await dono.query(`delete from auth.users where id = any($1::uuid[])`, [[GERENTE, ADMIN]]);
    await dono.end();
  });

  it('o ativo nasce e é desativado nas datas do roteiro; a auditoria fica com o banco', async () => {
    const { ativos } = montagem.casos;
    agora = NO_CADASTRO;
    const criado = await ativos.cadastrar(ctx, {
      localId: UH,
      categoriaId: null,
      nome: 'Split',
      fabricante: null,
      modelo: null,
      numeroSerie: null,
    });
    agora = NA_DESATIVACAO;
    await ativos.desativar(ctx, criado.id, criado.versao);

    const { rows: ativo } = await dono.query<{
      criado_em: Date;
      atualizado_em: Date;
      desativado_em: Date;
    }>(`select criado_em, atualizado_em, desativado_em from app.ativo where id = $1`, [criado.id]);
    expect(ativo[0]).toEqual({
      criado_em: NO_CADASTRO,
      atualizado_em: NA_DESATIVACAO,
      desativado_em: NA_DESATIVACAO,
    });

    // A auditoria diz quando o dado entrou de fato: agora, pelo relógio do banco.
    const { rows: auditoria } = await dono.query<{ acao: string; recente: boolean }>(
      `select acao, now() - em < interval '10 minutes' as recente
         from app.auditoria where registro_id = $1 order by em`,
      [criado.id],
    );
    expect(auditoria.length).toBeGreaterThanOrEqual(2);
    expect(auditoria.every((a) => a.recente)).toBe(true);
  });
});
