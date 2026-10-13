// O relógio do roteiro (montagem do gerador do histórico, nunca o web em
// funcionamento) sem banco: o pool é falso e registra o que seria enviado ao
// Postgres. Sem a opção, o SQL é o de sempre (default da coluna e now()); com
// ela, as datas da lista fechada levam o instante lido no início da unidade, e
// a auditoria continua com o default do banco.
import type pg from 'pg';
import { describe, expect, it } from 'vitest';
import { montarAcesso } from '../src/acesso';
import { criarKysely } from '../src/conexao';
import { criarAtivo } from '../src/repositorios/ativos';
import { encerrarParada } from '../src/repositorios/paradas';
import { registrarTransicao } from '../src/repositorios/transicoes';

const USUARIO = 'aaaaaaaa-0000-4000-8000-000000000001';
const TENANT = '10000000-0000-4000-8000-000000000001';
const HOTEL = '20000000-0000-4000-8000-000000000001';
const LOCAL = '30000000-0000-4000-8000-000000000001';
const OS = '40000000-0000-4000-8000-000000000001';
const PARADA = '50000000-0000-4000-8000-000000000001';
const ctx = { usuarioId: USUARIO, tenantId: TENANT };
const INSTANTE = new Date('2026-04-01T13:00:00.000Z');

interface Envio {
  sql: string;
  parametros: unknown[];
}

function poolFalso() {
  const envios: Envio[] = [];
  const pool = {
    options: {},
    async connect() {
      return {
        async query(texto: string, parametros: unknown[]) {
          envios.push({ sql: texto, parametros });
          return { command: 'SELECT', rowCount: 1, rows: [{ id: PARADA, hotel_id: HOTEL }] };
        },
        release() {},
      };
    },
    async end() {},
  };
  return { pool: pool as unknown as pg.Pool, envios };
}

async function gravar(relogioDoRoteiro?: { agora(): Date }) {
  const { pool, envios } = poolFalso();
  const banco = montarAcesso(
    { app: criarKysely(pool), worker: null, ingestao: null },
    relogioDoRoteiro,
  );
  await banco.executar(ctx, async (uow) => {
    await criarAtivo(uow, HOTEL, LOCAL, {
      nome: 'Split',
      categoriaId: null,
      fabricante: null,
      modelo: null,
      numeroSerie: null,
      dataCompra: null,
      garantiaAte: null,
      criticidade: null,
      campos: {},
    });
    await registrarTransicao(uow, {
      osId: OS,
      hotelId: HOTEL,
      acao: 'gerar',
      de: null,
      para: 'atribuida',
    });
    await encerrarParada(uow, {
      id: PARADA,
      hotelId: HOTEL,
      fim: new Date('2026-04-01T15:00:00.000Z'),
    });
  });
  const de = (tabela: string) => envios.find((e) => e.sql.includes(`"${tabela}"`)) as Envio;
  return {
    ativo: de('app"."ativo'),
    transicao: de('app"."os_transicao'),
    parada: envios.find((e) => /^update "app"."parada_ativo"/.test(e.sql)) as Envio,
    auditoria: de('app"."auditoria'),
  };
}

describe('relógio do roteiro no packages/db', () => {
  it('sem a opção (o web em funcionamento), o SQL é o de sempre', async () => {
    const r = await gravar();
    expect(r.ativo.sql).not.toMatch(/criado_em|atualizado_em/);
    expect(r.transicao.sql).not.toMatch(/"quando"/);
    expect(r.parada.sql).toMatch(/"atualizado_em" = now\(\)/);
  });

  it('com a opção, as datas da lista fechada levam o instante do roteiro', async () => {
    let leituras = 0;
    const r = await gravar({
      agora: () => {
        leituras++;
        return INSTANTE;
      },
    });
    // Lido uma vez, no início da unidade: a unidade toda grava o mesmo instante.
    expect(leituras).toBe(1);
    expect(r.ativo.sql).toMatch(/"criado_em", "atualizado_em"/);
    expect(r.ativo.parametros.filter((p) => p === INSTANTE)).toHaveLength(2);
    expect(r.transicao.sql).toMatch(/"quando"/);
    expect(r.transicao.parametros).toContain(INSTANTE);
    expect(r.parada.sql).not.toMatch(/now\(\)/);
    expect(r.parada.parametros).toContain(INSTANTE);
  });

  it('a auditoria fica com o default do banco, com ou sem a opção', async () => {
    for (const r of [await gravar(), await gravar({ agora: () => INSTANTE })]) {
      expect(r.auditoria.sql).not.toMatch(/"em"/);
      expect(r.auditoria.parametros).not.toContain(INSTANTE);
    }
  });
});
