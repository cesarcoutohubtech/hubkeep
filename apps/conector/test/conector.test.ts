// Agente conector (F0-08): planilha, esqueleto do TOTVS e envio em lotes.
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CONSULTAS,
  criarAdaptadorDePlanilha,
  criarAdaptadorTotvs,
  dividirEmLotes,
  enviar,
  lerCsv,
} from '../src/index';

const CREDENCIAL = `hk_10000000-0000-4000-8000-000000000001_${'s'.repeat(43)}`;

describe('CSV da planilha', () => {
  it('lê ponto e vírgula, aspas, aspas dobradas, CRLF e BOM', () => {
    const texto =
      '﻿codigo;hotel;nome;andar\r\n101;H1;"UH ""vista"" mar";1\r\n102;H1;"Linha\nquebrada";\r\n';
    expect(lerCsv(texto)).toEqual([
      { codigo: '101', hotel: 'H1', nome: 'UH "vista" mar', andar: '1' },
      { codigo: '102', hotel: 'H1', nome: 'Linha\nquebrada', andar: '' },
    ]);
  });

  it('aspas sem fechar é erro, não dado cortado', () => {
    expect(() => lerCsv('codigo,nome\n1,"sem fim')).toThrow(/aspas/);
  });
});

describe('adaptador de planilha', () => {
  it('lê UHs e hotéis em ordem de chave, sem andar vazio', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'hk-conector-'));
    const uhs = join(dir, 'uhs.csv');
    const hoteis = join(dir, 'hoteis.csv');
    await writeFile(uhs, 'codigo,hotel,nome,andar\n102,H1,102,\n101,H1,101,1\n');
    await writeFile(hoteis, 'codigo,nome\nH1,Hotel Um\n');
    const a = criarAdaptadorDePlanilha({ uh: uhs, hotel: hoteis });
    expect(a.fonte).toBe('planilha');
    expect(await a.ler('uh')).toEqual([
      { chave: '101', dados: { hotel: 'H1', nome: '101', andar: '1' } },
      { chave: '102', dados: { hotel: 'H1', nome: '102' } },
    ]);
    expect(await a.ler('hotel')).toEqual([{ chave: 'H1', dados: { nome: 'Hotel Um' } }]);
  });

  it('planilha sem coluna obrigatória é recusada com o nome da coluna', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'hk-conector-'));
    const uhs = join(dir, 'uhs.csv');
    await writeFile(uhs, 'codigo,nome\n101,101\n');
    await expect(criarAdaptadorDePlanilha({ uh: uhs }).ler('uh')).rejects.toThrow(/hotel/);
  });
});

describe('adaptador TOTVS (esqueleto)', () => {
  it('só faz SELECT nas views combinadas e mapeia para o contrato', async () => {
    const consultas: string[] = [];
    const a = criarAdaptadorTotvs(async (sql) => {
      consultas.push(sql);
      return [{ codigo: ' 101 ', hotel: 'H1', nome: 'UH 101', andar: null }];
    });
    expect(await a.ler('uh')).toEqual([{ chave: '101', dados: { hotel: 'H1', nome: 'UH 101' } }]);
    expect(consultas).toEqual([CONSULTAS.uh]);
    for (const c of Object.values(CONSULTAS)) expect(c).toMatch(/^SELECT .* FROM vw_hubkeep_/);
  });
});

describe('envio em lotes', () => {
  const registros = Array.from({ length: 5 }, (_, i) => ({
    chave: String(i),
    dados: { nome: 'x'.repeat(40) },
  }));

  it('divide pelo número de registros e pelo tamanho', () => {
    expect(
      dividirEmLotes(registros, { registros: 2, bytes: 1_000_000 }).map((l) => l.length),
    ).toEqual([2, 2, 1]);
    const porTamanho = dividirEmLotes(registros, { registros: 100, bytes: 150 });
    expect(porTamanho.length).toBeGreaterThan(1);
    expect(porTamanho.flat()).toHaveLength(5);
  });

  it('envia com Authorization: Agent e conta lotes novos e repetidos', async () => {
    const pedidos: { url: string; auth: string | null; registros: unknown[] }[] = [];
    const falso = (async (url: string, init?: RequestInit) => {
      pedidos.push({
        url,
        auth: new Headers(init?.headers).get('authorization'),
        registros: (JSON.parse(String(init?.body)) as { registros: unknown[] }).registros,
      });
      return Response.json(
        {
          cargaId: '01939a6e-0000-7000-8000-000000000001',
          loteHash: 'h',
          novo: true,
          registros: 5,
        },
        { status: 201 },
      );
    }) as typeof fetch;
    const r = await enviar({
      apiUrl: 'https://api.hubkeep.test/',
      credencial: CREDENCIAL,
      fonte: 'planilha',
      entidade: 'uh',
      registros,
      fetch: falso,
    });
    expect(r).toEqual({ lotes: 1, novos: 1, repetidos: 0 });
    expect(pedidos[0]?.url).toBe('https://api.hubkeep.test/api/v1/ingestao/lotes');
    expect(pedidos[0]?.auth).toBe(`Agent ${CREDENCIAL}`);
    expect(pedidos[0]?.registros).toHaveLength(5);
  });

  it('lote recusado para o envio com o status, sem a credencial na mensagem', async () => {
    const falso = (async () =>
      Response.json(
        { erro: { codigo: 'nao_autenticado', parametros: {}, requestId: 'r' } },
        { status: 401 },
      )) as typeof fetch;
    const erro = await enviar({
      apiUrl: 'https://x',
      credencial: CREDENCIAL,
      fonte: 'planilha',
      entidade: 'uh',
      registros,
      fetch: falso,
    }).catch((e: unknown) => e as Error);
    expect(erro).toBeInstanceOf(Error);
    expect((erro as Error).message).toMatch(/401/);
    expect((erro as Error).message).not.toContain(CREDENCIAL);
  });
});
