import { describe, expect, it } from 'vitest';
import {
  edificacoesDoHotel,
  exigirLocalEditavel,
  localEditavel,
  mesmoNomeDeLocal,
  normalizarAndar,
  normalizarEdificacao,
  normalizarNomeDeLocal,
  origemDoLocal,
  podeGerirLocais,
} from '../src/locais';
import type { Atribuicao } from '../src/index';

const AGORA = new Date('2026-09-28T12:00:00Z');
const H1 = { id: 'h1', bandeiraId: 'b1' };
const atr = (
  papel: Atribuicao['papel'],
  escopo: Atribuicao['escopo'],
  extra: Partial<Atribuicao> = {},
): Atribuicao => ({
  id: 'a',
  usuarioId: 'u',
  papel,
  escopo,
  validoAte: null,
  revogadoEm: null,
  ...extra,
});

describe('locais (B1)', () => {
  it('UH e local do CM são só leitura; área comum manual se edita', () => {
    expect(localEditavel({ tipo: 'area_comum', codExterno: null })).toBe(true);
    expect(localEditavel({ tipo: 'uh', codExterno: '101' })).toBe(false);
    expect(localEditavel({ tipo: 'uh', codExterno: null })).toBe(false);
    expect(localEditavel({ tipo: 'area_comum', codExterno: 'PISC' })).toBe(false);
    expect(origemDoLocal({ tipo: 'uh', codExterno: '101' })).toBe('sistema_hoteleiro');
    expect(() => exigirLocalEditavel({ tipo: 'uh', codExterno: '101' })).toThrow(
      expect.objectContaining({ codigo: 'local_so_leitura' }),
    );
  });

  it('quem gere: Admin, Gestor, Implantador e Gerente no escopo do hotel', () => {
    const futuro = new Date('2026-12-31T00:00:00Z');
    for (const minhas of [
      [atr('admin_grupo', { tipo: 'grupo' })],
      [atr('gestor_csc', { tipo: 'bandeira', bandeiraId: 'b1' })],
      [atr('implantador', { tipo: 'hotel', hotelId: 'h1' }, { validoAte: futuro })],
      [atr('gerente_hotel', { tipo: 'hotel', hotelId: 'h1' })],
    ]) {
      expect(podeGerirLocais(minhas, H1, AGORA).permitido).toBe(true);
    }
    for (const minhas of [
      [atr('tecnico', { tipo: 'hotel', hotelId: 'h1' })],
      [atr('solicitante', { tipo: 'hotel', hotelId: 'h1' })],
      [atr('gerente_hotel', { tipo: 'hotel', hotelId: 'h2' })],
      [
        atr(
          'implantador',
          { tipo: 'hotel', hotelId: 'h1' },
          { validoAte: new Date('2026-09-01T00:00:00Z') },
        ),
      ],
      [atr('proprietario', { tipo: 'hotel', hotelId: 'h1' })],
    ]) {
      const r = podeGerirLocais(minhas, H1, AGORA);
      expect(r.permitido ? 'ok' : r.erro.codigo).toBe('locais_fora_do_escopo');
    }
  });

  it('nome, andar e comparação de nomes', () => {
    expect(normalizarNomeDeLocal('  Casa   de máquinas ')).toBe('Casa de máquinas');
    expect(() => normalizarNomeDeLocal(' ')).toThrow(
      expect.objectContaining({ codigo: 'local_nome_invalido' }),
    );
    expect(normalizarAndar('  ')).toBeNull();
    expect(normalizarAndar(' Térreo ')).toBe('Térreo');
    expect(() => normalizarAndar('x'.repeat(21))).toThrow(
      expect.objectContaining({ codigo: 'local_andar_invalido' }),
    );
    expect(mesmoNomeDeLocal('Piscina', 'piscina')).toBe(true);
    expect(mesmoNomeDeLocal('Área', 'Area')).toBe(false);
  });

  it('edificação (I2): opcional, sem espaços nas pontas, até 60 caracteres', () => {
    expect(normalizarEdificacao(null)).toBeNull();
    expect(normalizarEdificacao('   ')).toBeNull();
    expect(normalizarEdificacao('  Torre   A ')).toBe('Torre A');
    expect(normalizarEdificacao('x'.repeat(60))).toBe('x'.repeat(60));
    expect(() => normalizarEdificacao('x'.repeat(61))).toThrow(
      expect.objectContaining({ codigo: 'local_edificacao_invalida', parametros: { maximo: 60 } }),
    );
  });

  it('edificações do hotel (I2): uma por grafia sem diferença de caixa, em ordem', () => {
    const sugeridas = edificacoesDoHotel([
      { edificacao: 'torre a' },
      { edificacao: null },
      { edificacao: 'Bloco 2' },
      { edificacao: 'Torre A' },
      { edificacao: 'Anexo' },
      { edificacao: 'Bloco 2' },
    ]);
    expect(sugeridas.map((e) => e.toLowerCase())).toEqual(['anexo', 'bloco 2', 'torre a']);
    expect(edificacoesDoHotel([])).toEqual([]);
  });
});
