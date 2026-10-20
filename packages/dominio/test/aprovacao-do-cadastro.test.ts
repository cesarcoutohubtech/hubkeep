// Aprovação do cadastro do ativo (M4; decisões do Cesar de 19/10/2026): a
// situação efetiva, a situação inicial pelo PWA, quem decide e a validação da
// decisão (só o pendente; motivo na recusa).
import { describe, expect, it } from 'vitest';
import {
  type Atribuicao,
  podeDecidirCadastro,
  resolverPolitica,
  situacaoDoCadastro,
  situacaoInicialNoPwa,
  validarDecisaoDoCadastro,
} from '../src/index';

const AGORA = new Date('2026-10-19T12:00:00Z');
const HOTEL = { id: 'h1', bandeiraId: 'b1' };
const atr = (papel: Atribuicao['papel'], escopo: Atribuicao['escopo']): Atribuicao => ({
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

describe('aprovação do cadastro do ativo (M4)', () => {
  it('a situação efetiva é a decisão, quando há; senão, a inicial', () => {
    expect(situacaoDoCadastro('pendente', null)).toBe('pendente');
    expect(situacaoDoCadastro('aprovado', null)).toBe('aprovado');
    expect(situacaoDoCadastro('pendente', 'aprovado')).toBe('aprovado');
    expect(situacaoDoCadastro('pendente', 'recusado')).toBe('recusado');
  });

  it('a política nasce desligada; ligada, o PWA cadastra pendente', () => {
    const padrao = resolverPolitica('ativo.aprovacao_do_cadastro', {});
    expect(padrao).toEqual({ ligado: false });
    expect(situacaoInicialNoPwa(padrao)).toBe('aprovado');
    expect(situacaoInicialNoPwa({ ligado: true })).toBe('pendente');
  });

  it('decidem o Admin, o Gestor CSC da bandeira e o Gerente do hotel; não o Implantador nem o Técnico', () => {
    for (const a of [
      atr('admin_grupo', { tipo: 'grupo' }),
      atr('gestor_csc', { tipo: 'bandeira', bandeiraId: 'b1' }),
      atr('gerente_hotel', { tipo: 'hotel', hotelId: 'h1' }),
    ]) {
      expect(podeDecidirCadastro([a], HOTEL, AGORA).permitido).toBe(true);
    }
    for (const a of [
      atr('implantador', { tipo: 'hotel', hotelId: 'h1' }),
      atr('tecnico', { tipo: 'hotel', hotelId: 'h1' }),
      atr('gerente_hotel', { tipo: 'hotel', hotelId: 'h2' }),
      atr('gestor_csc', { tipo: 'bandeira', bandeiraId: 'b2' }),
    ]) {
      const r = podeDecidirCadastro([a], HOTEL, AGORA);
      expect(r.permitido ? null : r.erro.codigo).toBe('cadastro_fora_do_escopo');
    }
  });

  it('só o pendente é decidido; a recusa exige motivo, e a aprovação não guarda motivo', () => {
    expect(validarDecisaoDoCadastro('pendente', 'aprovado', 'ignorado')).toEqual({
      decisao: 'aprovado',
      motivo: null,
    });
    expect(validarDecisaoDoCadastro('pendente', 'recusado', '  Local  errado ')).toEqual({
      decisao: 'recusado',
      motivo: 'Local errado',
    });
    expect(codigo(() => validarDecisaoDoCadastro('pendente', 'recusado', ' '))).toBe(
      'motivo_obrigatorio',
    );
    expect(codigo(() => validarDecisaoDoCadastro('aprovado', 'aprovado', null))).toBe(
      'cadastro_ja_decidido',
    );
    expect(codigo(() => validarDecisaoDoCadastro('recusado', 'aprovado', null))).toBe(
      'cadastro_ja_decidido',
    );
    expect(codigo(() => validarDecisaoDoCadastro('pendente', 'talvez', null))).toBe(
      'decisao_do_cadastro_invalida',
    );
  });
});
