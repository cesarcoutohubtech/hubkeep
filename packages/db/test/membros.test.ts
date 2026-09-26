// Aceite da A3 (fase 1a) contra Postgres real (na CI, o Supabase do runner):
//   - só o Admin do grupo desativa e reativa membro; desativado, perde o acesso;
//   - paridade domínio × RLS na desativação: tudo o que o domínio permite o
//     banco aceita, e tudo o que o banco aceita o domínio permite, exceto a
//     regra própria do domínio (ninguém altera o próprio acesso);
//   - lista recortada pela RLS; mudança de validade auditada.
//
//   HK_TESTE_URL_APP, HK_TESTE_URL_DONO
import { randomUUID } from 'node:crypto';
import { criarCasosDeUsoDeMembros, relogioDoSistema } from '@hubkeep/aplicacao';
import { NaoEncontrado, podeAlterarAtivoDoMembro } from '@hubkeep/dominio';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type AcessoBanco,
  criarAcessoBanco,
  criarPortaMembros,
  criarPortasDeAplicacao,
  listarHoteisVisiveis,
} from '../src/index';

const URL_APP = process.env.HK_TESTE_URL_APP;
const URL_DONO = process.env.HK_TESTE_URL_DONO;
const temBanco = Boolean(URL_APP && URL_DONO);
if (!temBanco && process.env.HK_EXIGIR_BANCO === '1') {
  throw new Error('HK_EXIGIR_BANCO=1, mas faltam HK_TESTE_URL_APP/DONO.');
}

const TENANT = randomUUID();
const HOTEL = randomUUID();
const U = {
  admin: randomUUID(),
  implantador: randomUUID(),
  gerente: randomUUID(),
  tecnico: randomUUID(),
};
const ctx = (usuarioId: string) => ({ usuarioId, tenantId: TENANT });

describe.skipIf(!temBanco)('A3 — membros e papéis', { timeout: 60_000 }, () => {
  let dono: pg.Client;
  let banco: AcessoBanco;
  let casos: ReturnType<typeof criarCasosDeUsoDeMembros>;
  const idImplantador = randomUUID();

  beforeAll(async () => {
    dono = new pg.Client({ connectionString: URL_DONO });
    await dono.connect();
    await dono.query(`insert into app.tenant (id, nome) values ($1, 'Grupo A3')`, [TENANT]);
    await dono.query(
      `insert into app.hotel (id, tenant_id, nome, fuso, status) values ($1, $2, 'Hotel A3', 'UTC', 'ativo')`,
      [HOTEL, TENANT],
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
    const atribuir = (
      id: string,
      usuario: string,
      papel: string,
      escopo: string,
      hotel: string | null,
      validade: string | null,
    ) =>
      dono.query(
        `insert into app.atribuicao_escopo (id, tenant_id, usuario_id, papel, escopo_tipo, hotel_id, valido_ate, concedido_por)
         values ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [id, TENANT, usuario, papel, escopo, hotel, validade, U.admin],
      );
    await atribuir(randomUUID(), U.admin, 'admin_grupo', 'grupo', null, null);
    await atribuir(
      idImplantador,
      U.implantador,
      'implantador',
      'hotel',
      HOTEL,
      new Date(Date.now() + 30 * 864e5).toISOString(),
    );
    await atribuir(randomUUID(), U.gerente, 'gerente_hotel', 'hotel', HOTEL, null);
    await atribuir(randomUUID(), U.tecnico, 'tecnico', 'hotel', HOTEL, null);

    banco = await criarAcessoBanco({ app: { url: URL_APP ?? '', max: 2 } });
    casos = criarCasosDeUsoDeMembros({
      membros: criarPortaMembros(banco),
      atribuicoes: criarPortasDeAplicacao(banco).atribuicoes,
      relogio: relogioDoSistema,
    });
  });

  afterAll(async () => {
    await banco?.encerrar();
    if (!dono) return;
    for (const t of [
      'app.evento_dominio',
      'app.auditoria',
      'app.atribuicao_escopo',
      'app.hotel',
      'app.membro',
    ]) {
      await dono.query(`delete from ${t} where tenant_id = $1`, [TENANT]);
    }
    await dono.query(`delete from app.tenant where id = $1`, [TENANT]);
    await dono.query(`delete from auth.users where id = any($1::uuid[])`, [Object.values(U)]);
  });

  it('paridade domínio × RLS na desativação, para todo par de quem age e alvo', async () => {
    const porta = criarPortaMembros(banco);
    const papeis = criarPortasDeAplicacao(banco).atribuicoes;
    const divergencias: string[] = [];
    for (const [quem, eu] of Object.entries(U)) {
      const minhas = await papeis.doUsuario(ctx(eu));
      for (const [alvoNome, alvo] of Object.entries(U)) {
        const dominio = podeAlterarAtivoDoMembro(
          minhas,
          eu,
          { usuarioId: alvo },
          new Date(),
        ).permitido;
        let rls: boolean;
        try {
          await porta.definirAtivo(ctx(eu), alvo, false);
          rls = true;
          await dono.query(
            `update app.membro set ativo = true where tenant_id = $1 and usuario_id = $2`,
            [TENANT, alvo],
          );
        } catch (e) {
          // Recusa do banco: nenhuma linha pela policy de membro (NaoEncontrado), ou
          // 42501 na auditoria. Este é o caso de quem desativa a si mesmo: na mesma
          // transação ele já não é membro ativo, authz.tenant_id() fica nulo e a
          // auditoria é recusada. O banco também barra a autodesativação.
          const codigo = (e as { code?: string }).code;
          if (!(e instanceof NaoEncontrado) && codigo !== '42501') throw e;
          rls = false;
        }
        const regraPropria = eu === alvo; // ninguém altera o próprio acesso (só do domínio)
        if (dominio && !rls) divergencias.push(`${quem}→${alvoNome}: domínio permite, banco nega`);
        if (rls && !dominio && !regraPropria)
          divergencias.push(`${quem}→${alvoNome}: banco permite, domínio nega`);
      }
    }
    expect(divergencias).toEqual([]);
  });

  it('desativado pelo admin, o técnico perde o acesso ao tenant; reativado, volta', async () => {
    expect(await banco.withContext(ctx(U.tecnico), listarHoteisVisiveis)).toHaveLength(1);
    await casos.desativarMembro(ctx(U.admin), U.tecnico);
    expect(await banco.withContext(ctx(U.tecnico), listarHoteisVisiveis)).toEqual([]);
    await casos.reativarMembro(ctx(U.admin), U.tecnico);
    expect(await banco.withContext(ctx(U.tecnico), listarHoteisVisiveis)).toHaveLength(1);
    const { rows } = await dono.query(
      `select acao from app.auditoria where tenant_id = $1 and entidade = 'membro' and registro_id = $2 order by em`,
      [TENANT, U.tecnico],
    );
    expect(rows.map((r) => r.acao)).toEqual(['desativar', 'reativar']);
  });

  it('o Implantador não desativa (403 com código) e o admin não desativa a si mesmo', async () => {
    await expect(casos.desativarMembro(ctx(U.implantador), U.tecnico)).rejects.toMatchObject({
      codigo: 'ativacao_de_membro_so_admin',
    });
    await expect(casos.desativarMembro(ctx(U.admin), U.admin)).rejects.toMatchObject({
      codigo: 'nao_altera_o_proprio_acesso',
    });
  });

  it('lista: o admin vê todos; o implantador, as atribuições do hotel dele; o gerente, 403', async () => {
    const doAdmin = await casos.listarMembros(ctx(U.admin));
    expect(doAdmin.map((m) => m.nome).sort()).toEqual([
      'admin',
      'gerente',
      'implantador',
      'tecnico',
    ]);
    const doImplantador = await casos.listarMembros(ctx(U.implantador));
    const admin = doImplantador.find((m) => m.usuarioId === U.admin);
    expect(admin?.atribuicoes).toEqual([]); // o papel de grupo do admin não aparece para ele
    expect(doImplantador.find((m) => m.usuarioId === U.tecnico)?.atribuicoes).toHaveLength(1);
    await expect(casos.listarMembros(ctx(U.gerente))).rejects.toMatchObject({
      codigo: 'gestao_de_membros_so_admin_ou_implantador',
    });
  });

  it('o admin prorroga o Implantador, com auditoria; no passado, 422', async () => {
    const nova = new Date(Date.now() + 90 * 864e5);
    await casos.alterarValidade(ctx(U.admin), idImplantador, nova);
    const { rows } = await dono.query(
      `select valido_ate from app.atribuicao_escopo where id = $1`,
      [idImplantador],
    );
    expect(new Date(rows[0].valido_ate).getTime()).toBe(nova.getTime());
    await expect(
      casos.alterarValidade(ctx(U.admin), idImplantador, new Date(Date.now() - 864e5)),
    ).rejects.toMatchObject({ codigo: 'validade_no_passado' });
    await expect(
      casos.alterarValidade(ctx(U.implantador), idImplantador, nova),
    ).rejects.toMatchObject({ codigo: 'implantador_nao_altera_validade_do_papel' });
  });
});
