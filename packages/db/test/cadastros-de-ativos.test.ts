// Aprovação do cadastro dos ativos (fase 1b, M4; migração 0058) contra
// Postgres real (na CI, o Supabase do runner):
//   - com a política ligada no hotel, o cadastro pelo PWA (operação offline)
//     nasce pendente e entra na fila; o do web nasce aprovado;
//   - o Gerente aprova; o Implantador e o Técnico não decidem, nem pelo
//     domínio nem pela RLS;
//   - a recusa grava o motivo e desativa o ativo, e a leitura do ativo traz a
//     situação e o motivo;
//   - a decisão fica na auditoria e no outbox.
//
//   HK_TESTE_URL_APP, HK_TESTE_URL_DONO
import { randomUUID } from 'node:crypto';
import {
  criarCasosDeUsoDeAtivos,
  criarCasosDeUsoDeCadastrosDeAtivos,
  criarCasosDeUsoDeSincronizacao,
  relogioDoSistema,
} from '@hubkeep/aplicacao';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type AcessoBanco,
  criarAcessoBanco,
  criarPortaAtivos,
  criarPortaCadastrosDeAtivos,
  criarPortaOperacoesOffline,
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
const UH = randomUUID();
const U = {
  admin: randomUUID(),
  gerente: randomUUID(),
  tecnico: randomUUID(),
  implantador: randomUUID(),
};
const ctx = (usuarioId: string) => ({ usuarioId, tenantId: TENANT });

const codigoDe = async (p: Promise<unknown>) => {
  try {
    await p;
    return null;
  } catch (e) {
    return (e as { codigo?: string }).codigo ?? String(e);
  }
};

describe.skipIf(!temBanco)('M4 — aprovação do cadastro dos ativos', { timeout: 60_000 }, () => {
  let dono: pg.Client;
  let banco: AcessoBanco;
  let ativos: ReturnType<typeof criarCasosDeUsoDeAtivos>;
  let sincronizacao: ReturnType<typeof criarCasosDeUsoDeSincronizacao>;
  let cadastros: ReturnType<typeof criarCasosDeUsoDeCadastrosDeAtivos>;
  let semRegra: ReturnType<typeof criarCasosDeUsoDeCadastrosDeAtivos>;

  beforeAll(async () => {
    dono = new pg.Client({ connectionString: URL_DONO });
    await dono.connect();
    await dono.query(`insert into app.tenant (id, nome) values ($1, 'Grupo M4')`, [TENANT]);
    await dono.query(
      `insert into app.hotel (id, tenant_id, nome, fuso, status) values ($1, $2, 'Hotel', 'UTC', 'ativo')`,
      [H1, TENANT],
    );
    await dono.query(
      `insert into app.local (id, tenant_id, hotel_id, tipo, nome, busca, status)
       values ($1, $2, $3, 'uh', 'UH 101', 'uh 101', 'ativo')`,
      [UH, TENANT, H1],
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
    await atribuir(U.implantador, 'implantador', 'hotel', H1);
    await dono.query(
      `insert into app.politica (id, tenant_id, escopo_tipo, hotel_id, chave, valor, atualizado_por)
       values ($1, $2, 'hotel', $3, 'ativo.aprovacao_do_cadastro', '{"ligado": true}', $4)`,
      [randomUUID(), TENANT, H1, U.admin],
    );

    banco = await criarAcessoBanco({ app: { url: URL_APP ?? '', max: 4 } });
    const atribuicoes = criarPortasDeAplicacao(banco).atribuicoes;
    ativos = criarCasosDeUsoDeAtivos({
      ativos: criarPortaAtivos(banco),
      atribuicoes,
      relogio: relogioDoSistema,
    });
    sincronizacao = criarCasosDeUsoDeSincronizacao({
      operacoes: criarPortaOperacoesOffline(banco),
      ativos,
    });
    const deps = {
      cadastros: criarPortaCadastrosDeAtivos(banco),
      atribuicoes,
      relogio: relogioDoSistema,
    };
    cadastros = criarCasosDeUsoDeCadastrosDeAtivos(deps);
    // Sem a regra do domínio: só a RLS decide.
    semRegra = criarCasosDeUsoDeCadastrosDeAtivos({
      ...deps,
      podeDecidir: () => ({ permitido: true }),
    });
  });

  afterAll(async () => {
    await banco?.encerrar();
    if (!dono) return;
    for (const t of [
      'app.evento_dominio',
      'app.auditoria',
      'app.operacao_offline',
      'app.ativo_decisao_cadastro',
      'app.politica',
      'app.ativo',
      'app.local',
      'app.atribuicao_escopo',
      'app.hotel',
      'app.membro',
    ]) {
      await dono.query(`delete from ${t} where tenant_id = $1`, [TENANT]);
    }
    await dono.query(`delete from app.tenant where id = $1`, [TENANT]);
    await dono.query(`delete from auth.users where id = any($1::uuid[])`, [Object.values(U)]);
  });

  const pedido = (nome: string) => ({
    localId: UH,
    categoriaId: null,
    nome,
    fabricante: null,
    modelo: null,
    numeroSerie: null,
  });
  const peloPwa = async (nome: string) => {
    const r = await sincronizacao.receberOperacao(ctx(U.tecnico), {
      chave: randomUUID(),
      tipo: 'ativo.cadastrar',
      dados: pedido(nome),
    });
    return String((r.resposta as { id: string }).id);
  };
  const lido = async (id: string) =>
    (await ativos.listarAtivos(ctx(U.gerente), H1)).find((a) => a.id === id);

  let aprovado = '';
  let recusado = '';

  it('com a política ligada, o PWA cadastra pendente e o web, aprovado', async () => {
    aprovado = await peloPwa('Split PWA 1');
    recusado = await peloPwa('Split PWA 2');
    const { id: doWeb } = await ativos.cadastrar(ctx(U.tecnico), pedido('Split web'));
    const fila = await cadastros.pendentes(ctx(U.gerente), H1);
    expect(fila.map((c) => c.nome)).toEqual(['Split PWA 1', 'Split PWA 2']);
    expect(fila[0]?.localNome).toBe('UH 101');
    expect((await lido(aprovado))?.situacaoCadastro).toBe('pendente');
    expect((await lido(doWeb))?.situacaoCadastro).toBe('aprovado');
  });

  it('o Implantador e o Técnico não decidem, nem pelo domínio nem pela RLS', async () => {
    const versao = (await lido(aprovado))?.versao ?? 0;
    const aprovar = { decisao: 'aprovado', motivo: null, versao };
    expect(await codigoDe(cadastros.decidir(ctx(U.implantador), aprovado, aprovar))).toBe(
      'cadastro_fora_do_escopo',
    );
    expect(await codigoDe(semRegra.decidir(ctx(U.tecnico), aprovado, aprovar))).not.toBeNull();
    expect((await lido(aprovado))?.situacaoCadastro).toBe('pendente');
  });

  it('o Gerente aprova; a recusa grava o motivo e desativa o ativo', async () => {
    const v1 = (await lido(aprovado))?.versao ?? 0;
    await cadastros.decidir(ctx(U.gerente), aprovado, {
      decisao: 'aprovado',
      motivo: null,
      versao: v1,
    });
    const v2 = (await lido(recusado))?.versao ?? 0;
    await cadastros.decidir(ctx(U.gerente), recusado, {
      decisao: 'recusado',
      motivo: 'Cadastrado em duplicidade',
      versao: v2,
    });
    expect(await lido(aprovado)).toMatchObject({
      situacaoCadastro: 'aprovado',
      desativadoEm: null,
    });
    const r = await lido(recusado);
    expect(r).toMatchObject({
      situacaoCadastro: 'recusado',
      motivoDaRecusa: 'Cadastrado em duplicidade',
    });
    expect(r?.desativadoEm).not.toBeNull();
    expect(await cadastros.pendentes(ctx(U.gerente), H1)).toEqual([]);
    expect(
      await codigoDe(
        cadastros.decidir(ctx(U.gerente), aprovado, {
          decisao: 'recusado',
          motivo: 'x',
          versao: v1 + 1,
        }),
      ),
    ).toBe('cadastro_ja_decidido');
  });

  it('a decisão fica na auditoria e no outbox', async () => {
    const auditoria = await dono.query<{ acao: string }>(
      `select acao from app.auditoria
        where tenant_id = $1 and entidade = 'ativo' and acao in ('aprovar_cadastro', 'recusar_cadastro')`,
      [TENANT],
    );
    expect(auditoria.rows.map((r) => r.acao).sort()).toEqual([
      'aprovar_cadastro',
      'recusar_cadastro',
    ]);
    const eventos = await dono.query(
      `select 1 from app.evento_dominio where tenant_id = $1 and tipo = 'ativo.cadastro_decidido'`,
      [TENANT],
    );
    expect(eventos.rowCount).toBe(2);
  });
});
