// Consultas da C7 (fase 1a) contra Postgres real (na CI, o Supabase do runner):
//   - cada papel lista só os chamados e as OS do próprio escopo (RLS): Admin
//     do grupo, Gestor CSC da bandeira, Gerente de cada hotel, Técnico,
//     Solicitante, proprietário da UH e o Admin de outro tenant;
//   - filtros: hotel, situação, prioridade, período (de inclusive, ate
//     exclusive) e a continuação da página (depoisDe);
//   - nomes do detalhe (hotel, local, ativo, quem abriu, responsável);
//   - linha do tempo: abertura, parada, geração e reabertura da OS (com o
//     motivo), cancelamento do chamado (com o motivo); o proprietário não lê
//     a auditoria e recebe a lista vazia; fora do escopo, 404.
//
//   HK_TESTE_URL_APP, HK_TESTE_URL_DONO
import { randomUUID } from 'node:crypto';
import {
  criarCasosDeUsoDeChamados,
  criarCasosDeUsoDeConsultas,
  criarCasosDeUsoDeSituacoes,
  criarCasosDeUsoDeTriagem,
  relogioDoSistema,
} from '@hubkeep/aplicacao';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type AcessoBanco,
  criarAcessoBanco,
  criarPortaChamados,
  criarPortaConsultasDaCorretiva,
  criarPortaPrioridades,
  criarPortaSituacoes,
  criarPortaTriagem,
  criarPortasDeAplicacao,
} from '../src/index';
import { semFeriadosOficiais } from './feriados-de-teste';

const URL_APP = process.env.HK_TESTE_URL_APP;
const URL_DONO = process.env.HK_TESTE_URL_DONO;
const temBanco = Boolean(URL_APP && URL_DONO);
if (!temBanco && process.env.HK_EXIGIR_BANCO === '1') {
  throw new Error('HK_EXIGIR_BANCO=1, mas faltam HK_TESTE_URL_APP/DONO.');
}

const TENANT = randomUUID();
const OUTRO_TENANT = randomUUID();
const BANDEIRA_X = randomUUID();
const BANDEIRA_Y = randomUUID();
const H1 = randomUUID();
const H2 = randomUUID();
const HB = randomUUID();
const UH = randomUUID();
const AREA = randomUUID();
const L2 = randomUUID();
const LB = randomUUID();
const ATIVO = randomUUID();
const PROPRIETARIO = randomUUID();
const U = {
  admin: randomUUID(),
  gestorX: randomUUID(),
  gerente: randomUUID(),
  gerente2: randomUUID(),
  tecnico: randomUUID(),
  tecnico2: randomUUID(),
  solicitante: randomUUID(),
  dono: randomUUID(),
};
const ADMIN_B = randomUUID();
const ctx = (usuarioId: string) => ({ usuarioId, tenantId: TENANT });
const ctxB = { usuarioId: ADMIN_B, tenantId: OUTRO_TENANT };

describe.skipIf(!temBanco)('C7 — listas e linha do tempo', { timeout: 60_000 }, () => {
  let dono: pg.Client;
  let banco: AcessoBanco;
  let consultas: ReturnType<typeof criarCasosDeUsoDeConsultas>;
  const situacao: Record<string, string> = {};
  const prioridade: Record<string, string> = {};
  const id = { c1: '', c2: '', c3: '', cB: '', os1: '', os3: '' };

  const chamadosDe = async (quem: string, filtro = {}) =>
    (await consultas.listarChamados(ctx(quem), filtro)).itens.map((c) => c.id).sort();
  const osDe = async (quem: string, filtro = {}) =>
    (await consultas.listarOs(ctx(quem), filtro)).itens.map((o) => o.id).sort();
  const ordenados = (...ids: string[]) => [...ids].sort();

  beforeAll(async () => {
    dono = new pg.Client({ connectionString: URL_DONO });
    await dono.connect();
    for (const [tenant, nome] of [
      [TENANT, 'Grupo C7'],
      [OUTRO_TENANT, 'Outro grupo C7'],
    ])
      await dono.query(`insert into app.tenant (id, nome) values ($1, $2)`, [tenant, nome]);
    for (const [b, nome] of [
      [BANDEIRA_X, 'Bandeira X'],
      [BANDEIRA_Y, 'Bandeira Y'],
    ])
      await dono.query(`insert into app.bandeira (id, tenant_id, nome) values ($1, $2, $3)`, [
        b,
        TENANT,
        nome,
      ]);
    for (const [hotel, tenant, bandeira, nome] of [
      [H1, TENANT, BANDEIRA_X, 'Hotel Um'],
      [H2, TENANT, BANDEIRA_Y, 'Hotel Dois'],
      [HB, OUTRO_TENANT, null, 'Hotel B'],
    ])
      await dono.query(
        `insert into app.hotel (id, tenant_id, bandeira_id, nome, fuso, status)
         values ($1, $2, $3, $4, 'UTC', 'ativo')`,
        [hotel, tenant, bandeira, nome],
      );
    for (const [local, tenant, hotel, tipo, nome] of [
      [UH, TENANT, H1, 'uh', 'UH 101'],
      [AREA, TENANT, H1, 'area_comum', 'Piscina'],
      [L2, TENANT, H2, 'uh', 'UH 201'],
      [LB, OUTRO_TENANT, HB, 'uh', 'UH B'],
    ])
      await dono.query(
        `insert into app.local (id, tenant_id, hotel_id, tipo, nome, busca, status)
         values ($1, $2, $3, $4, $5, lower($5), 'ativo')`,
        [local, tenant, hotel, tipo, nome],
      );
    const membros: [string, string, string][] = [
      ...Object.entries(U).map(([nome, u]) => [TENANT, u, nome] as [string, string, string]),
      [OUTRO_TENANT, ADMIN_B, 'adminB'],
    ];
    for (const [tenant, u, nome] of membros) {
      await dono.query(`insert into auth.users (id, email) values ($1, $2)`, [
        u,
        `${u}@hubkeep.invalid`,
      ]);
      await dono.query(
        `insert into app.membro (tenant_id, usuario_id, nome, email) values ($1, $2, $3, $4)`,
        [tenant, u, nome, `${u}@hubkeep.invalid`],
      );
    }
    const atribuir = (
      usuario: string,
      papel: string,
      escopo: string,
      alvo: { hotel?: string; bandeira?: string; tenant?: string; por?: string } = {},
    ) =>
      dono.query(
        `insert into app.atribuicao_escopo
           (id, tenant_id, usuario_id, papel, escopo_tipo, hotel_id, bandeira_id, concedido_por)
         values ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          randomUUID(),
          alvo.tenant ?? TENANT,
          usuario,
          papel,
          escopo,
          alvo.hotel ?? null,
          alvo.bandeira ?? null,
          alvo.por ?? U.admin,
        ],
      );
    await atribuir(U.admin, 'admin_grupo', 'grupo');
    await atribuir(U.gestorX, 'gestor_csc', 'bandeira', { bandeira: BANDEIRA_X });
    await atribuir(U.gerente, 'gerente_hotel', 'hotel', { hotel: H1 });
    await atribuir(U.gerente2, 'gerente_hotel', 'hotel', { hotel: H2 });
    await atribuir(U.tecnico, 'tecnico', 'hotel', { hotel: H1 });
    await atribuir(U.tecnico2, 'tecnico', 'hotel', { hotel: H2 });
    await atribuir(U.solicitante, 'solicitante', 'hotel', { hotel: H1 });
    await atribuir(ADMIN_B, 'admin_grupo', 'grupo', { tenant: OUTRO_TENANT, por: ADMIN_B });
    await dono.query(
      `insert into app.proprietario (id, tenant_id, nome) values ($1, $2, 'Dono da UH')`,
      [PROPRIETARIO, TENANT],
    );
    await dono.query(
      `insert into app.local_proprietario (id, tenant_id, proprietario_id, local_id, vigencia_inicio)
       values ($1, $2, $3, $4, current_date - 1)`,
      [randomUUID(), TENANT, PROPRIETARIO, UH],
    );
    await dono.query(
      `insert into app.atribuicao_escopo (id, tenant_id, usuario_id, papel, escopo_tipo, proprietario_id, concedido_por)
       values ($1, $2, $3, 'proprietario', 'proprietario', $4, $5)`,
      [randomUUID(), TENANT, U.dono, PROPRIETARIO, U.admin],
    );
    await dono.query(
      `insert into app.ativo (codigo_qr, id, tenant_id, hotel_id, local_id, nome, busca)
       values ('0000C7A001', $1, $2, $3, $4, 'Frigobar 101', 'frigobar 101')`,
      [ATIVO, TENANT, H1, UH],
    );

    banco = await criarAcessoBanco({ app: { url: URL_APP ?? '', max: 4 } });
    const atribuicoes = criarPortasDeAplicacao(banco).atribuicoes;
    const situacoes = criarPortaSituacoes(banco);
    const prioridades = criarPortaPrioridades(banco);
    const configuracao = criarCasosDeUsoDeSituacoes({
      situacoes,
      prioridades,
      atribuicoes,
      relogio: relogioDoSistema,
    });
    await configuracao.instalarPadrao(ctx(U.admin));
    await configuracao.instalarPadrao(ctxB);
    const lista = await configuracao.listarSituacoesEPrioridades(ctx(U.admin));
    for (const s of lista.situacoes) if (s.chavePadrao) situacao[s.chavePadrao] = s.id;
    for (const p of lista.prioridades) if (p.chavePadrao) prioridade[p.chavePadrao] = p.id;

    const chamados = criarCasosDeUsoDeChamados({
      chamados: criarPortaChamados(banco),
      situacoes,
      prioridades,
      atribuicoes,
      relogio: relogioDoSistema,
      feriadosOficiais: semFeriadosOficiais,
    });
    const triagem = criarCasosDeUsoDeTriagem({
      triagem: criarPortaTriagem(banco),
      situacoes,
      prioridades,
      atribuicoes,
      relogio: relogioDoSistema,
      feriadosOficiais: semFeriadosOficiais,
    });
    consultas = criarCasosDeUsoDeConsultas({ consultas: criarPortaConsultasDaCorretiva(banco) });

    // c1: na UH do proprietário, com o ativo parado; OS do Técnico, concluída e reaberta.
    id.c1 = (
      await chamados.abrir(ctx(U.solicitante), {
        localId: UH,
        ativoId: ATIVO,
        descricao: 'Frigobar não gela',
        paradoDesde: new Date(Date.now() - 3_600_000).toISOString(),
      })
    ).id;
    const os1 = await triagem.gerarOs(ctx(U.gerente), id.c1, {
      versao: (await chamados.chamado(ctx(U.gerente), id.c1)).versao,
      responsavel: { tipo: 'tecnico', usuarioId: U.tecnico },
    });
    id.os1 = os1.id;
    const concluida = await dono.query<{ versao: number }>(
      `update app.os set estado = 'concluida', situacao_id = $2, versao = versao + 1 where id = $1 returning versao`,
      [id.os1, situacao['os_concluida']],
    );
    await dono.query(
      `update app.chamado set estado = 'aguardando_aceite', situacao_id = $2, versao = versao + 1 where id = $1`,
      [id.c1, situacao['chamado_aguardando_aceite']],
    );
    await triagem.reabrirOs(ctx(U.gerente), id.os1, {
      versao: concluida.rows[0]?.versao ?? 0,
      motivo: 'Voltou a pingar',
    });

    // c2: na área comum do Hotel Um, urgente, cancelado com motivo.
    id.c2 = (
      await chamados.abrir(ctx(U.gerente), { localId: AREA, descricao: 'Piscina turva' })
    ).id;
    await dono.query(`update app.chamado set prioridade_id = $2 where id = $1`, [
      id.c2,
      prioridade['urgente'],
    ]);
    await triagem.cancelarChamado(ctx(U.gerente), id.c2, {
      versao: (await chamados.chamado(ctx(U.gerente), id.c2)).versao,
      motivo: 'Duplicado',
    });

    // c3: no Hotel Dois, aberto em janeiro; OS do Técnico de lá.
    id.c3 = (await chamados.abrir(ctx(U.gerente2), { localId: L2, descricao: 'Chuveiro frio' })).id;
    id.os3 = (
      await triagem.gerarOs(ctx(U.gerente2), id.c3, {
        versao: (await chamados.chamado(ctx(U.gerente2), id.c3)).versao,
        responsavel: { tipo: 'tecnico', usuarioId: U.tecnico2 },
      })
    ).id;
    await dono.query(`update app.chamado set criado_em = '2026-01-15T12:00:00Z' where id = $1`, [
      id.c3,
    ]);
    await dono.query(`update app.os set criado_em = '2026-01-15T13:00:00Z' where id = $1`, [
      id.os3,
    ]);

    // Outro tenant.
    id.cB = (await chamados.abrir(ctxB, { localId: LB, descricao: 'Outro grupo' })).id;
  });

  afterAll(async () => {
    await banco?.encerrar();
    if (!dono) return;
    for (const tenant of [TENANT, OUTRO_TENANT]) {
      for (const t of [
        'app.evento_dominio',
        'app.auditoria',
        'app.parada_ativo',
        'app.os_transicao',
        'app.os',
        'app.chamado',
        'app.ativo',
        'app.situacao',
        'app.prioridade',
        'app.atribuicao_escopo',
        'app.local_proprietario',
        'app.proprietario',
        'app.local',
        'app.hotel',
        'app.bandeira',
        'app.membro',
      ]) {
        await dono.query(`delete from ${t} where tenant_id = $1`, [tenant]);
      }
      await dono.query(`delete from app.tenant where id = $1`, [tenant]);
    }
    await dono.query(`delete from auth.users where id = any($1::uuid[])`, [
      [...Object.values(U), ADMIN_B],
    ]);
    await dono.end();
  });

  it('cada papel lista só os chamados do próprio escopo', async () => {
    expect(await chamadosDe(U.admin)).toEqual(ordenados(id.c1, id.c2, id.c3));
    expect(await chamadosDe(U.gestorX)).toEqual(ordenados(id.c1, id.c2));
    expect(await chamadosDe(U.gerente)).toEqual(ordenados(id.c1, id.c2));
    expect(await chamadosDe(U.gerente2)).toEqual([id.c3]);
    expect(await chamadosDe(U.tecnico)).toEqual(ordenados(id.c1, id.c2));
    expect(await chamadosDe(U.solicitante)).toEqual(ordenados(id.c1, id.c2));
    expect(await chamadosDe(U.dono)).toEqual([id.c1]);
    const doOutroTenant = await consultas.listarChamados(ctxB, {});
    expect(doOutroTenant.itens.map((c) => c.id)).toEqual([id.cB]);
  });

  it('cada papel lista só as OS do próprio escopo', async () => {
    expect(await osDe(U.admin)).toEqual(ordenados(id.os1, id.os3));
    expect(await osDe(U.gestorX)).toEqual([id.os1]);
    expect(await osDe(U.gerente)).toEqual([id.os1]);
    expect(await osDe(U.gerente2)).toEqual([id.os3]);
    expect(await osDe(U.tecnico)).toEqual([id.os1]);
    expect(await osDe(U.tecnico2)).toEqual([id.os3]);
    expect(await osDe(U.solicitante)).toEqual([id.os1]);
    expect(await osDe(U.dono)).toEqual([id.os1]);
    expect((await consultas.listarOs(ctxB, {})).itens).toEqual([]);
  });

  it('filtros: hotel, situação, prioridade e período', async () => {
    expect(await chamadosDe(U.admin, { hotelId: H2 })).toEqual([id.c3]);
    expect(await chamadosDe(U.admin, { situacaoId: situacao['chamado_cancelado'] })).toEqual([
      id.c2,
    ]);
    expect(await chamadosDe(U.admin, { prioridadeId: prioridade['urgente'] })).toEqual([id.c2]);
    expect(
      await chamadosDe(U.admin, { de: '2026-01-01T00:00:00Z', ate: '2026-02-01T00:00:00Z' }),
    ).toEqual([id.c3]);
    expect(await chamadosDe(U.admin, { de: '2026-02-01T00:00:00Z' })).toEqual(
      ordenados(id.c1, id.c2),
    );
    // ate é exclusive.
    expect(await chamadosDe(U.admin, { ate: '2026-01-15T12:00:00Z' })).toEqual([]);
    // O filtro não abre escopo: o Gerente do Hotel Um pedindo o Hotel Dois não vê nada.
    expect(await chamadosDe(U.gerente, { hotelId: H2 })).toEqual([]);

    expect(await osDe(U.admin, { hotelId: H1 })).toEqual([id.os1]);
    expect(await osDe(U.admin, { situacaoId: situacao['os_em_execucao'] })).toEqual([id.os1]);
    expect(
      await osDe(U.admin, { de: '2026-01-01T00:00:00Z', ate: '2026-02-01T00:00:00Z' }),
    ).toEqual([id.os3]);
    await expect(
      consultas.listarChamados(ctx(U.admin), {
        de: '2026-02-01T00:00:00Z',
        ate: '2026-01-01T00:00:00Z',
      }),
    ).rejects.toMatchObject({ codigo: 'periodo_invalido' });
  });

  it('do mais novo para o mais antigo, e depoisDe continua a lista', async () => {
    const todos = (await consultas.listarChamados(ctx(U.admin), {})).itens.map((c) => c.id);
    expect(todos).toEqual([...todos].sort().reverse());
    const [primeiro, ...resto] = todos;
    const seguinte = await consultas.listarChamados(ctx(U.admin), { depoisDe: primeiro });
    expect(seguinte.itens.map((c) => c.id)).toEqual(resto);
    expect(seguinte.proximo).toBeNull();
  });

  it('a lista traz os nomes e o responsável', async () => {
    const [c1] = (await consultas.listarChamados(ctx(U.gerente), { hotelId: H1 })).itens.filter(
      (c) => c.id === id.c1,
    );
    expect(c1).toMatchObject({
      hotelNome: 'Hotel Um',
      localNome: 'UH 101',
      ativoNome: 'Frigobar 101',
      descricao: 'Frigobar não gela',
      estado: 'em_execucao',
    });
    const [os1] = (await consultas.listarOs(ctx(U.gerente), {})).itens;
    expect(os1).toMatchObject({
      id: id.os1,
      chamadoId: id.c1,
      hotelNome: 'Hotel Um',
      localNome: 'UH 101',
      descricao: 'Frigobar não gela',
      estado: 'em_execucao',
      responsavel: { tipo: 'tecnico', usuarioId: U.tecnico },
      responsavelNome: 'tecnico',
    });
  });

  it('nomes do detalhe: hotel, local, ativo, quem abriu e o responsável; fora do escopo, 404', async () => {
    expect(await consultas.nomesDoChamado(ctx(U.gerente), id.c1)).toEqual({
      hotel: 'Hotel Um',
      local: 'UH 101',
      localTipo: 'uh',
      ativo: 'Frigobar 101',
      pessoas: { [U.solicitante]: 'solicitante', [U.tecnico]: 'tecnico' },
      equipes: {},
      fornecedores: {},
    });
    for (const [quem, chamado] of [
      [U.gerente2, id.c1],
      [U.dono, id.c2],
      [U.admin, id.cB],
    ] as const)
      await expect(consultas.nomesDoChamado(ctx(quem), chamado)).rejects.toMatchObject({
        codigo: 'chamado_nao_encontrado',
      });
  });

  it('linha do tempo: abertura, parada, OS gerada e reaberta com o motivo', async () => {
    const eventos = await consultas.linhaDoTempo(ctx(U.gerente), id.c1);
    expect(eventos.map((e) => [e.entidade, e.acao])).toEqual([
      ['chamado', 'abrir'],
      ['parada_ativo', 'registrar'],
      ['os', 'gerar'],
      ['os', 'reabrir'],
    ]);
    expect(eventos[0]).toMatchObject({ usuarioId: U.solicitante, usuarioNome: 'solicitante' });
    expect(eventos[2]).toMatchObject({ registroId: id.os1, usuarioNome: 'gerente', motivo: null });
    expect(eventos[3]).toMatchObject({ motivo: 'Voltou a pingar' });
    // O Técnico e o Solicitante do hotel também leem a auditoria.
    for (const quem of [U.tecnico, U.solicitante])
      expect(await consultas.linhaDoTempo(ctx(quem), id.c1)).toHaveLength(4);
  });

  it('linha do tempo do cancelamento, com o motivo', async () => {
    const eventos = await consultas.linhaDoTempo(ctx(U.admin), id.c2);
    expect(eventos.map((e) => [e.acao, e.motivo])).toEqual([
      ['abrir', null],
      ['cancelar', 'Duplicado'],
    ]);
  });

  it('o proprietário lê a do chamado e da OS da UH, não a da parada nem os nomes; fora do escopo, 404', async () => {
    // Migração 0028 (D1): a parada fica de fora (decisão de 30/09/2026, C5), e o
    // proprietário não lê os membros, então quem gravou vem sem nome.
    const eventos = await consultas.linhaDoTempo(ctx(U.dono), id.c1);
    expect(eventos.map((e) => [e.entidade, e.acao, e.usuarioNome])).toEqual([
      ['chamado', 'abrir', null],
      ['os', 'gerar', null],
      ['os', 'reabrir', null],
    ]);
    await expect(consultas.linhaDoTempo(ctx(U.gerente2), id.c1)).rejects.toMatchObject({
      codigo: 'chamado_nao_encontrado',
    });
    await expect(consultas.linhaDoTempo(ctxB, id.c1)).rejects.toMatchObject({
      codigo: 'chamado_nao_encontrado',
    });
  });
});
