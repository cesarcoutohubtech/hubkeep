// Aceite da I3 (fase 1b) contra Postgres real (na CI, o Supabase do runner):
//   - o Gerente e o Gestor CSC cadastram e alteram o fornecedor do grupo; o
//     CNPJ inválido é 422 e o repetido no grupo, 409;
//   - a alteração leva a versão vista (ADR-029); desativar e reativar também;
//   - o contato entra na auditoria, sem hotel, com o evento no outbox, e o
//     histórico do fornecedor aparece para quem o cadastra;
//   - o proprietário não lê; o Técnico lê e não grava: 403 com código, e com a
//     checagem da aplicação removida a RLS ainda barra.
//
//   HK_TESTE_URL_APP, HK_TESTE_URL_DONO
import { randomUUID } from 'node:crypto';
import {
  criarCasosDeUsoDeFornecedores,
  criarCasosDeUsoDeHistorico,
  relogioDoSistema,
} from '@hubkeep/aplicacao';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type AcessoBanco,
  criarAcessoBanco,
  criarPortaFornecedores,
  criarPortaHistorico,
  criarPortasDeAplicacao,
} from '../src/index';

const URL_APP = process.env.HK_TESTE_URL_APP;
const URL_DONO = process.env.HK_TESTE_URL_DONO;
const temBanco = Boolean(URL_APP && URL_DONO);
if (!temBanco && process.env.HK_EXIGIR_BANCO === '1') {
  throw new Error('HK_EXIGIR_BANCO=1, mas faltam HK_TESTE_URL_APP/DONO.');
}

const TENANT = randomUUID();
const HOTEL = randomUUID();
const BANDEIRA = randomUUID();
const U = {
  admin: randomUUID(),
  gestor: randomUUID(),
  gerente: randomUUID(),
  tecnico: randomUUID(),
  dono: randomUUID(),
};
const ctx = (usuarioId: string) => ({ usuarioId, tenantId: TENANT });

describe.skipIf(!temBanco)('I3 — fornecedor mínimo do grupo', { timeout: 60_000 }, () => {
  let dono: pg.Client;
  let banco: AcessoBanco;
  let casos: ReturnType<typeof criarCasosDeUsoDeFornecedores>;
  let semChecagem: ReturnType<typeof criarCasosDeUsoDeFornecedores>;
  let historico: ReturnType<typeof criarCasosDeUsoDeHistorico>;
  let fornecedorId = '';

  beforeAll(async () => {
    dono = new pg.Client({ connectionString: URL_DONO });
    await dono.connect();
    await dono.query(`insert into app.tenant (id, nome) values ($1, 'Grupo I3')`, [TENANT]);
    await dono.query(
      `insert into app.bandeira (id, tenant_id, nome) values ($1, $2, 'Bandeira I3')`,
      [BANDEIRA, TENANT],
    );
    await dono.query(
      `insert into app.hotel (id, tenant_id, bandeira_id, nome, fuso, status) values ($1, $2, $3, 'Hotel I3', 'UTC', 'ativo')`,
      [HOTEL, TENANT, BANDEIRA],
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
    await dono.query(
      `insert into app.atribuicao_escopo (id, tenant_id, usuario_id, papel, escopo_tipo, bandeira_id, hotel_id, concedido_por) values
         ($1, $6, $7, 'admin_grupo', 'grupo', null, null, $7),
         ($2, $6, $8, 'gestor_csc', 'bandeira', $12, null, $7),
         ($3, $6, $9, 'gerente_hotel', 'hotel', null, $13, $7),
         ($4, $6, $10, 'tecnico', 'hotel', null, $13, $7),
         ($5, $6, $11, 'proprietario', 'hotel', null, $13, $7)`,
      [
        randomUUID(),
        randomUUID(),
        randomUUID(),
        randomUUID(),
        randomUUID(),
        TENANT,
        U.admin,
        U.gestor,
        U.gerente,
        U.tecnico,
        U.dono,
        BANDEIRA,
        HOTEL,
      ],
    );
    banco = await criarAcessoBanco({ app: { url: URL_APP ?? '', max: 2 } });
    const deps = {
      fornecedores: criarPortaFornecedores(banco),
      atribuicoes: criarPortasDeAplicacao(banco).atribuicoes,
      relogio: relogioDoSistema,
    };
    casos = criarCasosDeUsoDeFornecedores(deps);
    semChecagem = criarCasosDeUsoDeFornecedores({
      ...deps,
      podeGerir: () => ({ permitido: true }),
    });
    historico = criarCasosDeUsoDeHistorico({ historico: criarPortaHistorico(banco) });
  });

  afterAll(async () => {
    await banco?.encerrar();
    if (!dono) return;
    for (const t of [
      'app.evento_dominio',
      'app.auditoria',
      'app.fornecedor',
      'app.atribuicao_escopo',
      'app.hotel',
      'app.bandeira',
      'app.membro',
    ]) {
      await dono.query(`delete from ${t} where tenant_id = $1`, [TENANT]);
    }
    await dono.query(`delete from app.tenant where id = $1`, [TENANT]);
    await dono.query(`delete from auth.users where id = any($1::uuid[])`, [Object.values(U)]);
  });

  it('o gerente cadastra, com o contato na auditoria sem hotel e o evento', async () => {
    const r = await casos.cadastrar(ctx(U.gerente), {
      nome: '  Refrigeração   Sul ',
      cnpj: '11.222.333/0001-81',
      contatoNome: 'Ana',
      contatoTelefone: '+55 41 3333-0000',
      contatoEmail: 'Ana@Fornecedor.test',
    });
    fornecedorId = r.id;
    expect(r.versao).toBe(1);
    const lista = await casos.listar(ctx(U.admin));
    expect(lista).toEqual([
      {
        id: r.id,
        nome: 'Refrigeração Sul',
        cnpj: '11222333000181',
        contatoNome: 'Ana',
        contatoTelefone: '+55 41 3333-0000',
        contatoEmail: 'ana@fornecedor.test',
        ativo: true,
        versao: 1,
      },
    ]);
    const auditoria = await dono.query(
      `select hotel_id, acao, usuario_id, depois->>'contatoEmail' as email from app.auditoria
       where tenant_id = $1 and entidade = 'fornecedor' and registro_id = $2`,
      [TENANT, r.id],
    );
    expect(auditoria.rows).toEqual([
      { hotel_id: null, acao: 'criar', usuario_id: U.gerente, email: 'ana@fornecedor.test' },
    ]);
    const eventos = await dono.query(
      `select tipo from app.evento_dominio where tenant_id = $1 and registro_id = $2`,
      [TENANT, r.id],
    );
    expect(eventos.rows).toEqual([{ tipo: 'fornecedor.criado' }]);
  });

  it('CNPJ inválido é 422; repetido no grupo é 409; sem CNPJ, vários', async () => {
    await expect(
      casos.cadastrar(ctx(U.gestor), { nome: 'Outro', cnpj: '11.222.333/0001-82' }),
    ).rejects.toMatchObject({ codigo: 'fornecedor_cnpj_invalido' });
    await expect(
      casos.cadastrar(ctx(U.gestor), { nome: 'Outro', cnpj: '11222333000181' }),
    ).rejects.toMatchObject({ codigo: 'fornecedor_cnpj_repetido' });
    await casos.cadastrar(ctx(U.gestor), { nome: 'Pintura' });
    await casos.cadastrar(ctx(U.gerente), { nome: 'Serralheria', cnpj: '' });
    expect((await casos.listar(ctx(U.tecnico))).map((f) => f.nome)).toEqual([
      'Pintura',
      'Refrigeração Sul',
      'Serralheria',
    ]);
  });

  it('a alteração leva a versão vista; o CNPJ de outro fornecedor é 409', async () => {
    const { versao } = await casos.alterar(ctx(U.gestor), fornecedorId, {
      versao: 1,
      nome: 'Refrigeração Sul Ltda',
      cnpj: '11222333000181',
      contatoNome: 'Bruno',
      contatoTelefone: null,
      contatoEmail: null,
    });
    expect(versao).toBe(2);
    await expect(
      casos.alterar(ctx(U.gerente), fornecedorId, { versao: 1, nome: 'Velha' }),
    ).rejects.toMatchObject({ codigo: 'conflito_de_versao', parametros: { versaoAtual: 2 } });
    const pintura = (await casos.listar(ctx(U.admin))).find((f) => f.nome === 'Pintura');
    await expect(
      casos.alterar(ctx(U.admin), pintura?.id ?? '', {
        versao: pintura?.versao ?? 1,
        nome: 'Pintura',
        cnpj: '11222333000181',
      }),
    ).rejects.toMatchObject({ codigo: 'fornecedor_cnpj_repetido' });
    const desativado = await casos.desativar(ctx(U.gerente), fornecedorId, 2);
    expect((await casos.listar(ctx(U.admin))).find((f) => f.id === fornecedorId)?.ativo).toBe(
      false,
    );
    await casos.reativar(ctx(U.gerente), fornecedorId, desativado.versao);
  });

  it('o histórico do fornecedor aparece para o gerente, com o contato', async () => {
    const h = await historico.historico(ctx(U.gerente), 'fornecedor', fornecedorId);
    expect(h.eventos.map((e) => e.acao)).toEqual(['criar', 'alterar', 'desativar', 'reativar']);
    expect(h.eventos[1]?.mudancas).toEqual(
      expect.arrayContaining([
        { campo: 'contatoNome', chave: null, antes: 'Ana', depois: 'Bruno' },
        { campo: 'contatoEmail', chave: null, antes: 'ana@fornecedor.test', depois: null },
      ]),
    );
  });

  it('o proprietário não lê; o técnico lê e não grava, nem sem a checagem', async () => {
    expect(await casos.listar(ctx(U.dono))).toEqual([]);
    await expect(
      historico.historico(ctx(U.dono), 'fornecedor', fornecedorId),
    ).rejects.toMatchObject({ codigo: 'registro_nao_encontrado' });
    await expect(casos.cadastrar(ctx(U.tecnico), { nome: 'Do técnico' })).rejects.toMatchObject({
      codigo: 'fornecedores_sem_permissao',
    });
    await expect(
      semChecagem.cadastrar(ctx(U.tecnico), { nome: 'Do técnico' }),
    ).rejects.toMatchObject({ code: '42501' });
    await expect(semChecagem.desativar(ctx(U.tecnico), fornecedorId, 4)).rejects.toMatchObject({
      codigo: 'fornecedor_nao_encontrado',
    });
    await expect(semChecagem.cadastrar(ctx(U.dono), { nome: 'Do dono' })).rejects.toMatchObject({
      code: '42501',
    });
    const { rows } = await dono.query(
      `select count(*)::int as n from app.fornecedor where tenant_id = $1`,
      [TENANT],
    );
    expect(rows[0]).toEqual({ n: 3 });
  });
});
