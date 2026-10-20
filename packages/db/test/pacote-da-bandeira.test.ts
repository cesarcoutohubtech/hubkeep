// Pacote da bandeira (fase 1b, PB1; migração 0059) contra Postgres real (na
// CI, o Supabase do runner):
//   - o Admin cria e altera os planos do pacote, com auditoria;
//   - o Implantador vigente aplica o pacote ao hotel dele: copia os planos da
//     bandeira do hotel e do grupo, pausados e sem responsável, com a origem;
//   - reaplicar não duplica, e a cópia repetida no hotel é recusada pelo banco;
//   - o Gerente não grava no pacote, nem pelo domínio nem pela RLS.
//
//   HK_TESTE_URL_APP, HK_TESTE_URL_DONO
import { randomUUID } from 'node:crypto';
import { criarCasosDeUsoDoPacoteDaBandeira, relogioDoSistema } from '@hubkeep/aplicacao';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type AcessoBanco,
  criarAcessoBanco,
  criarPortaPacoteDaBandeira,
  criarPortasDeAplicacao,
} from '../src/index';

const URL_APP = process.env.HK_TESTE_URL_APP;
const URL_DONO = process.env.HK_TESTE_URL_DONO;
const temBanco = Boolean(URL_APP && URL_DONO);
if (!temBanco && process.env.HK_EXIGIR_BANCO === '1') {
  throw new Error('HK_EXIGIR_BANCO=1, mas faltam HK_TESTE_URL_APP/DONO.');
}

const TENANT = randomUUID();
const BX = randomUUID();
const BY = randomUUID();
const H1 = randomUUID();
const CAT = randomUUID();
const U = { admin: randomUUID(), implantador: randomUUID(), gerente: randomUUID() };
const ctx = (usuarioId: string) => ({ usuarioId, tenantId: TENANT });

const codigoDe = async (p: Promise<unknown>) => {
  try {
    await p;
    return null;
  } catch (e) {
    return (e as { codigo?: string }).codigo ?? String(e);
  }
};

describe.skipIf(!temBanco)('PB1 — pacote da bandeira', { timeout: 60_000 }, () => {
  let dono: pg.Client;
  let banco: AcessoBanco;
  let pacote: ReturnType<typeof criarCasosDeUsoDoPacoteDaBandeira>;
  let semRegra: ReturnType<typeof criarCasosDeUsoDoPacoteDaBandeira>;

  beforeAll(async () => {
    dono = new pg.Client({ connectionString: URL_DONO });
    await dono.connect();
    await dono.query(`insert into app.tenant (id, nome) values ($1, 'Grupo PB1')`, [TENANT]);
    await dono.query(
      `insert into app.bandeira (id, tenant_id, nome) values ($1, $3, 'X'), ($2, $3, 'Y')`,
      [BX, BY, TENANT],
    );
    await dono.query(
      `insert into app.hotel (id, tenant_id, bandeira_id, nome, fuso, status)
       values ($1, $2, $3, 'Hotel', 'America/Sao_Paulo', 'em_implantacao')`,
      [H1, TENANT, BX],
    );
    await dono.query(
      `insert into app.categoria_ativo (id, tenant_id, nomes) values ($1, $2, '{"pt-BR": "Bombas"}')`,
      [CAT, TENANT],
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
        `insert into app.atribuicao_escopo (id, tenant_id, usuario_id, papel, escopo_tipo, hotel_id, concedido_por, valido_ate)
         values ($1, $2, $3, $4::app.papel, $5, $6, $7,
                 case when $4::app.papel = 'implantador' then now() + interval '30 days' end)`,
        [randomUUID(), TENANT, usuario, papel, escopo, hotel, U.admin],
      );
    await atribuir(U.admin, 'admin_grupo', 'grupo', null);
    await atribuir(U.implantador, 'implantador', 'hotel', H1);
    await atribuir(U.gerente, 'gerente_hotel', 'hotel', H1);

    banco = await criarAcessoBanco({ app: { url: URL_APP ?? '', max: 4 } });
    const deps = {
      pacote: criarPortaPacoteDaBandeira(banco),
      atribuicoes: criarPortasDeAplicacao(banco).atribuicoes,
      relogio: relogioDoSistema,
    };
    pacote = criarCasosDeUsoDoPacoteDaBandeira(deps);
    semRegra = criarCasosDeUsoDoPacoteDaBandeira({
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
      'app.plano_preventivo',
      'app.plano_padrao',
      'app.categoria_ativo',
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

  const pedido = (nome: string, bandeiraId: string | null) => ({
    bandeiraId,
    categoriaId: CAT,
    nome,
    intervalo: 1,
    unidade: 'mes',
    checklistModeloId: null,
  });

  it('o Admin cria e altera os planos do pacote, com auditoria', async () => {
    const a = await pacote.criar(ctx(U.admin), pedido('Limpeza da bandeira', BX));
    await pacote.criar(ctx(U.admin), pedido('Revisão do grupo', null));
    await pacote.criar(ctx(U.admin), pedido('Da outra bandeira', BY));
    expect(
      await pacote.alterar(ctx(U.admin), a.id, { ...pedido('Limpeza mensal', BX), versao: 1 }),
    ).toEqual({ versao: 2 });
    const { rows } = await dono.query(
      `select acao from app.auditoria where tenant_id = $1 and entidade = 'plano_padrao' order by criado_em, acao`,
      [TENANT],
    );
    expect(rows.map((r) => r.acao).sort()).toEqual(['alterar', 'criar', 'criar', 'criar']);
  });

  it('o Gerente não grava no pacote, nem pelo domínio nem pela RLS', async () => {
    expect(await codigoDe(pacote.criar(ctx(U.gerente), pedido('X', null)))).toBe(
      'pacote_so_do_admin',
    );
    await expect(semRegra.criar(ctx(U.gerente), pedido('X', null))).rejects.toMatchObject({
      code: '42501',
    });
  });

  it('o Implantador aplica: copia os da bandeira do hotel e do grupo, pausados e com a origem', async () => {
    const previa = await pacote.previa(ctx(U.implantador), H1);
    expect(previa.map((c) => c.nome)).toEqual(['Limpeza mensal', 'Revisão do grupo']);
    const r = await pacote.aplicar(ctx(U.implantador), H1);
    expect(r.copiados).toHaveLength(2);
    const { rows } = await dono.query(
      `select nome, situacao, tecnico_id, equipe_id, plano_padrao_id is not null as do_pacote, criado_por
         from app.plano_preventivo where tenant_id = $1 order by nome`,
      [TENANT],
    );
    expect(rows).toEqual([
      expect.objectContaining({
        nome: 'Limpeza mensal',
        situacao: 'pausado',
        tecnico_id: null,
        do_pacote: true,
      }),
      expect.objectContaining({
        nome: 'Revisão do grupo',
        situacao: 'pausado',
        equipe_id: null,
        do_pacote: true,
      }),
    ]);
    expect(rows.every((p) => p.criado_por === U.implantador)).toBe(true);
  });

  it('reaplicar não duplica; a cópia repetida no hotel é recusada pelo banco', async () => {
    expect((await pacote.aplicar(ctx(U.implantador), H1)).copiados).toEqual([]);
    const { rows } = await dono.query(
      `select plano_padrao_id from app.plano_preventivo where tenant_id = $1 limit 1`,
      [TENANT],
    );
    const porta = criarPortaPacoteDaBandeira(banco);
    expect(
      await porta.copiar(ctx(U.implantador), H1, {
        planoPadraoId: rows[0].plano_padrao_id,
        categoriaId: CAT,
        nome: 'De novo',
        intervalo: 1,
        unidade: 'mes',
        checklistModeloId: null,
        inicio: '2026-10-20',
        situacao: 'pausado',
        tecnicoId: null,
        equipeId: null,
      }),
    ).toBe('ja_copiado');
  });
});
