// A observabilidade do job do Intelligence (atividade 2b), sem banco e sem
// Sentry: o log por tenant e por rodada, o check-in do monitor e o horário do
// monitor igual ao do vercel.json.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ResumoDoJob } from '@hubkeep/inteligencia';
import { describe, expect, it } from 'vitest';
import { rotaDeCron } from '../src/servidor/cron';
import {
  type CheckInDoJob,
  HORARIO_DO_JOB,
  MONITOR_DO_JOB,
  criarObservacaoDoJob,
} from '../src/servidor/modulos/inteligencia/observabilidade';

const SEGREDO = 'segredo-do-cron-de-teste';

const resumo = (semModulo = false): ResumoDoJob => ({
  dia: '2026-10-13',
  recalculo: false,
  semModulo,
  ativos: semModulo ? 0 : 10,
  metricasGravadas: semModulo ? 0 : 10,
  metricasJaGravadas: 0,
  insightsAbertos: semModulo ? 0 : 1,
  insightsAtualizados: 0,
  insightsIgnorados: 0,
});

function montar(opcoes: { checkInFalha?: boolean } = {}) {
  const logs: { nivel: string; evento: string; campos: Record<string, unknown> }[] = [];
  const checkIns: CheckInDoJob[] = [];
  let t = 0;
  const observacao = criarObservacaoDoJob({
    registrar: (nivel, evento, campos) => void logs.push({ nivel, evento, campos }),
    checkIn: async (c) => {
      if (opcoes.checkInFalha) throw new Error('sem rede');
      checkIns.push(c);
    },
    medir: () => (t += 1500),
  });
  const rodada = (porTenant: (t: string) => Promise<ResumoDoJob>) =>
    observacao.rodada(
      rotaDeCron(
        {
          nome: 'inteligencia',
          segredo: () => SEGREDO,
          tenants: async () => ['t1', 't2'],
          porTenant: observacao.porTenant(porTenant),
        },
        { registrar: () => undefined, relatar: () => undefined },
      ),
    );
  return { logs, checkIns, rodada };
}

const pedir = (segredo = SEGREDO) =>
  new Request('http://127.0.0.1/api/cron/inteligencia', {
    headers: { authorization: `Bearer ${segredo}` },
  });

describe('observação do job do Intelligence', () => {
  it('todos os tenants rodaram: uma linha por tenant, a da rodada e o check-in ok', async () => {
    const { logs, checkIns, rodada } = montar();
    const r = await rodada(async (t) => resumo(t === 't2'))(pedir());
    expect(r.status).toBe(200);
    expect(logs).toEqual([
      {
        nivel: 'info',
        evento: 'inteligencia.job.tenant',
        campos: expect.objectContaining({
          tenant_id: 't1',
          resultado: 'ok',
          duracao_ms: 1500,
          ativos: 10,
          metricas_gravadas: 10,
          insights_abertos: 1,
        }),
      },
      {
        nivel: 'info',
        evento: 'inteligencia.job.tenant',
        campos: expect.objectContaining({ tenant_id: 't2', resultado: 'sem_modulo' }),
      },
      {
        nivel: 'info',
        evento: 'inteligencia.job.rodada',
        campos: { resultado: 'ok', status: 200, duracao_ms: 7500, falhas: [] },
      },
    ]);
    expect(checkIns).toEqual([{ monitorSlug: MONITOR_DO_JOB, status: 'ok', duration: 7.5 }]);
  });

  it('um tenant falhou: a linha dele com falha, a rodada com falha e o check-in error', async () => {
    const { logs, checkIns, rodada } = montar();
    const r = await rodada(async (t) => {
      if (t === 't1') throw new Error('falhou no t1');
      return resumo();
    })(pedir());
    expect(r.status).toBe(200);
    expect(logs[0]).toMatchObject({
      nivel: 'error',
      campos: { tenant_id: 't1', resultado: 'falha' },
    });
    expect(logs.at(-1)).toMatchObject({
      nivel: 'error',
      evento: 'inteligencia.job.rodada',
      campos: { resultado: 'falha', falhas: ['t1'] },
    });
    expect(checkIns).toMatchObject([{ status: 'error' }]);
  });

  it('a rota sem CRON_SECRET (503): check-in error; com o segredo errado (401): nenhum', async () => {
    const checkIns: CheckInDoJob[] = [];
    const rota503 = criarObservacaoDoJob({
      registrar: () => undefined,
      checkIn: async (c) => void checkIns.push(c),
    }).rodada(async () => new Response(null, { status: 503 }));
    expect((await rota503(pedir())).status).toBe(503);
    expect(checkIns).toMatchObject([{ status: 'error' }]);

    const errado = montar();
    expect((await errado.rodada(async () => resumo())(pedir('outro'))).status).toBe(401);
    expect(errado.checkIns).toEqual([]);
    expect(errado.logs).toEqual([]);
  });

  it('o check-in que falha não muda a resposta da rota', async () => {
    const { rodada } = montar({ checkInFalha: true });
    expect((await rodada(async () => resumo())(pedir())).status).toBe(200);
  });

  it('o monitor tem o mesmo horário da rota no vercel.json', () => {
    const vercel = JSON.parse(readFileSync(join(__dirname, '..', 'vercel.json'), 'utf8')) as {
      crons: { path: string; schedule: string }[];
    };
    expect(vercel.crons.find((c) => c.path === '/api/cron/inteligencia')?.schedule).toBe(
      HORARIO_DO_JOB,
    );
  });
});
