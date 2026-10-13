// Feriados do hotel (fase 1c; ADR-042): quem cadastra, o nome e a data.
import { describe, expect, it } from 'vitest';
import {
  type Atribuicao,
  normalizarNomeDoFeriado,
  podeCadastrarFeriados,
  validarDataDoFeriado,
} from '../src/index';

const AGORA = new Date('2026-10-13T12:00:00Z');
const hotel = { id: 'h1', bandeiraId: 'b1' };
const atribuicao = (papel: Atribuicao['papel'], escopo: Atribuicao['escopo']): Atribuicao => ({
  id: 'a',
  usuarioId: 'u',
  papel,
  escopo,
  validoAte: null,
  revogadoEm: null,
});
const codigo = (f: () => unknown) => {
  try {
    f();
    return null;
  } catch (e) {
    return (e as { codigo: string }).codigo;
  }
};

describe('feriados do hotel', () => {
  it('cadastram a gestão do hotel e o Implantador, no escopo deles', () => {
    for (const a of [
      atribuicao('admin_grupo', { tipo: 'grupo' }),
      atribuicao('gestor_csc', { tipo: 'bandeira', bandeiraId: 'b1' }),
      atribuicao('gerente_hotel', { tipo: 'hotel', hotelId: 'h1' }),
      atribuicao('implantador', { tipo: 'hotel', hotelId: 'h1' }),
    ]) {
      expect(podeCadastrarFeriados([a], hotel, AGORA).permitido).toBe(true);
    }
    for (const a of [
      atribuicao('tecnico', { tipo: 'hotel', hotelId: 'h1' }),
      atribuicao('solicitante', { tipo: 'hotel', hotelId: 'h1' }),
      atribuicao('gerente_hotel', { tipo: 'hotel', hotelId: 'h2' }),
      {
        ...atribuicao('implantador', { tipo: 'hotel', hotelId: 'h1' }),
        validoAte: new Date('2026-10-01'),
      },
    ]) {
      const r = podeCadastrarFeriados([a], hotel, AGORA);
      expect(r.permitido).toBe(false);
      expect(r.permitido ? null : r.erro.codigo).toBe('feriados_fora_do_escopo');
    }
  });

  it('o nome sem espaços sobrando, de 1 a 120 caracteres', () => {
    expect(normalizarNomeDoFeriado('  Aniversário   da cidade ')).toBe('Aniversário da cidade');
    expect(codigo(() => normalizarNomeDoFeriado('   '))).toBe('feriado_nome_invalido');
    expect(codigo(() => normalizarNomeDoFeriado('x'.repeat(121)))).toBe('feriado_nome_invalido');
  });

  it('a data: um dia que existe, de 2000 a 2100', () => {
    expect(validarDataDoFeriado('2026-11-20')).toBe('2026-11-20');
    expect(validarDataDoFeriado('2028-02-29')).toBe('2028-02-29');
    for (const d of ['2026-02-29', '2026-13-01', '20-11-2026', '1999-12-31', '2101-01-01', '']) {
      expect(codigo(() => validarDataDoFeriado(d))).toBe('feriado_data_invalida');
    }
  });
});
