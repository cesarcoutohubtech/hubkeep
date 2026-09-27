import { describe, expect, it } from 'vitest';
import type { Atribuicao } from '../src/index';
import {
  normalizarNomeDeBandeira,
  podeGerirBandeiras,
  podeLigarHotelABandeira,
} from '../src/bandeiras';

const AGORA = new Date('2026-09-27T12:00:00Z');
const atr = (papel: Atribuicao['papel'], escopo: Atribuicao['escopo']): Atribuicao => ({
  id: 'a',
  usuarioId: 'u',
  papel,
  escopo,
  validoAte: null,
  revogadoEm: null,
});

describe('bandeiras', () => {
  it('só o Admin do grupo gerencia', () => {
    expect(podeGerirBandeiras([atr('admin_grupo', { tipo: 'grupo' })], AGORA).permitido).toBe(true);
    const r = podeGerirBandeiras([atr('gestor_csc', { tipo: 'grupo' })], AGORA);
    expect(r.permitido ? 'ok' : r.erro.codigo).toBe('bandeiras_so_admin');
  });

  it('hotel não vai para bandeira desativada; sem bandeira pode', () => {
    expect(podeLigarHotelABandeira({ ativa: true }).permitido).toBe(true);
    expect(podeLigarHotelABandeira(null).permitido).toBe(true);
    const r = podeLigarHotelABandeira({ ativa: false });
    expect(r.permitido ? 'ok' : r.erro.codigo).toBe('bandeira_desativada');
  });

  it('nome: limpa espaços e recusa vazio ou longo', () => {
    expect(normalizarNomeDeBandeira('  Slaviero   Essential ')).toBe('Slaviero Essential');
    expect(() => normalizarNomeDeBandeira('   ')).toThrow(
      expect.objectContaining({ codigo: 'bandeira_nome_invalido' }),
    );
    expect(() => normalizarNomeDeBandeira('x'.repeat(121))).toThrow();
  });
});
