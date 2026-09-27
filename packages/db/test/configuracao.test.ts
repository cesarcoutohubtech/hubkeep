// Aceite da A7 (fase 1a; ADR-026) contra Postgres real (na CI, o Supabase do runner):
//   - o Admin grava a política no grupo e no hotel; todos leem o efetivo, com a
//     origem (hotel → grupo → padrão); valor null volta a herdar;
//   - formato fora da política e chave desconhecida são 422, antes do banco;
//   - o Admin configura país, moeda e idioma do tenant e o fuso do hotel;
//   - o gerente não configura (403) e, com a checagem removida, a RLS ainda barra;
//   - cada gravação vai para a auditoria.
//
//   HK_TESTE_URL_APP, HK_TESTE_URL_DONO
import { randomUUID } from 'node:crypto';
import { criarCasosDeUsoDeConfiguracao, relogioDoSistema } from '@hubkeep/aplicacao';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type AcessoBanco,
  criarAcessoBanco,
  criarPortaConfiguracao,
  criarPortasDeAplicacao,
} from '../src/index';

const URL_APP = process.env.HK_TESTE_URL_APP;
const URL_DONO = process.env.HK_TESTE_URL_DONO;
const temBanco = Boolean(URL_APP && URL_DONO);
if (!temBanco && process.env.HK_EXIGIR_BANCO === '1') {
  throw new Error('HK_EXIGIR_BANCO=1, mas faltam HK_TESTE_URL_APP/DONO.');
}

const TENANT = randomUUID();
const H1 = randomUUID();
const U = { admin: randomUUID(), gerente: randomUUID(), tecnico: randomUUID() };
const ctx = (usuarioId: string) => ({ usuarioId, tenantId: TENANT });
const ACEITE = 'os.aceite_automatico';

describe.skipIf(!temBanco)('A7 — configuração e políticas', { timeout: 60_000 }, () => {
  let dono: pg.Client;
  let banco: AcessoBanco;
  let casos: ReturnType<typeof criarCasosDeUsoDeConfiguracao>;
  let semChecagem: ReturnType<typeof criarCasosDeUsoDeConfiguracao>;

  beforeAll(async () => {
    dono = new pg.Client({ connectionString: URL_DONO });
    await dono.connect();
    await dono.query(`insert into app.tenant (id, nome) values ($1, 'Grupo A7')`, [TENANT]);
    await dono.query(
      `insert into app.hotel (id, tenant_id, nome, fuso, status) values ($1, $2, 'Hotel 1', 'UTC', 'ativo')`,
      [H1, TENANT],
    );
    for (const [nome, id] of Object.entries(U)) {
      await dono.query(`insert into auth.users (id, email) values ($1, $2)`, [
        id,
        `${id}@hubkeep.invalid`,
      ]);
      await dono.query(
        `insert into app.membro (tenant_id, usuario_id, nome, email) values ($1, $2, $3, $4)`,
        [TENANT, id, nome, `${id}@hubkeep.invalid`],
      );
    }
    const atribuir = (usuario: string, papel: string, escopo: string, hotel: string | null) =>
      dono.query(
        `insert into app.atribuicao_escopo (id, tenant_id, usuario_id, papel, escopo_tipo, hotel_id, concedido_por)
         values ($1, $2, $3, $4, $5, $6, $7)`,
        [randomUUID(), TENANT, usuario, papel, escopo, hotel, U.admin],
      );
    await atribuir(U.admin, 'admin_grupo', 'grupo', null);
    await atribuir(U.gerente, 'gerente_hotel', 'hotel', H1);
    await atribuir(U.tecnico, 'tecnico', 'hotel', H1);
    banco = await criarAcessoBanco({ app: { url: URL_APP ?? '', max: 2 } });
    const deps = {
      configuracao: criarPortaConfiguracao(banco),
      atribuicoes: criarPortasDeAplicacao(banco).atribuicoes,
      relogio: relogioDoSistema,
    };
    casos = criarCasosDeUsoDeConfiguracao(deps);
    semChecagem = criarCasosDeUsoDeConfiguracao({
      ...deps,
      podeGerir: () => ({ permitido: true }),
    });
  });

  afterAll(async () => {
    await banco?.encerrar();
    if (!dono) return;
    for (const t of [
      'app.evento_dominio',
      'app.auditoria',
      'app.politica',
      'app.atribuicao_escopo',
      'app.hotel',
      'app.membro',
    ]) {
      await dono.query(`delete from ${t} where tenant_id = $1`, [TENANT]);
    }
    await dono.query(`delete from app.tenant where id = $1`, [TENANT]);
    await dono.query(`delete from auth.users where id = any($1::uuid[])`, [Object.values(U)]);
  });

  const aceiteDe = async (usuario: string) =>
    (await casos.lerConfiguracao(ctx(usuario), H1)).politicas.find((p) => p.chave === ACEITE);

  it('sem nada gravado vale o padrão do código', async () => {
    expect(await aceiteDe(U.tecnico)).toMatchObject({
      efetiva: { ligado: false, dias: 7 },
      grupo: null,
      hotel: null,
      origem: 'padrao',
    });
  });

  it('grupo e hotel: o hotel vence; null volta a herdar; tudo auditado', async () => {
    await casos.gravarPolitica(ctx(U.admin), ACEITE, { tipo: 'grupo' }, { ligado: true, dias: 10 });
    await casos.gravarPolitica(
      ctx(U.admin),
      ACEITE,
      { tipo: 'hotel', hotelId: H1 },
      { ligado: true, dias: 3 },
    );
    expect(await aceiteDe(U.tecnico)).toMatchObject({ efetiva: { dias: 3 }, origem: 'hotel' });
    await casos.gravarPolitica(ctx(U.admin), ACEITE, { tipo: 'hotel', hotelId: H1 }, null);
    expect(await aceiteDe(U.gerente)).toMatchObject({
      efetiva: { dias: 10 },
      hotel: null,
      origem: 'grupo',
    });
    // Gravar de novo reaproveita a linha do escopo, não duplica.
    await casos.gravarPolitica(
      ctx(U.admin),
      ACEITE,
      { tipo: 'hotel', hotelId: H1 },
      { ligado: false, dias: 5 },
    );
    const { rows } = await dono.query(
      `select count(*)::int as n from app.politica where tenant_id = $1 and escopo_tipo = 'hotel'`,
      [TENANT],
    );
    expect(rows[0].n).toBe(1);
    const auditoria = await dono.query(
      `select acao from app.auditoria where tenant_id = $1 and entidade = 'politica' order by em`,
      [TENANT],
    );
    expect(auditoria.rows.map((r) => r.acao)).toEqual([
      'gravar',
      'gravar',
      'voltar_a_herdar',
      'gravar',
    ]);
  });

  it('formato fora da política e chave desconhecida são recusados', async () => {
    await expect(
      casos.gravarPolitica(ctx(U.admin), ACEITE, { tipo: 'grupo' }, { ligado: true, dias: 0 }),
    ).rejects.toMatchObject({ codigo: 'politica_valor_invalido' });
    await expect(
      casos.gravarPolitica(ctx(U.admin), 'os.nao_existe', { tipo: 'grupo' }, {}),
    ).rejects.toMatchObject({ codigo: 'politica_desconhecida' });
  });

  it('o Admin configura o tenant e o hotel', async () => {
    await casos.configurarTenant(ctx(U.admin), {
      pais: 'CL',
      subdivisao: null,
      moeda: 'CLP',
      idiomaPadrao: 'es',
    });
    await casos.configurarHotel(ctx(U.admin), H1, {
      fuso: 'America/Santiago',
      pais: null,
      subdivisao: 'CL-RM',
      moeda: null,
      idiomaPadrao: null,
    });
    const { tenant, hotel } = await casos.lerConfiguracao(ctx(U.tecnico), H1);
    expect(tenant).toMatchObject({ pais: 'CL', moeda: 'CLP', idiomaPadrao: 'es' });
    expect(hotel).toMatchObject({ fuso: 'America/Santiago', subdivisao: 'CL-RM', pais: null });
    await expect(
      casos.configurarTenant(ctx(U.admin), {
        pais: 'CL',
        subdivisao: 'AR-B',
        moeda: 'CLP',
        idiomaPadrao: 'es',
      }),
    ).rejects.toMatchObject({ codigo: 'subdivisao_invalida' });
    await expect(
      casos.configurarHotel(ctx(U.admin), H1, {
        fuso: 'Marte/Olimpo',
        pais: null,
        subdivisao: null,
        moeda: null,
        idiomaPadrao: null,
      }),
    ).rejects.toMatchObject({ codigo: 'fuso_invalido' });
  });

  it('o gerente não configura; com a checagem removida, a RLS ainda barra', async () => {
    await expect(
      casos.gravarPolitica(
        ctx(U.gerente),
        ACEITE,
        { tipo: 'hotel', hotelId: H1 },
        { ligado: true, dias: 1 },
      ),
    ).rejects.toMatchObject({ codigo: 'configuracao_so_admin' });
    await expect(
      semChecagem.gravarPolitica(
        ctx(U.gerente),
        'chamado.prioridade_padrao_por_categoria',
        { tipo: 'grupo' },
        {},
      ),
    ).rejects.toMatchObject({ code: '42501' });
    await expect(
      semChecagem.gravarPolitica(
        ctx(U.gerente),
        ACEITE,
        { tipo: 'hotel', hotelId: H1 },
        { ligado: true, dias: 1 },
      ),
    ).rejects.toMatchObject({ codigo: 'politica_nao_encontrada' });
    await expect(
      semChecagem.configurarTenant(ctx(U.gerente), {
        pais: 'BR',
        subdivisao: null,
        moeda: 'BRL',
        idiomaPadrao: 'pt-BR',
      }),
    ).rejects.toMatchObject({ codigo: 'tenant_nao_encontrado' });
    await expect(
      semChecagem.configurarHotel(ctx(U.gerente), H1, {
        fuso: 'UTC',
        pais: null,
        subdivisao: null,
        moeda: null,
        idiomaPadrao: null,
      }),
    ).rejects.toMatchObject({ codigo: 'hotel_nao_encontrado' });
    expect(await aceiteDe(U.admin)).toMatchObject({ efetiva: { ligado: false, dias: 5 } });
  });
});
