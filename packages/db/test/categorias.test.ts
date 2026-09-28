// Aceite da B2 (fase 1a; ADR-028) contra Postgres real (na CI, o Supabase do runner):
//   - o Admin instala as categorias padrão (idempotente) e cria a do tenant,
//     com campos tipados; o técnico lê;
//   - definição inválida é 422 com o campo e o motivo; o tipo de um campo
//     existente não muda; campo novo obrigatório entra sem erro;
//   - o gerente não gere (403) e, com a checagem removida, a RLS ainda barra;
//   - cada gravação vai para a auditoria.
//
//   HK_TESTE_URL_APP, HK_TESTE_URL_DONO
import { randomUUID } from 'node:crypto';
import { criarCasosDeUsoDeCategorias, relogioDoSistema } from '@hubkeep/aplicacao';
import { CATEGORIAS_PADRAO } from '@hubkeep/dominio';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type AcessoBanco,
  criarAcessoBanco,
  criarPortaCategorias,
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
const potencia = {
  chave: 'potencia',
  tipo: 'numero',
  obrigatorio: true,
  rotulos: { 'pt-BR': 'Potência' },
  unidade: 'kW',
};

describe.skipIf(!temBanco)('B2 — categorias de ativo', { timeout: 60_000 }, () => {
  let dono: pg.Client;
  let banco: AcessoBanco;
  let casos: ReturnType<typeof criarCasosDeUsoDeCategorias>;
  let semChecagem: ReturnType<typeof criarCasosDeUsoDeCategorias>;
  let sauna = '';

  beforeAll(async () => {
    dono = new pg.Client({ connectionString: URL_DONO });
    await dono.connect();
    await dono.query(
      `insert into app.tenant (id, nome, idioma_padrao) values ($1, 'Grupo B2', 'es')`,
      [TENANT],
    );
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
      categorias: criarPortaCategorias(banco),
      atribuicoes: criarPortasDeAplicacao(banco).atribuicoes,
      relogio: relogioDoSistema,
    };
    casos = criarCasosDeUsoDeCategorias(deps);
    semChecagem = criarCasosDeUsoDeCategorias({ ...deps, podeGerir: () => ({ permitido: true }) });
  });

  afterAll(async () => {
    await banco?.encerrar();
    if (!dono) return;
    for (const t of [
      'app.evento_dominio',
      'app.auditoria',
      'app.categoria_ativo',
      'app.atribuicao_escopo',
      'app.hotel',
      'app.membro',
    ]) {
      await dono.query(`delete from ${t} where tenant_id = $1`, [TENANT]);
    }
    await dono.query(`delete from app.tenant where id = $1`, [TENANT]);
    await dono.query(`delete from auth.users where id = any($1::uuid[])`, [Object.values(U)]);
  });

  it('instala as padrão uma vez e cria a do tenant; o técnico lê', async () => {
    expect(await casos.instalarCategoriasPadrao(ctx(U.admin))).toEqual({
      instaladas: CATEGORIAS_PADRAO.length,
    });
    expect(await casos.instalarCategoriasPadrao(ctx(U.admin))).toEqual({ instaladas: 0 });
    ({ id: sauna } = await casos.criarCategoria(
      ctx(U.admin),
      { 'pt-BR': ' Saunas ', es: 'Saunas' },
      [potencia],
    ));
    const { idiomaPadrao, categorias } = await casos.listarCategorias(ctx(U.tecnico));
    expect(idiomaPadrao).toBe('es');
    expect(categorias.filter((c) => c.chavePadrao).map((c) => c.chavePadrao)).toEqual([
      ...CATEGORIAS_PADRAO,
    ]);
    expect(categorias.find((c) => c.id === sauna)).toMatchObject({
      chavePadrao: null,
      nomes: { 'pt-BR': 'Saunas', es: 'Saunas' },
      campos: [{ chave: 'potencia', tipo: 'numero', obrigatorio: true, unidade: 'kW', opcoes: [] }],
      ativa: true,
    });
  });

  it('definição inválida e mudança de tipo são recusadas; campo novo obrigatório entra', async () => {
    await expect(
      casos.alterarCategoria(ctx(U.admin), sauna, { 'pt-BR': 'Saunas' }, [
        { chave: 'Potência', tipo: 'numero', rotulos: { 'pt-BR': 'x' } },
      ]),
    ).rejects.toMatchObject({
      codigo: 'definicao_de_campo_invalida',
      parametros: { campo: '0', motivo: 'chave' },
    });
    await expect(
      casos.alterarCategoria(ctx(U.admin), sauna, { 'pt-BR': 'Saunas' }, [
        { ...potencia, tipo: 'texto', unidade: null },
      ]),
    ).rejects.toMatchObject({ codigo: 'campo_muda_de_tipo', parametros: { campo: 'potencia' } });
    await expect(casos.criarCategoria(ctx(U.admin), {}, [])).rejects.toMatchObject({
      codigo: 'categoria_nome_invalido',
    });
    await casos.alterarCategoria(ctx(U.admin), sauna, { 'pt-BR': 'Saunas' }, [
      potencia,
      { chave: 'serie', tipo: 'texto', obrigatorio: true, rotulos: { 'pt-BR': 'Número de série' } },
    ]);
    const { categorias } = await casos.listarCategorias(ctx(U.admin));
    expect(categorias.find((c) => c.id === sauna)?.campos.map((c) => c.chave)).toEqual([
      'potencia',
      'serie',
    ]);
  });

  it('desativar e reativar; a padrão aceita nome próprio', async () => {
    const { categorias } = await casos.listarCategorias(ctx(U.admin));
    const refrigeracao = categorias.find((c) => c.chavePadrao === 'refrigeracao');
    await casos.alterarCategoria(
      ctx(U.admin),
      refrigeracao?.id ?? '',
      { 'pt-BR': 'Climatização' },
      [],
    );
    await casos.desativarCategoria(ctx(U.admin), sauna);
    expect(
      (await casos.listarCategorias(ctx(U.gerente))).categorias.find((c) => c.id === sauna)?.ativa,
    ).toBe(false);
    await casos.reativarCategoria(ctx(U.admin), sauna);
  });

  it('o gerente não gere; com a checagem removida, a RLS ainda barra', async () => {
    await expect(casos.criarCategoria(ctx(U.gerente), { 'pt-BR': 'X' }, [])).rejects.toMatchObject({
      codigo: 'categorias_so_admin',
    });
    await expect(
      semChecagem.criarCategoria(ctx(U.gerente), { 'pt-BR': 'X' }, []),
    ).rejects.toMatchObject({ code: '42501' });
    await expect(semChecagem.desativarCategoria(ctx(U.gerente), sauna)).rejects.toMatchObject({
      codigo: 'categoria_nao_encontrada',
    });
  });

  it('cada gravação vai para a auditoria', async () => {
    const { rows } = await dono.query(
      `select acao, count(*)::int as n from app.auditoria where tenant_id = $1 and entidade = 'categoria_ativo' group by acao order by acao`,
      [TENANT],
    );
    expect(rows).toEqual([
      { acao: 'alterar', n: 2 },
      { acao: 'criar', n: CATEGORIAS_PADRAO.length + 1 },
      { acao: 'desativar', n: 1 },
      { acao: 'reativar', n: 1 },
    ]);
  });
});
