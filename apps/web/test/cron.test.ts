// Aceite da F0-09 nas rotas de cron, sem banco: segredo (falha fechada), laço
// por tenant com erro isolado, log e Sentry do tenant que falhou.
import { describe, expect, it } from 'vitest';
import { exigirSegredoDoCron, rotaDeCron } from '../src/servidor/cron';
import type { Dependencias } from '../src/servidor/http';
import type { CamposDeLog, Nivel } from '../src/servidor/log';

const SEGREDO = 'segredo-do-cron-de-teste';

function montar() {
  const logs: { nivel: Nivel; evento: string; campos: CamposDeLog }[] = [];
  const relatados: Record<string, unknown>[] = [];
  const deps: Partial<Dependencias> = {
    registrar: (nivel, evento, campos) => void logs.push({ nivel, evento, campos }),
    relatar: (_e, marcas) => void relatados.push(marcas),
  };
  return { deps, logs, relatados };
}

const pedir = (autorizacao?: string) =>
  new Request('http://127.0.0.1/api/cron/outbox', {
    headers: autorizacao ? { authorization: autorizacao } : {},
  });

describe('segredo do cron', () => {
  it('sem CRON_SECRET no ambiente: 503, falha fechada', () => {
    expect(() => exigirSegredoDoCron(pedir(`Bearer ${SEGREDO}`), undefined)).toThrow(
      expect.objectContaining({ status: 503, codigo: 'cron_nao_configurado' }),
    );
  });

  it('sem cabeçalho ou com segredo errado: 401; com o certo, passa', () => {
    expect(() => exigirSegredoDoCron(pedir(), SEGREDO)).toThrow(
      expect.objectContaining({ status: 401 }),
    );
    expect(() => exigirSegredoDoCron(pedir('Bearer outro'), SEGREDO)).toThrow(
      expect.objectContaining({ status: 401 }),
    );
    expect(() => exigirSegredoDoCron(pedir(`Bearer ${SEGREDO}`), SEGREDO)).not.toThrow();
  });
});

describe('rotaDeCron', () => {
  it('não lista tenants nem roda nada sem o segredo certo', async () => {
    const { deps } = montar();
    let listou = false;
    const get = rotaDeCron(
      {
        nome: 'outbox',
        segredo: () => SEGREDO,
        tenants: async () => ((listou = true), []),
        porTenant: async () => ({}),
      },
      deps,
    );
    expect((await get(pedir('Bearer errado'))).status).toBe(401);
    expect(listou).toBe(false);
  });

  it('um tenant com erro não bloqueia os outros; o erro vai para o log e o Sentry', async () => {
    const { deps, logs, relatados } = montar();
    const get = rotaDeCron(
      {
        nome: 'outbox',
        segredo: () => SEGREDO,
        tenants: async () => ['t1', 't2', 't3'],
        porTenant: async (t) => {
          if (t === 't2') throw new Error('falhou no t2');
          return { processados: 2, falhas: 1 };
        },
      },
      deps,
    );
    const r = await get(pedir(`Bearer ${SEGREDO}`));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({
      tarefa: 'outbox',
      tenants: 3,
      concluidos: 2,
      falhas: ['t2'],
      totais: { processados: 4, falhas: 2 },
    });
    expect(relatados).toEqual([
      expect.objectContaining({
        rota: 'cron.outbox',
        tenant_id: 't2',
        request_id: expect.any(String),
      }),
    ]);
    expect(logs.find((l) => l.evento === 'erro_tratado')?.campos).toMatchObject({
      tenant_id: 't2',
    });
    expect(logs.at(-1)).toMatchObject({
      evento: 'http',
      campos: { rota: 'cron.outbox', status: 200 },
    });
  });
});
