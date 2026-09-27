import { describe, expect, it } from 'vitest';
import {
  exigirSemSobreposicao,
  normalizarDocumento,
  normalizarNomeDeProprietario,
  podeGerirProprietarios,
  validarVigencia,
  vigenciaCobre,
  vigenciasSobrepostas,
} from '../src/proprietarios';
import type { Atribuicao } from '../src/index';

const AGORA = new Date('2026-09-27T12:00:00Z');
const atr = (papel: Atribuicao['papel']): Atribuicao => ({
  id: 'a',
  usuarioId: 'u',
  papel,
  escopo: papel === 'admin_grupo' ? { tipo: 'grupo' } : { tipo: 'hotel', hotelId: 'h' },
  validoAte: null,
  revogadoEm: null,
});

describe('proprietários (ADR-031)', () => {
  it('só o Admin do grupo gere', () => {
    expect(podeGerirProprietarios([atr('admin_grupo')], AGORA).permitido).toBe(true);
    for (const papel of ['implantador', 'gerente_hotel', 'gestor_csc'] as const) {
      const r = podeGerirProprietarios([atr(papel)], AGORA);
      expect(r.permitido ? 'ok' : r.erro.codigo).toBe('proprietarios_so_admin');
    }
  });

  it('nome e documento', () => {
    expect(normalizarNomeDeProprietario('  Maria   da  Silva ')).toBe('Maria da Silva');
    expect(() => normalizarNomeDeProprietario('  ')).toThrow(
      expect.objectContaining({ codigo: 'proprietario_nome_invalido' }),
    );
    expect(normalizarDocumento('  ')).toBeNull();
    expect(normalizarDocumento(' 123.456.789-00 ')).toBe('123.456.789-00');
    expect(() => normalizarDocumento('x'.repeat(33))).toThrow(
      expect.objectContaining({ codigo: 'proprietario_documento_invalido' }),
    );
  });

  it.each([
    [{ inicio: '2026-02-30', fim: null }],
    [{ inicio: '2026-09-27', fim: '2026-09-26' }],
    [{ inicio: '27/09/2026', fim: null }],
  ])('vigência inválida: %o', (v) => {
    expect(() => validarVigencia(v)).toThrow(
      expect.objectContaining({ codigo: 'vigencia_invalida' }),
    );
  });

  it('vigência cobre os dois extremos; fim nulo é sem prazo', () => {
    const v = { inicio: '2026-09-01', fim: '2026-09-30' };
    expect(
      ['2026-08-31', '2026-09-01', '2026-09-30', '2026-10-01'].map((d) => vigenciaCobre(v, d)),
    ).toEqual([false, true, true, false]);
    expect(vigenciaCobre({ inicio: '2026-09-01', fim: null }, '2099-01-01')).toBe(true);
  });

  it('sobreposição', () => {
    const a = { inicio: '2026-01-01', fim: '2026-06-30' };
    expect(vigenciasSobrepostas(a, { inicio: '2026-06-30', fim: null })).toBe(true);
    expect(vigenciasSobrepostas(a, { inicio: '2026-07-01', fim: null })).toBe(false);
    expect(
      vigenciasSobrepostas(
        { inicio: '2026-01-01', fim: null },
        { inicio: '2030-01-01', fim: null },
      ),
    ).toBe(true);
    expect(() => exigirSemSobreposicao([a], { inicio: '2026-03-01', fim: '2026-03-31' })).toThrow(
      expect.objectContaining({ codigo: 'vinculo_sobreposto' }),
    );
    expect(() => exigirSemSobreposicao([a], { inicio: '2026-07-01', fim: null })).not.toThrow();
  });
});
