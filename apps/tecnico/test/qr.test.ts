// QR individual no PWA (B5): abre pelo aparelho sem rede, pergunta à API só
// quando o ativo não está guardado, e devolve código nos casos de recusa.
import { describe, expect, it, vi } from 'vitest';
import type { Credenciais } from '../src/api';
import { abrirQr, codigoDoCaminho, noAparelho } from '../src/qr';
import type { AtivoGuardado, Referencia } from '../src/referencia/banco';

const credenciais: Credenciais = {
  usuarioId: () => 'u',
  token: async () => 'token',
  tenant: () => 't',
};
const H1 = 'b1000000-0000-4000-8000-000000000001';
const ativo = (id: string, codigoQr?: string): AtivoGuardado => ({
  id,
  localId: 'c1000000-0000-4000-8000-000000000001',
  categoriaId: null,
  nome: `Ativo ${id}`,
  fabricante: null,
  modelo: null,
  numeroSerie: null,
  campos: {},
  versao: 1,
  ativo: true,
  ...(codigoQr ? { codigoQr } : {}),
});
const referencia: Referencia = {
  usuarioId: 'u',
  tenantId: 't',
  hoteis: [{ id: H1, nome: 'Hotel 1' }],
  locais: {},
  ativos: {
    [H1]: [
      ativo('a1000000-0000-4000-8000-000000000001', '7K3M9QX2AB'),
      ativo('a1000000-0000-4000-8000-000000000002'),
    ],
  },
  idiomaPadrao: 'pt-BR',
  categorias: [],
  lidaEm: 0,
};
const json = (status: number, dados: unknown) =>
  new Response(JSON.stringify(dados), { status, headers: { 'content-type': 'application/json' } });

describe('codigoDoCaminho', () => {
  it('lê /q/<codigo> e ignora outros caminhos', () => {
    expect(codigoDoCaminho('/q/7K3M9QX2AB')).toBe('7K3M9QX2AB');
    expect(codigoDoCaminho('/q/7k3m-9qx2-ab/')).toBe('7k3m-9qx2-ab');
    expect(codigoDoCaminho('/')).toBeNull();
    expect(codigoDoCaminho('/q/')).toBeNull();
    expect(codigoDoCaminho('/q/a/b')).toBeNull();
    expect(codigoDoCaminho('/q/%E0%A4%A')).toBeNull();
  });
});

describe('abrirQr', () => {
  it('ativo guardado no aparelho: abre sem rede e sem chamar a API', async () => {
    const requisitar = vi.fn<typeof fetch>();
    const r = await abrirQr('7k3m-9qx2-ab', {
      referencia,
      online: false,
      credenciais,
      requisitar,
    });
    expect(r).toEqual({ tipo: 'ok', hotelId: H1, ativo: referencia.ativos[H1]?.[0] });
    expect(requisitar).not.toHaveBeenCalled();
  });

  it('fora do aparelho e sem rede: qr_sem_rede', async () => {
    const r = await abrirQr('ZZZZZZZZZZ', { referencia, online: false, credenciais });
    expect(r).toEqual({ tipo: 'erro', codigo: 'qr_sem_rede' });
  });

  it('fora do aparelho, com rede: pergunta à API pelo código normalizado', async () => {
    const doServidor = {
      ...ativo('a1000000-0000-4000-8000-000000000009'),
      codigoQr: 'ZZZZZZZZZZ',
      paradoDesde: '2026-09-29T09:00:00.000Z',
    };
    const requisitar = vi.fn<typeof fetch>(async () =>
      json(200, { hotelId: H1, ativo: doServidor }),
    );
    const r = await abrirQr('zzzzz-zzzzz', { referencia, online: true, credenciais, requisitar });
    expect(r).toEqual({ tipo: 'ok', hotelId: H1, ativo: doServidor });
    expect(String(requisitar.mock.calls[0]?.[0])).toBe('/api/v1/ativos/qr/ZZZZZZZZZZ');
  });

  it('API responde 404 (outro tenant ou fora do escopo): ativo_nao_encontrado', async () => {
    const requisitar = vi.fn<typeof fetch>(async () =>
      json(404, { erro: { codigo: 'ativo_nao_encontrado', parametros: {} } }),
    );
    const r = await abrirQr('ZZZZZZZZZZ', { referencia, online: true, credenciais, requisitar });
    expect(r).toEqual({ tipo: 'erro', codigo: 'ativo_nao_encontrado' });
  });

  it('código mal formado não vai à API', async () => {
    const requisitar = vi.fn<typeof fetch>();
    const r = await abrirQr('../hoteis', { referencia, online: true, credenciais, requisitar });
    expect(r).toEqual({ tipo: 'erro', codigo: 'ativo_nao_encontrado' });
    expect(requisitar).not.toHaveBeenCalled();
  });

  it('rede caiu no meio: qr_falhou', async () => {
    const requisitar = vi.fn<typeof fetch>(async () => {
      throw new TypeError('rede');
    });
    const r = await abrirQr('ZZZZZZZZZZ', { referencia, online: true, credenciais, requisitar });
    expect(r).toEqual({ tipo: 'erro', codigo: 'qr_falhou' });
  });
});

describe('noAparelho', () => {
  it('ignora ativo guardado sem código (referência de antes da B5)', () => {
    expect(noAparelho(referencia, '7K3M9QX2AB')?.ativo.id).toBe(
      'a1000000-0000-4000-8000-000000000001',
    );
    expect(noAparelho(null, '7K3M9QX2AB')).toBeNull();
  });
});
