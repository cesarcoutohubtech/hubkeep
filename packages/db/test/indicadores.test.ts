// Painel de indicadores (1c, item 8) contra Postgres real (na CI, o Supabase
// do runner), papel hk_app:
//   - o Gerente vê o hotel dele com o backlog, o % de SLA, o MTTR, os chamados
//     por 100 UHs ativas, os UH-dias e a produtividade da equipe, sem o
//     chamado cancelado e sem o hotel que ele não lê;
//   - o proprietário do hotel vê só os cartões;
//   - o Técnico não abre o painel.
//
//   HK_TESTE_URL_APP, HK_TESTE_URL_DONO
import { randomUUID } from 'node:crypto';
import { criarCasosDeUsoDeIndicadores } from '@hubkeep/aplicacao';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type AcessoBanco,
  criarAcessoBanco,
  criarPortaIndicadores,
  criarPortasDeAplicacao,
} from '../src/index';

const URL_APP = process.env.HK_TESTE_URL_APP;
const URL_DONO = process.env.HK_TESTE_URL_DONO;
const temBanco = Boolean(URL_APP && URL_DONO);
if (!temBanco && process.env.HK_EXIGIR_BANCO === '1') {
  throw new Error('HK_EXIGIR_BANCO=1, mas faltam HK_TESTE_URL_APP/DONO.');
}

const AGORA = new Date('2026-10-15T12:00:00Z');
const PERIODO = { inicio: '2026-10-01', fim: '2026-10-10' };
const T = randomUUID();
const H1 = randomUUID();
const H2 = randomUUID();
const UH = { a: randomUUID(), b: randomUUID(), inativa: randomUUID(), outra: randomUUID() };
const U = { gerente: randomUUID(), tecnico: randomUUID(), dono: randomUUID() };
const C = {
  concluido: randomUUID(),
  vencido: randomUUID(),
  cancelado: randomUUID(),
  outro: randomUUID(),
};
const OS = randomUUID();
const EQUIPE = randomUUID();
const PROPRIETARIO = randomUUID();
const ctx = (usuarioId: string) => ({ usuarioId, tenantId: T });

describe.skipIf(!temBanco)('painel de indicadores (hk_app)', { timeout: 60_000 }, () => {
  let dono: pg.Client;
  let banco: AcessoBanco;
  let casos: ReturnType<typeof criarCasosDeUsoDeIndicadores>;

  beforeAll(async () => {
    dono = new pg.Client({ connectionString: URL_DONO });
    await dono.connect();
    await dono.query(`insert into app.tenant (id, nome) values ($1, 'Grupo dos indicadores')`, [T]);
    await dono.query(
      `insert into app.hotel (id, tenant_id, nome, fuso, status) values
       ($1, $3, 'Hotel Centro', 'America/Sao_Paulo', 'ativo'),
       ($2, $3, 'Hotel Praia', 'America/Sao_Paulo', 'ativo')`,
      [H1, H2, T],
    );
    for (const [id, hotel, nome, status] of [
      [UH.a, H1, '101', 'ativo'],
      [UH.b, H1, '102', 'ativo'],
      [UH.inativa, H1, '103', 'inativo'],
      [UH.outra, H2, '201', 'ativo'],
    ] as const) {
      await dono.query(
        `insert into app.local (id, tenant_id, hotel_id, tipo, nome, busca, status)
         values ($1, $2, $3, 'uh', $4, $4, $5)`,
        [id, T, hotel, nome, status],
      );
    }
    for (const [nome, id] of Object.entries(U)) {
      await dono.query(`insert into auth.users (id, email) values ($1, $2)`, [
        id,
        `${id}@hubkeep.invalid`,
      ]);
      await dono.query(
        `insert into app.membro (tenant_id, usuario_id, nome, email) values ($1, $2, $3, $4)`,
        [T, id, nome, `${id}@hubkeep.invalid`],
      );
    }
    for (const [usuario, papel] of [
      [U.gerente, 'gerente_hotel'],
      [U.tecnico, 'tecnico'],
    ] as const) {
      await dono.query(
        `insert into app.atribuicao_escopo (id, tenant_id, usuario_id, papel, escopo_tipo, hotel_id, concedido_por)
         values ($1, $2, $3, $4, 'hotel', $5, $3)`,
        [randomUUID(), T, usuario, papel, H1],
      );
    }
    await dono.query(`insert into app.proprietario (id, tenant_id, nome) values ($1, $2, 'Dono')`, [
      PROPRIETARIO,
      T,
    ]);
    await dono.query(
      `insert into app.hotel_proprietario (id, tenant_id, proprietario_id, hotel_id, vigencia_inicio)
       values ($1, $2, $3, $4, current_date - 1)`,
      [randomUUID(), T, PROPRIETARIO, H1],
    );
    await dono.query(
      `insert into app.atribuicao_escopo (id, tenant_id, usuario_id, papel, escopo_tipo, proprietario_id, concedido_por)
       values ($1, $2, $3, 'proprietario', 'proprietario', $4, $5)`,
      [randomUUID(), T, U.dono, PROPRIETARIO, U.gerente],
    );
    await dono.query(
      `insert into app.equipe (id, tenant_id, hotel_id, nome) values ($1, $2, $3, 'Manutenção')`,
      [EQUIPE, T, H1],
    );
    const prioridade = randomUUID();
    await dono.query(
      `insert into app.prioridade (id, tenant_id, chave_padrao, ordem, peso) values ($1, $2, 'alta', 10, 30)`,
      [prioridade, T],
    );
    const situacao = { chamado: randomUUID(), os: randomUUID() };
    await dono.query(
      `insert into app.situacao (id, tenant_id, entidade, estado, chave_padrao, ordem, cor) values
       ($1, $3, 'chamado', 'aberto', 'chamado_aberto', 10, '#2563eb'),
       ($2, $3, 'os', 'concluida', 'os_concluida', 20, '#16a34a')`,
      [situacao.chamado, situacao.os, T],
    );
    const abrir = (
      id: string,
      hotel: string,
      local: string,
      estado: string,
      criadoEm: string,
      prazoSolucao: string | null,
    ) =>
      dono.query(
        `insert into app.chamado (id, tenant_id, hotel_id, local_id, descricao, busca, estado, situacao_id,
           prioridade_id, politica_aplicada, aberto_por, criado_em, prazo_solucao)
         values ($1, $2, $3, $4, 'vazamento', 'vazamento', $5, $6, $7, '{}', $8, $9, $10)`,
        [
          id,
          T,
          hotel,
          local,
          estado,
          situacao.chamado,
          prioridade,
          U.gerente,
          criadoEm,
          prazoSolucao,
        ],
      );
    await abrir(C.concluido, H1, UH.a, 'concluido', '2026-10-02T00:00:00Z', '2026-10-03T00:00:00Z');
    await abrir(C.vencido, H1, UH.b, 'aberto', '2026-10-05T00:00:00Z', '2026-10-06T00:00:00Z');
    await abrir(C.cancelado, H1, UH.b, 'cancelado', '2026-10-04T00:00:00Z', '2026-10-05T00:00:00Z');
    await abrir(C.outro, H2, UH.outra, 'aberto', '2026-10-05T00:00:00Z', null);

    await dono.query(
      `insert into app.os (id, tenant_id, hotel_id, chamado_id, local_id, chamado_aberto_por, estado,
         situacao_id, equipe_id, criado_por)
       values ($1, $2, $3, $4, $5, $6, 'concluida', $7, $8, $6)`,
      [OS, T, H1, C.concluido, UH.a, U.gerente, situacao.os, EQUIPE],
    );
    await dono.query(
      `insert into app.os_transicao (id, tenant_id, hotel_id, os_id, acao, de, para, usuario_id, quando)
       values ($1, $2, $3, $4, 'concluir', 'em_execucao', 'concluida', $5, '2026-10-02T10:00:00Z')`,
      [randomUUID(), T, H1, OS, U.gerente],
    );
    await dono.query(
      `insert into app.os_apontamento (id, tenant_id, hotel_id, os_id, usuario_id, inicio, fim)
       values ($1, $2, $3, $4, $5, '2026-10-02T08:00:00Z', '2026-10-02T10:00:00Z')`,
      [randomUUID(), T, H1, OS, U.gerente],
    );
    await dono.query(
      `insert into app.uh_indisponivel (id, tenant_id, hotel_id, local_id, chamado_id, inicio, fim,
         aberta_por, encerrada_por)
       values ($1, $2, $3, $4, $5, '2026-10-02T03:00:00Z', '2026-10-03T03:00:00Z', $6, $6)`,
      [randomUUID(), T, H1, UH.a, C.concluido, U.gerente],
    );

    banco = await criarAcessoBanco({ app: { url: URL_APP ?? '', max: 2 } });
    casos = criarCasosDeUsoDeIndicadores({
      indicadores: criarPortaIndicadores(banco),
      atribuicoes: criarPortasDeAplicacao(banco).atribuicoes,
      relogio: { agora: () => AGORA },
    });
  });

  afterAll(async () => {
    await banco?.encerrar();
    if (!dono) return;
    for (const tabela of [
      'app.uh_indisponivel',
      'app.os_apontamento',
      'app.os_transicao',
      'app.os',
      'app.chamado',
      'app.situacao',
      'app.prioridade',
      'app.equipe',
      'app.atribuicao_escopo',
      'app.hotel_proprietario',
      'app.proprietario',
      'app.local',
      'app.hotel',
      'app.membro',
    ]) {
      await dono.query(`delete from ${tabela} where tenant_id = $1`, [T]);
    }
    await dono.query(`delete from app.tenant where id = $1`, [T]);
    await dono.query(`delete from auth.users where id = any($1::uuid[])`, [Object.values(U)]);
    await dono.end();
  });

  it('o Gerente vê o hotel dele, sem o cancelado e sem o hotel que não lê', async () => {
    const r = await casos.consultar(ctx(U.gerente), { periodo: PERIODO });
    expect(r.hoteis.map((h) => [h.id, h.visao])).toEqual([[H1, 'completa']]);
    expect(r.rede).toMatchObject({
      backlog: 1,
      percentualDeSla: 50,
      sla: { total: 2, dentroDoPrazo: 1, aindaNoPrazo: 0 },
      mttrHoras: 10,
      medianaHoras: 10,
      abertos: 2,
      uhsAtivas: 2,
      chamadosPor100Uhs: 100,
      uhDias: 1,
    });
    expect(r.produtividade).toEqual([
      {
        hotelId: H1,
        equipeId: EQUIPE,
        equipeNome: 'Manutenção',
        osConcluidas: 1,
        segundosApontados: 7200,
      },
    ]);
    expect(
      (await casos.consultar(ctx(U.gerente), { periodo: PERIODO, hotelId: H2 })).hoteis,
    ).toEqual([]);
  });

  it('o proprietário do hotel vê só os cartões', async () => {
    const r = await casos.consultar(ctx(U.dono), { periodo: PERIODO });
    expect(r.rede).toBeNull();
    expect(r.hoteis).toEqual([
      expect.objectContaining({
        id: H1,
        visao: 'cartoes',
        cartoes: expect.objectContaining({ uhDias: 1 }),
      }),
    ]);
  });

  it('o Técnico não abre o painel', async () => {
    await expect(casos.consultar(ctx(U.tecnico), { periodo: PERIODO })).rejects.toMatchObject({
      codigo: 'indicadores_sem_permissao',
    });
  });
});
