// Aceite da F0-09: um tenant com erro não bloqueia os outros.
import { describe, expect, it } from 'vitest';
import { rodarPorTenant } from '../src/index';

describe('rodarPorTenant', () => {
  it('um tenant com erro não bloqueia os outros; o erro fica no resultado', async () => {
    const vistos: string[] = [];
    const r = await rodarPorTenant(
      async () => ['a', 'b', 'c'],
      async (t) => {
        vistos.push(t);
        if (t === 'b') throw new Error('banco fora');
        return { processados: 1 };
      },
    );
    expect(vistos).toEqual(['a', 'b', 'c']);
    expect(r.tenants).toBe(3);
    expect(r.concluidos.map((c) => c.tenantId)).toEqual(['a', 'c']);
    expect(r.falhas.map((f) => f.tenantId)).toEqual(['b']);
    expect((r.falhas[0]?.erro as Error).message).toBe('banco fora');
  });

  it('um tenant por vez, na ordem da lista', async () => {
    let emAndamento = 0;
    let maximo = 0;
    await rodarPorTenant(
      async () => ['a', 'b', 'c'],
      async () => {
        emAndamento++;
        maximo = Math.max(maximo, emAndamento);
        // Cede a vez algumas vezes: em paralelo, as tarefas se sobreporiam aqui.
        for (let i = 0; i < 3; i++) await Promise.resolve();
        emAndamento--;
      },
    );
    expect(maximo).toBe(1);
  });
});
