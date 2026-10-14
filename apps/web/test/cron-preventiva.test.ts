// O cron da geração da OS preventiva (PV3; ADR-041, B9 do docs/11): volta ao
// vercel.json uma vez por dia, às 05:00 de Brasília, e o hotel que falha vai
// para o log e para o Sentry sem derrubar o tenant.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ResultadoDaGeracao } from '@hubkeep/aplicacao';
import { describe, expect, it } from 'vitest';
import { resumirGeracao } from '../src/servidor/resumo-da-geracao';

describe('cron da preventiva', () => {
  it('está no vercel.json uma vez por dia, às 08:00 UTC (05:00 de Brasília)', () => {
    const vercel = JSON.parse(readFileSync(join(__dirname, '..', 'vercel.json'), 'utf8')) as {
      crons: { path: string; schedule: string }[];
    };
    expect(vercel.crons.filter((c) => c.path === '/api/cron/preventiva')).toEqual([
      { path: '/api/cron/preventiva', schedule: '0 8 * * *' },
    ]);
  });

  it('o hotel que falhou vai para o log e o Sentry; a resposta soma só números', () => {
    const logs: unknown[] = [];
    const relatados: unknown[] = [];
    const r: ResultadoDaGeracao = {
      hoteis: 3,
      planos: 5,
      geradas: 4,
      puladas: {
        ja_gerada: 1,
        os_anterior_aberta: 2,
        sem_responsavel: 0,
        sem_ativo: 1,
        ativo_posterior: 0,
      },
      falhas: [{ hotelId: 'h-2', erro: 'canceling statement due to statement timeout' }],
    };
    const resumo = resumirGeracao('t-1', r, {
      registrar: (nivel, evento, campos) => void logs.push({ nivel, evento, campos }),
      relatar: (erro, marcas) => void relatados.push({ erro: (erro as Error).message, marcas }),
    });
    expect(resumo).toEqual({
      hoteis: 3,
      planos: 5,
      geradas: 4,
      hoteisComFalha: 1,
      puladas_ja_gerada: 1,
      puladas_os_anterior_aberta: 2,
      puladas_sem_responsavel: 0,
      puladas_sem_ativo: 1,
      puladas_ativo_posterior: 0,
    });
    expect(logs).toEqual([
      {
        nivel: 'error',
        evento: 'cron.preventiva.hotel_falhou',
        campos: {
          tenant_id: 't-1',
          hotel_id: 'h-2',
          erro: 'canceling statement due to statement timeout',
        },
      },
    ]);
    expect(relatados).toEqual([
      {
        erro: 'canceling statement due to statement timeout',
        marcas: { tarefa: 'preventiva', tenant_id: 't-1', hotel_id: 'h-2' },
      },
    ]);
  });
});
