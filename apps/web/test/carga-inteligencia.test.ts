// Teste de carga do job diário do Intelligence (atividade 2a do Kaio,
// 12/10/2026). Só roda com HK_CARGA_URL_WORKER apontando para um Postgres
// descartável com as migrações e os dados de scripts/carga/inteligencia-
// sintetico.sql: nunca o dev compartilhado, o staging ou a produção (a
// métrica só recebe INSERT). Sem a variável, é pulado, também na CI.
//
// Mede, por tenant, o job inteiro (uma transação do hk_worker), o tempo de
// cada leitura e gravação da sessão, o resto (o cálculo em memória) e o heap.
// Roda o mesmo dia duas vezes (a segunda não grava a métrica) e os dias
// seguintes, como o cron faria.
import type { SessaoDoJobDoIntelligence } from '@hubkeep/db';
import { criarAcessoBanco, criarPortaDoJobDoIntelligence } from '@hubkeep/db';
import { registrosDePoliticasPorModulo } from '@hubkeep/dominio';
import { describe, expect, it } from 'vitest';
import { montarInteligencia } from '../src/servidor/modulos/inteligencia';

const URL_WORKER = process.env['HK_CARGA_URL_WORKER'];
const TENANT = process.env['HK_CARGA_TENANT'] ?? '';
const AGORA = new Date(process.env['HK_CARGA_AGORA'] ?? '2026-10-13T06:00:00Z');
const DIAS = Number(process.env['HK_CARGA_DIAS'] ?? '3');

type Tempos = Record<string, number>;

function cronometrada(s: SessaoDoJobDoIntelligence, tempos: Tempos): SessaoDoJobDoIntelligence {
  return Object.fromEntries(
    Object.entries(s).map(([nome, f]) => [
      nome,
      async (...args: unknown[]) => {
        const t0 = performance.now();
        try {
          return await (f as (...a: unknown[]) => Promise<unknown>)(...args);
        } finally {
          tempos[nome] = (tempos[nome] ?? 0) + performance.now() - t0;
        }
      },
    ]),
  ) as unknown as SessaoDoJobDoIntelligence;
}

describe.skipIf(!URL_WORKER)('carga do job diário do Intelligence', () => {
  it('mede o tempo por tenant', { timeout: 30 * 60_000 }, async () => {
    const banco = await criarAcessoBanco({ worker: { url: URL_WORKER ?? '', ssl: false } });
    const porta = criarPortaDoJobDoIntelligence(banco);
    const inteligencia = montarInteligencia();
    const registros = registrosDePoliticasPorModulo(inteligencia.extensoesDePolitica);
    const rodadas: unknown[] = [];
    const dias = [0, 0, ...Array.from({ length: DIAS - 1 }, (_, i) => i + 1)];
    for (const d of dias) {
      const agora = new Date(AGORA.getTime() + d * 86_400_000);
      const tempos: Tempos = {};
      const job = inteligencia.jobDoDia({
        porta: { noTenant: (t, fn) => porta.noTenant(t, (s) => fn(cronometrada(s, tempos))) },
        registros,
        relogio: { agora: () => agora },
      });
      globalThis.gc?.();
      const heapAntes = process.memoryUsage().heapUsed;
      const t0 = performance.now();
      const resumo = await job(TENANT);
      const total = performance.now() - t0;
      const banco_ms = Object.values(tempos).reduce((a, b) => a + b, 0);
      const r = {
        dia: agora.toISOString().slice(0, 10),
        total_ms: Math.round(total),
        sessao_ms: Object.fromEntries(Object.entries(tempos).map(([k, v]) => [k, Math.round(v)])),
        calculo_ms: Math.round(total - banco_ms),
        heap_mb: Math.round((process.memoryUsage().heapUsed - heapAntes) / 1e6),
        rss_mb: Math.round(process.memoryUsage().rss / 1e6),
        resumo,
      };
      rodadas.push(r);
      console.log(JSON.stringify(r));
    }
    expect(rodadas).toHaveLength(dias.length);
  });
});
