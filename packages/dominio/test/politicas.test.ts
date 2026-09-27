import { describe, expect, it } from 'vitest';
import {
  podeGerirPoliticas,
  resolverPolitica,
  validarPolitica,
  validarRegiao,
} from '../src/politicas';
import type { Atribuicao } from '../src/index';

const AGORA = new Date('2026-09-27T12:00:00Z');
const U1 = '0193a000-0000-4000-8000-000000000001';
const U2 = '0193a000-0000-4000-8000-000000000002';

describe('políticas (ADR-026)', () => {
  it('resolve hotel → grupo → padrão', () => {
    const hotel = { ligado: true, dias: 3 };
    const grupo = { ligado: true, dias: 10 };
    expect(resolverPolitica('os.aceite_automatico', { hotel, grupo })).toEqual(hotel);
    expect(resolverPolitica('os.aceite_automatico', { grupo })).toEqual(grupo);
    expect(resolverPolitica('os.aceite_automatico', {})).toEqual({ ligado: false, dias: 7 });
  });

  it('valor gravado fora do formato não vale e cai para o nível seguinte', () => {
    expect(
      resolverPolitica('os.aceite_automatico', {
        hotel: { ligado: 'sim' },
        grupo: { ligado: true, dias: 2 },
      }),
    ).toEqual({
      ligado: true,
      dias: 2,
    });
  });

  it.each([
    ['os.aceite_automatico', { ligado: true, dias: 0 }, 'politica_valor_invalido'],
    ['os.aceite_automatico', { ligado: true, dias: 61 }, 'politica_valor_invalido'],
    ['os.aceite_automatico', { ligado: true, dias: 7, extra: 1 }, 'politica_valor_invalido'],
    ['os.aceite_automatico', [true, 7], 'politica_valor_invalido'],
    ['chamado.prioridade_padrao_por_categoria', { nao_uuid: U1 }, 'politica_valor_invalido'],
    ['chamado.nao_existe', {}, 'politica_desconhecida'],
  ] as const)('%s %o: %s', (chave, valor, codigo) => {
    expect(() => validarPolitica(chave, valor)).toThrow(expect.objectContaining({ codigo }));
  });

  it('valores válidos passam', () => {
    expect(validarPolitica('os.aceite_automatico', { ligado: false, dias: 60 })).toEqual({
      ligado: false,
      dias: 60,
    });
    expect(validarPolitica('chamado.prioridade_padrao_por_categoria', { [U1]: U2 })).toEqual({
      [U1]: U2,
    });
  });

  it('só o Admin do grupo configura', () => {
    const atr = (papel: Atribuicao['papel']): Atribuicao => ({
      id: 'a',
      usuarioId: 'u',
      papel,
      escopo: papel === 'admin_grupo' ? { tipo: 'grupo' } : { tipo: 'hotel', hotelId: 'h' },
      validoAte: null,
      revogadoEm: null,
    });
    expect(podeGerirPoliticas([atr('admin_grupo')], AGORA).permitido).toBe(true);
    const r = podeGerirPoliticas([atr('gerente_hotel')], AGORA);
    expect(r.permitido ? 'ok' : r.erro.codigo).toBe('configuracao_so_admin');
  });
});

describe('região', () => {
  it.each([
    [{ pais: 'Brasil' }, 'pais_invalido'],
    [{ pais: 'BR', subdivisao: 'AR-B' }, 'subdivisao_invalida'],
    [{ subdivisao: 'PR' }, 'subdivisao_invalida'],
    [{ moeda: 'real' }, 'moeda_invalida'],
  ] as const)('%o: %s', (r, codigo) => {
    expect(() => validarRegiao(r)).toThrow(expect.objectContaining({ codigo }));
  });

  it('formatos ISO passam', () => {
    expect(() => validarRegiao({ pais: 'BR', subdivisao: 'BR-PR', moeda: 'BRL' })).not.toThrow();
    expect(() => validarRegiao({ pais: null, subdivisao: null, moeda: null })).not.toThrow();
  });
});
