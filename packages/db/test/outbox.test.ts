// Núcleo do outbox (ADR-007/018) contra Postgres real, papel hk_worker.
import { randomUUID } from 'node:crypto';
import { type Manipulador, rodarPorTenant } from '@hubkeep/aplicacao';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type AcessoBanco,
  atrasoDaTentativa,
  criarAcessoBanco,
  processarOutbox,
} from '../src/index';

const URL_WORKER = process.env.HK_TESTE_URL_WORKER;
const URL_DONO = process.env.HK_TESTE_URL_DONO;
const temBanco = Boolean(URL_WORKER && URL_DONO);
if (!temBanco && process.env.HK_EXIGIR_BANCO === '1') {
  throw new Error('HK_EXIGIR_BANCO=1, mas faltam HK_TESTE_URL_WORKER/DONO.');
}
const url = (v: string | undefined): string => {
  if (!v) throw new Error('URL de teste ausente.');
  return v;
};

describe('atrasoDaTentativa', () => {
  it('dobra a cada tentativa até 1 hora', () => {
    expect([1, 2, 3, 4].map(atrasoDaTentativa)).toEqual([30, 60, 120, 240]);
    expect(atrasoDaTentativa(20)).toBe(3600);
  });
});

describe.skipIf(!temBanco)('processarOutbox contra Postgres real', { timeout: 60_000 }, () => {
  const T = randomUUID();
  let dono: pg.Client;
  let banco: AcessoBanco;

  const evento = async (tipo: string) => {
    const id = randomUUID();
    await dono.query(
      `insert into app.evento_dominio (id, tenant_id, tipo, entidade, registro_id, payload)
       values ($1, $2, $3, 'teste', $4, '{}')`,
      [id, T, tipo, randomUUID()],
    );
    return id;
  };
  const estado = async (id: string) =>
    (
      await dono.query(
        `select processado_em is not null as processado, tentativas, erro,
                disponivel_em > now() as adiado
         from app.evento_dominio where id = $1`,
        [id],
      )
    ).rows[0];

  beforeAll(async () => {
    dono = new pg.Client({ connectionString: url(URL_DONO) });
    await dono.connect();
    await dono.query(`insert into app.tenant (id, nome) values ($1, 'Outbox')`, [T]);
    banco = await criarAcessoBanco({ worker: { url: url(URL_WORKER), max: 3 } });
  });

  afterAll(async () => {
    await banco?.encerrar();
    if (!dono) return;
    await dono.query(`delete from app.evento_dominio where tenant_id = $1`, [T]);
    await dono.query(`delete from app.tenant where id = $1`, [T]);
    await dono.end();
  });

  it('sucesso marca processado; falha adia com erro; tipo sem manipulador fica intocado', async () => {
    const ok = await evento('teste.ok');
    const falha = await evento('teste.falha');
    const semManipulador = await evento('teste.sem_consumidor');
    const manipuladores: Record<string, Manipulador> = {
      'teste.ok': async () => undefined,
      'teste.falha': async () => Promise.reject(new Error('smtp fora')),
    };

    expect(await processarOutbox(banco, T, manipuladores)).toEqual({ processados: 1, falhas: 1 });
    expect(await estado(ok)).toMatchObject({ processado: true, tentativas: 0 });
    expect(await estado(falha)).toEqual({
      processado: false,
      tentativas: 1,
      erro: 'smtp fora',
      adiado: true,
    });
    expect(await estado(semManipulador)).toEqual({
      processado: false,
      tentativas: 0,
      erro: null,
      adiado: false,
    });

    // Adiado: a rodada seguinte não pega o que falhou nem o que já foi.
    expect(await processarOutbox(banco, T, manipuladores)).toEqual({ processados: 0, falhas: 0 });
  });

  it('duas execuções simultâneas não processam o mesmo evento duas vezes (skip locked)', async () => {
    const ids = await Promise.all(Array.from({ length: 10 }, () => evento('teste.conta')));
    const vistos: string[] = [];
    const manipuladores: Record<string, Manipulador> = {
      'teste.conta': async (e) => {
        vistos.push(e.id);
        await new Promise((ok) => setTimeout(ok, 20));
      },
    };
    const [a, b] = await Promise.all([
      processarOutbox(banco, T, manipuladores),
      processarOutbox(banco, T, manipuladores),
    ]);
    expect((a?.processados ?? 0) + (b?.processados ?? 0)).toBe(10);
    expect([...vistos].sort()).toEqual([...ids].sort());
  });

  it('F0-09: o laço por tenant lista pelo worker e um tenant com erro não para os outros', async () => {
    const [T2, T3] = [randomUUID(), randomUUID()];
    for (const t of [T2, T3]) {
      await dono.query(`insert into app.tenant (id, nome) values ($1, 'Outbox laço')`, [t]);
      await dono.query(
        `insert into app.evento_dominio (id, tenant_id, tipo, entidade, registro_id, payload)
         values ($1, $2, 'teste.laco', 'teste', $3, '{}')`,
        [randomUUID(), t, randomUUID()],
      );
    }
    try {
      const todos = await banco.listarTenants();
      expect(todos).toEqual(expect.arrayContaining([T, T2, T3]));

      const manipuladores: Record<string, Manipulador> = { 'teste.laco': async () => undefined };
      // O do meio falha antes de abrir a transação (id inválido): o laço segue.
      const r = await rodarPorTenant(
        async () => [T2, 'nao-e-uuid', T3],
        (t) => processarOutbox(banco, t, manipuladores),
      );
      expect(r.concluidos.map((c) => [c.tenantId, c.resultado.processados])).toEqual([
        [T2, 1],
        [T3, 1],
      ]);
      expect(r.falhas.map((f) => f.tenantId)).toEqual(['nao-e-uuid']);
    } finally {
      await dono.query(`delete from app.evento_dominio where tenant_id = any($1::uuid[])`, [
        [T2, T3],
      ]);
      await dono.query(`delete from app.tenant where id = any($1::uuid[])`, [[T2, T3]]);
    }
  });
});
