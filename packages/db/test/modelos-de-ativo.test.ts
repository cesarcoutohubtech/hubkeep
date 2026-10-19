// Modelos de ativo (fase 1b, M1; migração 0050) contra Postgres real (na CI,
// o Supabase do runner):
//   - o Admin do grupo cria, altera, desativa e reativa; a versão sobe a cada
//     gravação e a versão antiga dá conflito (ADR-029);
//   - o Técnico lê os modelos (o PWA baixa para cadastrar offline) e o
//     Solicitante não;
//   - o Gerente não grava (domínio) e, sem a regra, a RLS também não;
//   - a gravação fica na auditoria e no outbox;
//   - as sugestões de plano (M1c; 0051): o Gerente vê o ativo com modelo e
//     sem plano, cria o plano pausado com um clique e o ativo sai da lista; o
//     descarte grava quem, quando e o motivo; o Técnico não mexe.
//
//   HK_TESTE_URL_APP, HK_TESTE_URL_DONO
import { randomUUID } from 'node:crypto';
import {
  criarCasosDeUsoDeAtivos,
  criarCasosDeUsoDeModelosDeAtivo,
  criarCasosDeUsoDePlanosPreventivos,
  criarCasosDeUsoDeSugestoesDePlano,
  relogioDoSistema,
} from '@hubkeep/aplicacao';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type AcessoBanco,
  criarAcessoBanco,
  criarPortaAtivos,
  criarPortaModelosDeAtivo,
  criarPortaPlanosPreventivos,
  criarPortaSugestoesDePlano,
  criarPortaTriagem,
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
const CATEGORIA = randomUUID();
const UH = randomUUID();
const U = {
  admin: randomUUID(),
  gerente: randomUUID(),
  tecnico: randomUUID(),
  solicitante: randomUUID(),
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

describe.skipIf(!temBanco)('M1 — modelos de ativo', { timeout: 60_000 }, () => {
  let dono: pg.Client;
  let banco: AcessoBanco;
  let modelos: ReturnType<typeof criarCasosDeUsoDeModelosDeAtivo>;
  let semRegra: ReturnType<typeof criarCasosDeUsoDeModelosDeAtivo>;
  let ativos: ReturnType<typeof criarCasosDeUsoDeAtivos>;
  let sugestoes: ReturnType<typeof criarCasosDeUsoDeSugestoesDePlano>;

  beforeAll(async () => {
    dono = new pg.Client({ connectionString: URL_DONO });
    await dono.connect();
    await dono.query(`insert into app.tenant (id, nome) values ($1, 'Grupo M1')`, [TENANT]);
    await dono.query(
      `insert into app.hotel (id, tenant_id, nome, fuso, status) values ($1, $2, 'Hotel', 'UTC', 'ativo')`,
      [H1, TENANT],
    );
    await dono.query(
      `insert into app.categoria_ativo (id, tenant_id, nomes, campos) values ($1, $2, $3, $4)`,
      [
        CATEGORIA,
        TENANT,
        JSON.stringify({ 'pt-BR': 'Ar-condicionado' }),
        JSON.stringify([
          {
            chave: 'btus',
            tipo: 'numero',
            obrigatorio: true,
            rotulos: { 'pt-BR': 'BTUs' },
            unidade: null,
            opcoes: [],
          },
        ]),
      ],
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
    await atribuir(U.solicitante, 'solicitante', 'hotel', H1);

    banco = await criarAcessoBanco({ app: { url: URL_APP ?? '', max: 4 } });
    const deps = {
      modelos: criarPortaModelosDeAtivo(banco),
      atribuicoes: criarPortasDeAplicacao(banco).atribuicoes,
      relogio: relogioDoSistema,
    };
    modelos = criarCasosDeUsoDeModelosDeAtivo(deps);
    ativos = criarCasosDeUsoDeAtivos({
      ativos: criarPortaAtivos(banco),
      atribuicoes: deps.atribuicoes,
      relogio: relogioDoSistema,
    });
    const planos = criarPortaPlanosPreventivos(banco);
    sugestoes = criarCasosDeUsoDeSugestoesDePlano({
      sugestoes: criarPortaSugestoesDePlano(banco),
      planos,
      criarPlano: criarCasosDeUsoDePlanosPreventivos({
        planos,
        triagem: criarPortaTriagem(banco),
        atribuicoes: deps.atribuicoes,
        relogio: relogioDoSistema,
      }).criar,
      atribuicoes: deps.atribuicoes,
      relogio: relogioDoSistema,
    });
    // Sem a regra do domínio: só a RLS decide.
    semRegra = criarCasosDeUsoDeModelosDeAtivo({
      ...deps,
      regras: { podeGerir: () => ({ permitido: true }) },
    });
  });

  afterAll(async () => {
    await banco?.encerrar();
    if (!dono) return;
    for (const t of [
      'app.evento_dominio',
      'app.auditoria',
      'app.plano_preventivo',
      'app.ativo',
      'app.modelo_ativo',
      'app.categoria_ativo',
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

  const PEDIDO = {
    categoriaId: CATEGORIA,
    nome: 'Split 12.000',
    fabricante: 'Fabricante X',
    modelo: 'X-12',
    campos: { btus: 12000 },
    checklistModeloId: null,
    planoSugerido: { intervalo: 3, unidade: 'mes' },
  };
  let modeloId = '';

  it('o Admin cria e altera; a versão sobe e a antiga dá conflito', async () => {
    ({ id: modeloId } = await modelos.criar(ctx(U.admin), PEDIDO));
    expect(
      await modelos.alterar(ctx(U.admin), modeloId, { ...PEDIDO, nome: 'Split 12k', versao: 1 }),
    ).toEqual({ versao: 2 });
    expect(await codigoDe(modelos.alterar(ctx(U.admin), modeloId, { ...PEDIDO, versao: 1 }))).toBe(
      'conflito_de_versao',
    );
    expect(await modelos.desativar(ctx(U.admin), modeloId, 2)).toEqual({ versao: 3 });
    expect(await modelos.reativar(ctx(U.admin), modeloId, 3)).toEqual({ versao: 4 });
  });

  it('o Técnico lê os modelos, com campos e periodicidade; o Solicitante não', async () => {
    expect(await modelos.listar(ctx(U.tecnico))).toMatchObject([
      {
        id: modeloId,
        nome: 'Split 12k',
        campos: { btus: 12000 },
        planoSugerido: { intervalo: 3, unidade: 'mes' },
        versao: 4,
        ativa: true,
      },
    ]);
    expect(await modelos.listar(ctx(U.solicitante))).toEqual([]);
  });

  it('o Gerente não grava, nem pelo domínio nem pela RLS', async () => {
    expect(await codigoDe(modelos.criar(ctx(U.gerente), PEDIDO))).toBe('modelos_de_ativo_so_admin');
    expect(await codigoDe(semRegra.criar(ctx(U.gerente), PEDIDO))).not.toBeNull();
    expect(
      await codigoDe(semRegra.alterar(ctx(U.gerente), modeloId, { ...PEDIDO, versao: 4 })),
    ).toBe('modelo_ativo_nao_encontrado');
  });

  it('o Técnico cadastra o ativo com o modelo, e o ativo guarda de que modelo nasceu', async () => {
    const { id } = await ativos.cadastrar(ctx(U.tecnico), {
      localId: UH,
      categoriaId: CATEGORIA,
      nome: 'Split UH 101',
      fabricante: 'Fabricante X',
      modelo: 'X-12',
      numeroSerie: null,
      campos: { btus: 12000 },
      modeloId,
    });
    const [lido] = (await ativos.listarAtivos(ctx(U.tecnico), H1)).filter((a) => a.id === id);
    expect(lido?.modeloId).toBe(modeloId);
  });

  const cadastrarComModelo = async (nome: string) =>
    (
      await ativos.cadastrar(ctx(U.tecnico), {
        localId: UH,
        categoriaId: CATEGORIA,
        nome,
        fabricante: null,
        modelo: null,
        numeroSerie: null,
        campos: { btus: 12000 },
        modeloId,
      })
    ).id;

  it('o Gerente vê a sugestão, cria o plano pausado e o ativo sai da lista', async () => {
    const id = await cadastrarComModelo('Split UH 101 B');
    const antes = await sugestoes.listar(ctx(U.gerente), H1);
    expect(antes.sugestoes.find((x) => x.ativoId === id)).toMatchObject({
      modeloId,
      periodicidade: { intervalo: 3, unidade: 'mes' },
    });
    const { id: planoId } = await sugestoes.criarPlano(ctx(U.gerente), id);
    const plano = await dono.query<{
      situacao: string;
      tecnico_id: string | null;
      criado_por: string;
    }>(`select situacao, tecnico_id, criado_por from app.plano_preventivo where id = $1`, [
      planoId,
    ]);
    expect(plano.rows).toEqual([{ situacao: 'pausado', tecnico_id: null, criado_por: U.gerente }]);
    const depois = await sugestoes.listar(ctx(U.gerente), H1);
    expect(depois.sugestoes.some((x) => x.ativoId === id)).toBe(false);
    expect(await codigoDe(sugestoes.criarPlano(ctx(U.gerente), id))).toBe(
      'sugestao_de_plano_indisponivel',
    );
  });

  it('o descarte grava quem, quando e o motivo; o Técnico não descarta', async () => {
    const id = await cadastrarComModelo('Split UH 101 C');
    const { sugestoes: lista } = await sugestoes.listar(ctx(U.gerente), H1);
    const s = lista.find((x) => x.ativoId === id);
    expect(s).toBeDefined();
    expect(await codigoDe(sugestoes.descartar(ctx(U.tecnico), id, s?.ativoVersao ?? 0, 'x'))).toBe(
      'planos_fora_do_escopo',
    );
    await sugestoes.descartar(ctx(U.gerente), id, s?.ativoVersao ?? 0, 'Ativo reserva');
    const linha = await dono.query<{ por: string; motivo: string; em: Date | null }>(
      `select sugestao_descartada_por as por, sugestao_descarte_motivo as motivo,
              sugestao_descartada_em as em
         from app.ativo where id = $1`,
      [id],
    );
    expect(linha.rows[0]).toMatchObject({ por: U.gerente, motivo: 'Ativo reserva' });
    expect(linha.rows[0]?.em).not.toBeNull();
    const depois = await sugestoes.listar(ctx(U.gerente), H1);
    expect(depois.sugestoes.some((x) => x.ativoId === id)).toBe(false);
    const auditoria = await dono.query(
      `select 1 from app.auditoria
        where tenant_id = $1 and entidade = 'ativo' and registro_id = $2 and acao = 'descartar_sugestao'`,
      [TENANT, id],
    );
    expect(auditoria.rowCount).toBe(1);
  });

  it('a gravação fica na auditoria e no outbox', async () => {
    const auditoria = await dono.query<{ acao: string }>(
      `select acao from app.auditoria where tenant_id = $1 and entidade = 'modelo_ativo'`,
      [TENANT],
    );
    expect(auditoria.rows.map((r) => r.acao).sort()).toEqual(
      ['alterar', 'criar', 'desativar', 'reativar'].sort(),
    );
    const eventos = await dono.query<{ tipo: string }>(
      `select tipo from app.evento_dominio where tenant_id = $1 and tipo like 'modelo_ativo.%'`,
      [TENANT],
    );
    expect(eventos.rows.length).toBe(4);
  });
});
