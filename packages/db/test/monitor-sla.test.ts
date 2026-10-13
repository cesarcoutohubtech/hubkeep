// Monitor de SLA (fase 1c; ADR-043) contra Postgres real (na CI, o Supabase do
// runner), papel hk_worker, um tenant por transação:
//   - o chamado com o atendimento vencido ganha o aviso em app.sla_alerta e o
//     evento chamado.sla_alerta no outbox, com o nível e os destinatários;
//   - a segunda rodada não repete; o prazo refeito ganha o aviso dele;
//   - a OS na pausa que parou o relógio congela a solução vencida;
//   - o chamado de outro tenant não é tocado.
//
//   HK_TESTE_URL_WORKER, HK_TESTE_URL_DONO
import { randomUUID } from 'node:crypto';
import { criarMonitorDeSla } from '@hubkeep/aplicacao';
import { HORARIO_PADRAO, SLA_PADRAO } from '@hubkeep/dominio';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type AcessoBanco, criarAcessoBanco, criarPortaMonitorDeSla } from '../src/index';
import { semFeriadosOficiais } from './feriados-de-teste';

const URL_WORKER = process.env.HK_TESTE_URL_WORKER;
const URL_DONO = process.env.HK_TESTE_URL_DONO;
const temBanco = Boolean(URL_WORKER && URL_DONO);
if (!temBanco && process.env.HK_EXIGIR_BANCO === '1') {
  throw new Error('HK_EXIGIR_BANCO=1, mas faltam HK_TESTE_URL_WORKER/DONO.');
}

const H = 3_600_000;
const AGORA = new Date('2026-10-13T20:00:00Z');
const T = randomUUID();
const TB = randomUUID();
const H1 = randomUUID();
const HB = randomUUID();
const L1 = randomUUID();
const LB = randomUUID();
const CAT = randomUUID();
const U = randomUUID();
const UB = randomUUID();
const C = { vencido: randomUUID(), pausado: randomUUID(), outro: randomUUID() };
const OS = randomUUID();
const copia = {
  'chamado.sla': {
    ...SLA_PADRAO,
    porCategoria: { [CAT]: { pausa: true } },
  },
  'hotel.horario_atendimento': HORARIO_PADRAO,
};
const em = (horas: number) => new Date(AGORA.getTime() + horas * H);

describe.skipIf(!temBanco)('monitor de SLA (hk_worker)', { timeout: 60_000 }, () => {
  let dono: pg.Client;
  let banco: AcessoBanco;
  let rodar: ReturnType<typeof criarMonitorDeSla>;
  const prioridade: Record<string, string> = {};

  const alertas = async (chamado: string) =>
    (
      await dono.query<{ tipo: string; prazo: Date }>(
        `select tipo, prazo from app.sla_alerta where chamado_id = $1 order by emitido_em, tipo`,
        [chamado],
      )
    ).rows;

  beforeAll(async () => {
    dono = new pg.Client({ connectionString: URL_DONO });
    await dono.connect();
    for (const [t, h, l, u, nome] of [
      [T, H1, L1, U, 'A'],
      [TB, HB, LB, UB, 'B'],
    ] as const) {
      await dono.query(`insert into app.tenant (id, nome) values ($1, $2)`, [t, `Grupo ${nome}`]);
      await dono.query(
        `insert into app.hotel (id, tenant_id, nome, fuso, status)
         values ($1, $2, 'Hotel', 'America/Sao_Paulo', 'ativo')`,
        [h, t],
      );
      await dono.query(
        `insert into app.local (id, tenant_id, hotel_id, tipo, nome, busca, status)
         values ($1, $2, $3, 'area_comum', 'Lobby', 'lobby', 'ativo')`,
        [l, t, h],
      );
      await dono.query(`insert into auth.users (id, email) values ($1, $2)`, [
        u,
        `${u}@hubkeep.invalid`,
      ]);
      await dono.query(
        `insert into app.membro (tenant_id, usuario_id, nome, email) values ($1, $2, 'Pessoa', $3)`,
        [t, u, `${u}@hubkeep.invalid`],
      );
      const p = randomUUID();
      prioridade[t] = p;
      await dono.query(
        `insert into app.prioridade (id, tenant_id, chave_padrao, ordem, peso) values ($1, $2, 'urgente', 10, 40)`,
        [p, t],
      );
      await dono.query(
        `insert into app.situacao (id, tenant_id, entidade, estado, chave_padrao, ordem, cor) values
         ($1, $3, 'chamado', 'aberto', 'chamado_aberto', 10, '#2563eb'),
         ($2, $3, 'chamado', 'em_execucao', 'chamado_em_execucao', 20, '#2563eb')`,
        [randomUUID(), randomUUID(), t],
      );
    }
    await dono.query(
      `insert into app.categoria_ativo (id, tenant_id, nomes) values ($1, $2, '{"pt-BR": "Elevadores"}')`,
      [CAT, T],
    );
    const situacao = async (t: string, estado: string) =>
      (
        await dono.query<{ id: string }>(
          `select id from app.situacao where tenant_id = $1 and estado = $2 and entidade = 'chamado'`,
          [t, estado],
        )
      ).rows[0]?.id;
    const abrir = async (
      id: string,
      t: string,
      h: string,
      l: string,
      u: string,
      estado: string,
      prazos: [Date, Date],
    ) =>
      dono.query(
        `insert into app.chamado (id, tenant_id, hotel_id, local_id, descricao, busca, estado, situacao_id,
           prioridade_id, politica_aplicada, aberto_por, categoria_id, prazo_atendimento, prazo_solucao)
         values ($1, $2, $3, $4, 'chamado', 'chamado', $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          id,
          t,
          h,
          l,
          estado,
          await situacao(t, estado),
          prioridade[t],
          JSON.stringify(copia),
          u,
          t === T ? CAT : null,
          prazos[0],
          prazos[1],
        ],
      );
    // Urgente no padrão: 1 h e 2 h, em 24x7.
    await abrir(C.vencido, T, H1, L1, U, 'aberto', [em(-0.5), em(1.5)]);
    await abrir(C.pausado, T, H1, L1, U, 'em_execucao', [em(-3), em(-1)]);
    await abrir(C.outro, TB, HB, LB, UB, 'aberto', [em(-0.5), em(1.5)]);
    // A OS do chamado pausado, na pausa "aguardando peça" (a categoria tem a pausa ligada).
    const situacaoDaOs = randomUUID();
    await dono.query(
      `insert into app.situacao (id, tenant_id, entidade, estado, chave_padrao, ordem, cor)
       values ($1, $2, 'os', 'pausada', 'os_pausada', 30, '#d97706')`,
      [situacaoDaOs, T],
    );
    await dono.query(
      `insert into app.os (id, tenant_id, hotel_id, chamado_id, local_id, chamado_aberto_por, estado,
         situacao_id, tecnico_id, criado_por)
       values ($1, $2, $3, $4, $5, $6, 'pausada', $7, $6, $6)`,
      [OS, T, H1, C.pausado, L1, U, situacaoDaOs],
    );
    await dono.query(
      `insert into app.os_transicao (id, tenant_id, hotel_id, os_id, acao, de, para, motivo_pausa, usuario_id)
       values ($1, $2, $3, $4, 'pausar', 'em_execucao', 'pausada', 'aguardando_peca', $5)`,
      [randomUUID(), T, H1, OS, U],
    );

    banco = await criarAcessoBanco({ worker: { url: URL_WORKER ?? '', max: 2 } });
    rodar = criarMonitorDeSla({
      monitor: criarPortaMonitorDeSla(banco),
      feriadosOficiais: semFeriadosOficiais,
      relogio: { agora: () => AGORA },
    });
  });

  afterAll(async () => {
    await banco?.encerrar();
    if (!dono) return;
    for (const t of [T, TB]) {
      for (const tabela of [
        'app.evento_dominio',
        'app.sla_alerta',
        'app.os_transicao',
        'app.os',
        'app.chamado',
        'app.categoria_ativo',
        'app.situacao',
        'app.prioridade',
        'app.local',
        'app.hotel',
        'app.membro',
      ]) {
        await dono.query(`delete from ${tabela} where tenant_id = $1`, [t]);
      }
      await dono.query(`delete from app.tenant where id = $1`, [t]);
    }
    await dono.query(`delete from auth.users where id = any($1::uuid[])`, [[U, UB]]);
  });

  it('o atendimento vencido ganha o aviso e o evento, com o nível e os destinatários', async () => {
    expect(await rodar(T)).toEqual({ avaliados: 2, emitidos: 1 });
    expect((await alertas(C.vencido)).map((a) => a.tipo)).toEqual(['atendimento_vencido']);
    const eventos = await dono.query<{ payload: Record<string, unknown> }>(
      `select payload from app.evento_dominio
       where tenant_id = $1 and tipo = 'chamado.sla_alerta' and registro_id = $2`,
      [T, C.vencido],
    );
    expect(eventos.rows).toEqual([
      {
        payload: expect.objectContaining({
          hotelId: H1,
          tipo: 'atendimento_vencido',
          nivel: 'vencido',
          destinatarios: ['responsavel_da_os', 'gerente_hotel', 'gestor_csc'],
        }),
      },
    ]);
  });

  it('a pausa que parou o relógio congela a solução vencida; o outro tenant não é tocado', async () => {
    expect(await alertas(C.pausado)).toEqual([]);
    expect(await alertas(C.outro)).toEqual([]);
  });

  it('a segunda rodada não repete; o prazo refeito ganha o aviso dele', async () => {
    expect(await rodar(T)).toEqual({ avaliados: 2, emitidos: 0 });
    await dono.query(`update app.chamado set prazo_atendimento = $2 where id = $1`, [
      C.vencido,
      em(-0.25),
    ]);
    expect(await rodar(T)).toEqual({ avaliados: 2, emitidos: 1 });
    expect((await alertas(C.vencido)).map((a) => a.prazo.toISOString())).toEqual([
      em(-0.5).toISOString(),
      em(-0.25).toISOString(),
    ]);
  });
});
