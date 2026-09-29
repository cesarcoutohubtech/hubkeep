// Aceite da C1 (fase 1a; ADR-027) contra Postgres real (na CI, o Supabase do runner):
//   - o Admin instala as situações e prioridades padrão (idempotente) e cria
//     as do tenant; o técnico e o proprietário leem, na ordem da tela;
//   - nome, ordem, cor, peso e estado inválidos são 422 com o código;
//   - a última situação ativa do estado e a última prioridade ativa não saem;
//   - o gerente não gere (403) e, com a checagem removida, a RLS ainda barra;
//   - cada gravação vai para a auditoria.
//
//   HK_TESTE_URL_APP, HK_TESTE_URL_DONO
import { randomUUID } from 'node:crypto';
import { criarCasosDeUsoDeSituacoes, relogioDoSistema } from '@hubkeep/aplicacao';
import { PRIORIDADES_PADRAO, SITUACOES_PADRAO } from '@hubkeep/dominio';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type AcessoBanco,
  criarAcessoBanco,
  criarPortaPrioridades,
  criarPortaSituacoes,
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
const PROPRIETARIO = randomUUID();
const U = {
  admin: randomUUID(),
  gerente: randomUUID(),
  tecnico: randomUUID(),
  dono: randomUUID(),
};
const ctx = (usuarioId: string) => ({ usuarioId, tenantId: TENANT });

describe.skipIf(!temBanco)('C1 — situações e prioridades', { timeout: 60_000 }, () => {
  let dono: pg.Client;
  let banco: AcessoBanco;
  let casos: ReturnType<typeof criarCasosDeUsoDeSituacoes>;
  let semChecagem: ReturnType<typeof criarCasosDeUsoDeSituacoes>;
  let aguardandoPeca = '';
  let critica = '';

  beforeAll(async () => {
    dono = new pg.Client({ connectionString: URL_DONO });
    await dono.connect();
    await dono.query(
      `insert into app.tenant (id, nome, idioma_padrao) values ($1, 'Grupo C1', 'pt-BR')`,
      [TENANT],
    );
    await dono.query(
      `insert into app.hotel (id, tenant_id, nome, fuso, status) values ($1, $2, 'Hotel 1', 'UTC', 'ativo')`,
      [H1, TENANT],
    );
    await dono.query(`insert into app.proprietario (id, tenant_id, nome) values ($1, $2, 'Dono')`, [
      PROPRIETARIO,
      TENANT,
    ]);
    await dono.query(
      `insert into app.hotel_proprietario (id, tenant_id, proprietario_id, hotel_id, vigencia_inicio)
       values ($1, $2, $3, $4, current_date - 1)`,
      [randomUUID(), TENANT, PROPRIETARIO, H1],
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
      usuario: string,
      papel: string,
      escopo: string,
      hotel: string | null,
      proprietario: string | null = null,
    ) =>
      dono.query(
        `insert into app.atribuicao_escopo (id, tenant_id, usuario_id, papel, escopo_tipo, hotel_id, proprietario_id, concedido_por)
         values ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [randomUUID(), TENANT, usuario, papel, escopo, hotel, proprietario, U.admin],
      );
    await atribuir(U.admin, 'admin_grupo', 'grupo', null);
    await atribuir(U.gerente, 'gerente_hotel', 'hotel', H1);
    await atribuir(U.tecnico, 'tecnico', 'hotel', H1);
    await atribuir(U.dono, 'proprietario', 'proprietario', null, PROPRIETARIO);
    banco = await criarAcessoBanco({ app: { url: URL_APP ?? '', max: 2 } });
    const deps = {
      situacoes: criarPortaSituacoes(banco),
      prioridades: criarPortaPrioridades(banco),
      atribuicoes: criarPortasDeAplicacao(banco).atribuicoes,
      relogio: relogioDoSistema,
    };
    casos = criarCasosDeUsoDeSituacoes(deps);
    semChecagem = criarCasosDeUsoDeSituacoes({
      ...deps,
      podeGerirSituacoes: () => ({ permitido: true }),
      podeGerirPrioridades: () => ({ permitido: true }),
    });
  });

  afterAll(async () => {
    await banco?.encerrar();
    if (!dono) return;
    for (const t of [
      'app.evento_dominio',
      'app.auditoria',
      'app.situacao',
      'app.prioridade',
      'app.atribuicao_escopo',
      'app.hotel_proprietario',
      'app.proprietario',
      'app.hotel',
      'app.membro',
    ]) {
      await dono.query(`delete from ${t} where tenant_id = $1`, [TENANT]);
    }
    await dono.query(`delete from app.tenant where id = $1`, [TENANT]);
    await dono.query(`delete from auth.users where id = any($1::uuid[])`, [Object.values(U)]);
  });

  it('instala as padrão uma vez e cria as do tenant; técnico e proprietário leem', async () => {
    expect(await casos.instalarPadrao(ctx(U.admin))).toEqual({
      situacoes: SITUACOES_PADRAO.length,
      prioridades: PRIORIDADES_PADRAO.length,
    });
    expect(await casos.instalarPadrao(ctx(U.admin))).toEqual({ situacoes: 0, prioridades: 0 });
    ({ id: aguardandoPeca } = await casos.criarSituacao(ctx(U.admin), {
      entidade: 'os',
      estado: 'em_execucao',
      nomes: { 'pt-BR': ' Aguardando  peça ', es: 'Esperando pieza' },
      ordem: 35,
      cor: '#B45309',
    }));
    ({ id: critica } = await casos.criarPrioridade(ctx(U.admin), {
      nomes: { 'pt-BR': 'Crítica' },
      ordem: 5,
      peso: 200,
    }));

    const doTecnico = await casos.listarSituacoesEPrioridades(ctx(U.tecnico));
    expect(doTecnico.idiomaPadrao).toBe('pt-BR');
    expect(doTecnico.situacoes.find((s) => s.id === aguardandoPeca)).toMatchObject({
      entidade: 'os',
      estado: 'em_execucao',
      chavePadrao: null,
      nomes: { 'pt-BR': 'Aguardando peça', es: 'Esperando pieza' },
      cor: '#b45309',
      ativa: true,
    });
    // Na ordem da tela: a crítica (ordem 5) antes da urgente (10).
    expect(doTecnico.prioridades.map((p) => p.chavePadrao ?? p.id)).toEqual([
      critica,
      ...PRIORIDADES_PADRAO.map((p) => p.chave),
    ]);
    const doDono = await casos.listarSituacoesEPrioridades(ctx(U.dono));
    expect(doDono.situacoes).toHaveLength(SITUACOES_PADRAO.length + 1);
    expect(doDono.prioridades).toHaveLength(PRIORIDADES_PADRAO.length + 1);
  });

  it('entradas fora do formato são recusadas com o código', async () => {
    const admin = ctx(U.admin);
    const base = {
      entidade: 'os',
      estado: 'pausada',
      nomes: { 'pt-BR': 'X' },
      ordem: 1,
      cor: '#000000',
    };
    await expect(
      casos.criarSituacao(admin, { ...base, estado: 'em_triagem' }),
    ).rejects.toMatchObject({ codigo: 'estado_invalido' });
    await expect(casos.criarSituacao(admin, { ...base, nomes: {} })).rejects.toMatchObject({
      codigo: 'situacao_nome_invalido',
    });
    await expect(casos.criarSituacao(admin, { ...base, ordem: 0 })).rejects.toMatchObject({
      codigo: 'ordem_invalida',
    });
    await expect(casos.criarSituacao(admin, { ...base, cor: 'azul' })).rejects.toMatchObject({
      codigo: 'cor_invalida',
    });
    await expect(
      casos.alterarPrioridade(admin, critica, { nomes: { 'pt-BR': 'Crítica' }, ordem: 5, peso: 0 }),
    ).rejects.toMatchObject({ codigo: 'peso_invalido' });
  });

  it('a padrão aceita nome próprio; a última ativa do estado e a última prioridade não saem', async () => {
    const admin = ctx(U.admin);
    const { situacoes, prioridades } = await casos.listarSituacoesEPrioridades(admin);
    const pausada = situacoes.find((s) => s.chavePadrao === 'os_pausada');
    await casos.alterarSituacao(admin, pausada?.id ?? '', {
      nomes: { 'pt-BR': 'Parada' },
      ordem: 30,
      cor: '#6B7280',
    });
    await expect(casos.desativarSituacao(admin, pausada?.id ?? '')).rejects.toMatchObject({
      codigo: 'ultima_situacao_do_estado',
      parametros: { entidade: 'os', estado: 'pausada' },
    });
    // Há outra em execução (a padrão): esta sai e volta.
    await casos.desativarSituacao(admin, aguardandoPeca);
    await casos.reativarSituacao(admin, aguardandoPeca);

    const outras = prioridades.filter((p) => p.id !== critica);
    for (const p of outras) await casos.desativarPrioridade(admin, p.id);
    await expect(casos.desativarPrioridade(admin, critica)).rejects.toMatchObject({
      codigo: 'ultima_prioridade',
    });
    for (const p of outras) await casos.reativarPrioridade(admin, p.id);
  });

  it('o gerente não gere; com a checagem removida, a RLS ainda barra', async () => {
    const gerente = ctx(U.gerente);
    await expect(
      casos.criarPrioridade(gerente, { nomes: { 'pt-BR': 'X' }, ordem: 1, peso: 1 }),
    ).rejects.toMatchObject({ codigo: 'prioridades_so_admin' });
    await expect(
      casos.criarSituacao(gerente, {
        entidade: 'os',
        estado: 'pausada',
        nomes: { 'pt-BR': 'X' },
        ordem: 1,
        cor: '#000000',
      }),
    ).rejects.toMatchObject({ codigo: 'situacoes_so_admin' });
    await expect(
      semChecagem.criarPrioridade(gerente, { nomes: { 'pt-BR': 'X' }, ordem: 1, peso: 1 }),
    ).rejects.toMatchObject({ code: '42501' });
    await expect(semChecagem.desativarSituacao(gerente, aguardandoPeca)).rejects.toMatchObject({
      codigo: 'situacao_nao_encontrada',
    });
    await expect(semChecagem.desativarPrioridade(gerente, critica)).rejects.toMatchObject({
      codigo: 'prioridade_nao_encontrada',
    });
  });

  it('cada gravação vai para a auditoria', async () => {
    const { rows } = await dono.query(
      `select entidade, acao, count(*)::int as n from app.auditoria
       where tenant_id = $1 and entidade in ('situacao', 'prioridade')
       group by entidade, acao order by entidade, acao`,
      [TENANT],
    );
    const outras = PRIORIDADES_PADRAO.length;
    expect(rows).toEqual([
      { entidade: 'prioridade', acao: 'criar', n: PRIORIDADES_PADRAO.length + 1 },
      { entidade: 'prioridade', acao: 'desativar', n: outras },
      { entidade: 'prioridade', acao: 'reativar', n: outras },
      { entidade: 'situacao', acao: 'alterar', n: 1 },
      { entidade: 'situacao', acao: 'criar', n: SITUACOES_PADRAO.length + 1 },
      { entidade: 'situacao', acao: 'desativar', n: 1 },
      { entidade: 'situacao', acao: 'reativar', n: 1 },
    ]);
  });
});
