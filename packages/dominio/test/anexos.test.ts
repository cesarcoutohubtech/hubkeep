import { describe, expect, it } from 'vitest';
import { normalizarNomeDeAnexo, podeRemoverAnexo, validarMiniatura } from '../src/anexos';
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

describe('anexos (B4)', () => {
  it('nome do arquivo: opcional, limpo e com limite', () => {
    expect(normalizarNomeDeAnexo(null)).toBeNull();
    expect(normalizarNomeDeAnexo('   ')).toBeNull();
    expect(normalizarNomeDeAnexo('  planta   baixa.pdf ')).toBe('planta baixa.pdf');
    expect(() => normalizarNomeDeAnexo('x'.repeat(201))).toThrow(
      expect.objectContaining({ codigo: 'anexo_nome_invalido' }),
    );
  });

  it('miniatura: imagem do mesmo registro', () => {
    expect(() =>
      validarMiniatura({ registro: 'r1' }, { registro: 'r1', tipo: 'image/webp' }),
    ).not.toThrow();
    for (const m of [
      { registro: 'r2', tipo: 'image/webp' },
      { registro: 'r1', tipo: 'application/pdf' },
    ]) {
      expect(() => validarMiniatura({ registro: 'r1' }, m)).toThrow(
        expect.objectContaining({ codigo: 'miniatura_invalida' }),
      );
    }
  });

  it('remove quem enviou, ou quem gere o hotel', () => {
    const tecnico = [atr('tecnico', { tipo: 'hotel', hotelId: 'h1' })];
    expect(podeRemoverAnexo(tecnico, H1, { usuarioId: 'u' }, 'u', AGORA).permitido).toBe(true);
    const outro = podeRemoverAnexo(tecnico, H1, { usuarioId: 'v' }, 'u', AGORA);
    expect(outro.permitido).toBe(false);
    if (!outro.permitido) expect(outro.erro.codigo).toBe('remover_anexo_fora_do_escopo');
    for (const minhas of [
      [atr('admin_grupo', { tipo: 'grupo' })],
      [atr('gerente_hotel', { tipo: 'hotel', hotelId: 'h1' })],
    ]) {
      expect(podeRemoverAnexo(minhas, H1, { usuarioId: 'v' }, 'u', AGORA).permitido).toBe(true);
    }
    const vencido = [
      atr('gerente_hotel', { tipo: 'hotel', hotelId: 'h1' }, { validoAte: new Date('2026-01-01') }),
    ];
    expect(podeRemoverAnexo(vencido, H1, { usuarioId: 'v' }, 'u', AGORA).permitido).toBe(false);
    const outroHotel = [atr('gerente_hotel', { tipo: 'hotel', hotelId: 'h2' })];
    expect(podeRemoverAnexo(outroHotel, H1, { usuarioId: 'v' }, 'u', AGORA).permitido).toBe(false);
  });

  it('a assinatura do aceite ninguém remove, nem quem a enviou nem o Admin (I8)', () => {
    for (const minhas of [
      [atr('solicitante', { tipo: 'hotel', hotelId: 'h1' })],
      [atr('gerente_hotel', { tipo: 'hotel', hotelId: 'h1' })],
      [atr('admin_grupo', { tipo: 'grupo' })],
    ]) {
      const r = podeRemoverAnexo(minhas, H1, { usuarioId: 'u', assinatura: true }, 'u', AGORA);
      expect(r.permitido).toBe(false);
      if (!r.permitido) expect(r.erro.codigo).toBe('assinatura_nao_se_remove');
    }
  });
});
