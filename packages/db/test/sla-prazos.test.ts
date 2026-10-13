// Prazos de SLA no chamado (fase 1c; ADR-042) contra Postgres real (na CI, o
// Supabase do runner):
//   - a abertura grava a categoria do ativo, os dois prazos no horário de
//     atendimento do hotel (fuso de São Paulo), sem o feriado do hotel, que o
//     Solicitante lê pela RLS, e a cópia da chamado.sla e do horário;
//   - mudar a política depois não muda o chamado: a triagem com outra
//     prioridade refaz os prazos pela cópia, com antes e depois na auditoria;
//   - depois da OS, a troca de prioridade só muda o prazo de solução;
//   - a pausa com motivo da lista, na categoria com a pausa ligada, para o
//     relógio: a retomada refaz o prazo de solução e soma o tempo parado; o
//     motivo vai na transição, e a auditoria leva o antes e o depois. A
//     pausa com motivo fora da lista não muda nada.
//
//   HK_TESTE_URL_APP, HK_TESTE_URL_DONO
import { randomUUID } from 'node:crypto';
import {
  criarCasosDeUsoDeChamados,
  criarCasosDeUsoDeConfiguracao,
  criarCasosDeUsoDeExecucao,
  criarCasosDeUsoDeSincronizacao,
  criarCasosDeUsoDeSituacoes,
  criarCasosDeUsoDeTriagem,
} from '@hubkeep/aplicacao';
import { HORARIO_PADRAO, type PoliticaDeSla } from '@hubkeep/dominio';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type AcessoBanco,
  criarAcessoBanco,
  criarPortaChamados,
  criarPortaConfiguracao,
  criarPortaExecucao,
  criarPortaOperacoesOffline,
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
const H1 = randomUUID();
const LOBBY = randomUUID();
const CAT = randomUUID();
const ELEVADOR = randomUUID();
const U = {
  admin: randomUUID(),
  gerente: randomUUID(),
  tecnico: randomUUID(),
  solicitante: randomUUID(),
};
const ctx = (usuarioId: string) => ({ usuarioId, tenantId: TENANT });
// Terça, 13/10/2026, 17h em São Paulo; a quarta é feriado do hotel.
const AGORA = new Date('2026-10-13T20:00:00Z');
const H = 3_600_000;
let agora = AGORA;
const relogio = { agora: () => agora };

const linha = (atendimentoHoras: number, solucaoHoras: number, r: '24x7' | 'atendimento') => ({
  atendimentoHoras,
  solucaoHoras,
  relogio: r,
});
const SLA: PoliticaDeSla = {
  porPrioridade: {
    urgente: linha(1, 2, '24x7'),
    alta: linha(2, 8, '24x7'),
    media: linha(2, 10, 'atendimento'),
    baixa: linha(2, 10, 'atendimento'),
  },
  porCategoria: {},
  motivosQuePausam: ['aguardando_peca'],
  pontoFacultativo: false,
  metaPercentual: 90,
};

describe.skipIf(!temBanco)('1c — prazos de SLA no chamado', { timeout: 60_000 }, () => {
  let dono: pg.Client;
  let banco: AcessoBanco;
  let chamados: ReturnType<typeof criarCasosDeUsoDeChamados>;
  let triagem: ReturnType<typeof criarCasosDeUsoDeTriagem>;
  let configuracao: ReturnType<typeof criarCasosDeUsoDeConfiguracao>;
  let sincronizacao: ReturnType<typeof criarCasosDeUsoDeSincronizacao>;
  const prioridade: Record<string, string> = {};
  let id = '';

  const prazos = async () =>
    (
      await dono.query<{ categoria_id: string | null; a: Date; s: Date; copia: unknown }>(
        `select categoria_id, prazo_atendimento as a, prazo_solucao as s, politica_aplicada as copia
         from app.chamado where id = $1`,
        [id],
      )
    ).rows[0];

  beforeAll(async () => {
    dono = new pg.Client({ connectionString: URL_DONO });
    await dono.connect();
    await dono.query(`insert into app.tenant (id, nome) values ($1, 'Grupo SLA')`, [TENANT]);
    await dono.query(
      `insert into app.hotel (id, tenant_id, nome, fuso, status)
       values ($1, $2, 'Hotel SLA', 'America/Sao_Paulo', 'ativo')`,
      [H1, TENANT],
    );
    await dono.query(
      `insert into app.local (id, tenant_id, hotel_id, tipo, nome, busca, status)
       values ($1, $2, $3, 'area_comum', 'Lobby', 'lobby', 'ativo')`,
      [LOBBY, TENANT, H1],
    );
    await dono.query(
      `insert into app.categoria_ativo (id, tenant_id, nomes) values ($1, $2, '{"pt-BR": "Elevadores"}')`,
      [CAT, TENANT],
    );
    await dono.query(
      `insert into app.ativo (id, tenant_id, hotel_id, local_id, categoria_id, nome, busca, codigo_qr)
       values ($1, $2, $3, $4, $5, 'Elevador social', 'elevador social', '0000SA0001')`,
      [ELEVADOR, TENANT, H1, LOBBY, CAT],
    );
    for (const [nome, u] of Object.entries(U)) {
      await dono.query(`insert into auth.users (id, email) values ($1, $2)`, [
        u,
        `${u}@hubkeep.invalid`,
      ]);
      await dono.query(
        `insert into app.membro (tenant_id, usuario_id, nome, email) values ($1, $2, $3, $4)`,
        [TENANT, u, nome, `${u}@hubkeep.invalid`],
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
    await dono.query(
      `insert into app.feriado_hotel (id, tenant_id, hotel_id, data, nome, criado_por)
       values ($1, $2, $3, '2026-10-14', 'Aniversário da cidade', $4)`,
      [randomUUID(), TENANT, H1, U.admin],
    );

    banco = await criarAcessoBanco({ app: { url: URL_APP ?? '', max: 2 } });
    const atribuicoes = criarPortasDeAplicacao(banco).atribuicoes;
    const situacoes = criarPortaSituacoes(banco);
    const prioridades = criarPortaPrioridades(banco);
    const instalar = criarCasosDeUsoDeSituacoes({ situacoes, prioridades, atribuicoes, relogio });
    await instalar.instalarPadrao(ctx(U.admin));
    const lista = await instalar.listarSituacoesEPrioridades(ctx(U.admin));
    for (const p of lista.prioridades) if (p.chavePadrao) prioridade[p.chavePadrao] = p.id;

    const comuns = { situacoes, prioridades, atribuicoes, relogio };
    chamados = criarCasosDeUsoDeChamados({
      ...comuns,
      chamados: criarPortaChamados(banco),
      feriadosOficiais: semFeriadosOficiais,
    });
    triagem = criarCasosDeUsoDeTriagem({
      ...comuns,
      triagem: criarPortaTriagem(banco),
      feriadosOficiais: semFeriadosOficiais,
    });
    sincronizacao = criarCasosDeUsoDeSincronizacao({
      operacoes: criarPortaOperacoesOffline(banco),
      ativos: {
        prepararCadastro: () => Promise.reject(new Error('fora do teste')),
        prepararAlteracao: () => Promise.reject(new Error('fora do teste')),
      },
      chamados,
      execucao: criarCasosDeUsoDeExecucao({
        ...comuns,
        execucao: criarPortaExecucao(banco),
        triagem: criarPortaTriagem(banco),
        feriadosOficiais: semFeriadosOficiais,
      }),
    });
    configuracao = criarCasosDeUsoDeConfiguracao({
      configuracao: criarPortaConfiguracao(banco),
      atribuicoes,
      relogio,
    });
    await configuracao.gravarPolitica(
      ctx(U.admin),
      'chamado.prioridade_padrao_por_categoria',
      { tipo: 'grupo' },
      { [CAT]: prioridade['media'] },
    );
    await configuracao.gravarPolitica(ctx(U.admin), 'chamado.sla', { tipo: 'grupo' }, SLA);
  });

  afterAll(async () => {
    await banco?.encerrar();
    if (!dono) return;
    for (const t of [
      'app.evento_dominio',
      'app.auditoria',
      'app.operacao_offline',
      'app.os_transicao',
      'app.os',
      'app.chamado',
      'app.politica',
      'app.situacao',
      'app.prioridade',
      'app.feriado_hotel',
      'app.ativo',
      'app.categoria_ativo',
      'app.atribuicao_escopo',
      'app.local',
      'app.hotel',
      'app.membro',
    ]) {
      await dono.query(`delete from ${t} where tenant_id = $1`, [TENANT]);
    }
    await dono.query(`delete from app.tenant where id = $1`, [TENANT]);
    await dono.query(`delete from auth.users where id = any($1::uuid[])`, [Object.values(U)]);
  });

  it('a abertura grava a categoria, os prazos no calendário do hotel e a cópia do SLA', async () => {
    ({ id } = await chamados.abrir(ctx(U.solicitante), {
      localId: LOBBY,
      ativoId: ELEVADOR,
      descricao: 'Elevador fazendo barulho',
    }));
    const c = await prazos();
    expect(c?.categoria_id).toBe(CAT);
    // Média, 2 h e 10 h no horário de atendimento: 1 h na terça; a quarta é
    // feriado do hotel; o resto na quinta (9h e 17h em São Paulo).
    expect(c?.a.toISOString()).toBe('2026-10-15T12:00:00.000Z');
    expect(c?.s.toISOString()).toBe('2026-10-15T20:00:00.000Z');
    expect(c?.copia).toMatchObject({
      'chamado.sla': SLA,
      'hotel.horario_atendimento': HORARIO_PADRAO,
    });
  });

  it('a triagem com outra prioridade refaz os prazos pela cópia, com antes e depois na auditoria', async () => {
    await configuracao.gravarPolitica(
      ctx(U.admin),
      'chamado.sla',
      { tipo: 'grupo' },
      { ...SLA, porPrioridade: { ...SLA.porPrioridade, urgente: linha(4, 8, '24x7') } },
    );
    await triagem.triar(ctx(U.gerente), id, { versao: 1, prioridadeId: prioridade['urgente'] });
    const c = await prazos();
    expect(c?.a.toISOString()).toBe('2026-10-13T21:00:00.000Z');
    expect(c?.s.toISOString()).toBe('2026-10-13T22:00:00.000Z');
    const auditoria = await dono.query<{
      antes: Record<string, unknown>;
      depois: Record<string, unknown>;
    }>(
      `select antes, depois from app.auditoria
       where tenant_id = $1 and registro_id = $2 and acao = 'triar'`,
      [TENANT, id],
    );
    expect(auditoria.rows[0]?.antes).toMatchObject({
      prazo_atendimento: '2026-10-15T12:00:00.000Z',
    });
    expect(auditoria.rows[0]?.depois).toMatchObject({
      prazoAtendimento: '2026-10-13T21:00:00.000Z',
      prazoSolucao: '2026-10-13T22:00:00.000Z',
    });
  });

  it('depois da OS, a troca de prioridade só muda o prazo de solução', async () => {
    const os = await triagem.gerarOs(ctx(U.gerente), id, {
      versao: 2,
      responsavel: { tipo: 'tecnico', usuarioId: U.tecnico },
    });
    await triagem.priorizar(ctx(U.gerente), id, {
      versao: os.versaoDoChamado,
      prioridadeId: prioridade['baixa'] ?? '',
    });
    const c = await prazos();
    expect(c?.a.toISOString()).toBe('2026-10-13T21:00:00.000Z');
    expect(c?.s.toISOString()).toBe('2026-10-15T20:00:00.000Z');
  });

  it('a pausa com motivo da lista para o relógio; a retomada refaz o prazo e soma o tempo parado', async () => {
    await configuracao.gravarPolitica(
      ctx(U.admin),
      'chamado.sla',
      { tipo: 'grupo' },
      { ...SLA, porCategoria: { [CAT]: { pausa: true } } },
    );
    agora = AGORA;
    ({ id } = await chamados.abrir(ctx(U.gerente), {
      localId: LOBBY,
      ativoId: ELEVADOR,
      descricao: 'Elevador parado entre andares',
    }));
    // Alta, 2 h e 8 h em 24x7: a solução vence às 4h (UTC) de quarta.
    await triagem.triar(ctx(U.gerente), id, { versao: 1, prioridadeId: prioridade['alta'] });
    const os = await triagem.gerarOs(ctx(U.gerente), id, {
      versao: 2,
      responsavel: { tipo: 'tecnico', usuarioId: U.tecnico },
    });
    // A geração grava a hora do banco (now()), e o teste anda no relógio falso.
    // Sem alinhar, a hora real depois do AGORA puxa o início e a pausa para ela
    // (horaDaTransicao não volta antes da transição anterior).
    await dono.query(`update app.os_transicao set quando = $2 where os_id = $1`, [os.id, AGORA]);
    const operar = async (
      tipo: 'os.iniciar' | 'os.pausar' | 'os.retomar',
      versao: number,
      em: number,
      motivo?: 'aguardando_peca' | 'fim_de_turno',
    ) => {
      agora = new Date(AGORA.getTime() + em);
      const r = await sincronizacao.receberOperacao(ctx(U.tecnico), {
        chave: randomUUID(),
        tipo,
        dados: { osId: os.id, versao, ...(motivo ? { motivo } : {}) },
      });
      return Number(r.resposta['versao']);
    };
    let v = await operar('os.iniciar', os.versao, 0.25 * H);
    v = await operar('os.pausar', v, 1 * H, 'aguardando_peca');
    v = await operar('os.retomar', v, 3 * H);
    let c = await prazos();
    expect(c?.s.toISOString()).toBe('2026-10-14T06:00:00.000Z');
    const pausado = async () =>
      (
        await dono.query<{ n: number }>(
          `select pausado_segundos as n from app.chamado where id = $1`,
          [id],
        )
      ).rows[0]?.n;
    expect(await pausado()).toBe(7200);
    const transicao = await dono.query<{ motivo_pausa: string | null }>(
      `select motivo_pausa from app.os_transicao where os_id = $1 and acao = 'pausar'`,
      [os.id],
    );
    expect(transicao.rows).toEqual([{ motivo_pausa: 'aguardando_peca' }]);
    const auditoria = await dono.query<{ acao: string; depois: Record<string, unknown> }>(
      `select acao, depois from app.auditoria
       where tenant_id = $1 and registro_id = $2 and acao in ('pausar', 'retomar') order by em`,
      [TENANT, os.id],
    );
    expect(auditoria.rows[0]?.depois).toMatchObject({
      motivoPausa: 'aguardando_peca',
      pausaParaORelogio: true,
    });
    expect(auditoria.rows[1]?.depois).toMatchObject({
      prazoSolucaoAntes: '2026-10-14T04:00:00.000Z',
      prazoSolucao: '2026-10-14T06:00:00.000Z',
      pausadoSegundos: 7200,
    });

    // Fim de turno não está na lista: a pausa não para o relógio.
    v = await operar('os.pausar', v, 4 * H, 'fim_de_turno');
    await operar('os.retomar', v, 5 * H);
    c = await prazos();
    expect(c?.s.toISOString()).toBe('2026-10-14T06:00:00.000Z');
    expect(await pausado()).toBe(7200);
  });
});
