import { describe, expect, it } from 'vitest';
import {
  conflitoDeVersao,
  exigirLocalParaAtivo,
  normalizarNomeDeAtivo,
  normalizarTextoDoAtivo,
  podeGerirAtivos,
  podeMoverAtivo,
  validarCamposDoAtivo,
  validarMovimentacao,
} from '../src/ativos';
import type { Atribuicao, DefinicaoDeCampo } from '../src/index';

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
const DEFS: DefinicaoDeCampo[] = [
  {
    chave: 'potencia',
    tipo: 'numero',
    obrigatorio: true,
    rotulos: { 'pt-BR': 'Potência' },
    unidade: 'BTU',
    opcoes: [],
  },
  {
    chave: 'instalado_em',
    tipo: 'data',
    obrigatorio: false,
    rotulos: { 'pt-BR': 'Instalação' },
    unidade: null,
    opcoes: [],
  },
];

describe('ativos (B3)', () => {
  it('gerem ativos os papéis de locais e o técnico, no hotel; solicitante e proprietário não', () => {
    const hotel = { tipo: 'hotel' as const, hotelId: 'h1' };
    for (const papel of ['gerente_hotel', 'implantador', 'tecnico'] as const) {
      expect(podeGerirAtivos([atr(papel, hotel)], H1, AGORA).permitido).toBe(true);
    }
    expect(podeGerirAtivos([atr('admin_grupo', { tipo: 'grupo' })], H1, AGORA).permitido).toBe(
      true,
    );
    expect(podeGerirAtivos([atr('solicitante', hotel)], H1, AGORA).permitido).toBe(false);
    expect(
      podeGerirAtivos([atr('tecnico', { tipo: 'hotel', hotelId: 'h2' })], H1, AGORA).permitido,
    ).toBe(false);
    const vencido = atr('tecnico', hotel, { validoAte: new Date('2026-09-27T00:00:00Z') });
    const r = podeGerirAtivos([vencido], H1, AGORA);
    expect(r.permitido).toBe(false);
    if (!r.permitido) expect(r.erro.codigo).toBe('ativos_fora_do_escopo');
  });

  it('normaliza nome e textos opcionais', () => {
    expect(normalizarNomeDeAtivo('  Frigobar   101 ')).toBe('Frigobar 101');
    expect(() => normalizarNomeDeAtivo('   ')).toThrow(
      expect.objectContaining({ codigo: 'ativo_nome_invalido' }),
    );
    expect(normalizarTextoDoAtivo('fabricante', '  ')).toBeNull();
    expect(normalizarTextoDoAtivo('modelo', ' X  200 ')).toBe('X 200');
    expect(() => normalizarTextoDoAtivo('numero_serie', 'x'.repeat(121))).toThrow(
      expect.objectContaining({
        codigo: 'ativo_texto_invalido',
        parametros: expect.objectContaining({ campo: 'numero_serie' }),
      }),
    );
  });

  it('local inativo não recebe ativo; pendente de licença recebe', () => {
    expect(() => exigirLocalParaAtivo({ status: 'inativo' })).toThrow(
      expect.objectContaining({ codigo: 'ativo_local_inativo' }),
    );
    expect(() => exigirLocalParaAtivo({ status: 'pendente_licenca' })).not.toThrow();
  });

  it('campos estendidos validados contra a categoria', () => {
    const cat = { id: 'c1', ativa: true, definicoes: DEFS };
    expect(validarCamposDoAtivo(cat, null, { potencia: 9000 })).toEqual({ potencia: 9000 });
    expect(() => validarCamposDoAtivo(cat, null, {})).toThrow(
      expect.objectContaining({ codigo: 'campo_obrigatorio' }),
    );
    expect(() => validarCamposDoAtivo(cat, null, { potencia: 'muito' })).toThrow(
      expect.objectContaining({ codigo: 'valor_de_campo_invalido' }),
    );
    expect(() => validarCamposDoAtivo(null, null, { potencia: 1 })).toThrow(
      expect.objectContaining({ codigo: 'campo_desconhecido' }),
    );
    expect(validarCamposDoAtivo(null, null, undefined)).toEqual({});
  });

  it('categoria desativada não entra em ativo novo, mas o ativo que já estava nela segue', () => {
    const inativa = { id: 'c1', ativa: false, definicoes: DEFS };
    expect(() => validarCamposDoAtivo(inativa, null, { potencia: 1 })).toThrow(
      expect.objectContaining({ codigo: 'ativo_categoria_inativa' }),
    );
    expect(() => validarCamposDoAtivo(inativa, 'c2', { potencia: 1 })).toThrow(
      expect.objectContaining({ codigo: 'ativo_categoria_inativa' }),
    );
    expect(validarCamposDoAtivo(inativa, 'c1', { potencia: 1 })).toEqual({ potencia: 1 });
  });

  it('conflito de versão leva a versão atual', () => {
    const e = conflitoDeVersao(3);
    expect(e.codigo).toBe('conflito_de_versao');
    expect(e.parametros).toEqual({ versaoAtual: 3 });
  });

  it('mover: só quem gere o hotel; o técnico cadastra, mas não move', () => {
    const hotel = { tipo: 'hotel', hotelId: 'h1' } as const;
    for (const papel of ['gerente_hotel', 'implantador'] as const) {
      expect(podeMoverAtivo([atr(papel, hotel)], H1, AGORA).permitido).toBe(true);
    }
    expect(podeMoverAtivo([atr('admin_grupo', { tipo: 'grupo' })], H1, AGORA).permitido).toBe(true);
    expect(
      podeMoverAtivo([atr('gestor_csc', { tipo: 'bandeira', bandeiraId: 'b1' })], H1, AGORA)
        .permitido,
    ).toBe(true);
    for (const papel of ['tecnico', 'solicitante'] as const) {
      const r = podeMoverAtivo([atr(papel, hotel)], H1, AGORA);
      expect(r.permitido).toBe(false);
      if (!r.permitido) expect(r.erro.codigo).toBe('mover_ativo_fora_do_escopo');
    }
    expect(
      podeMoverAtivo([atr('gerente_hotel', { tipo: 'hotel', hotelId: 'h2' })], H1, AGORA).permitido,
    ).toBe(false);
  });

  it('mover: outro local do mesmo hotel, ativo; ativo desativado não se move', () => {
    const ativo = { hotelId: 'h1', localId: 'l1', desativado: false };
    const destino = { id: 'l2', hotelId: 'h1', status: 'ativo' } as const;
    expect(() => validarMovimentacao(ativo, destino)).not.toThrow();
    expect(() =>
      validarMovimentacao(ativo, { ...destino, status: 'pendente_licenca' }),
    ).not.toThrow();
    const recusa = (
      a: typeof ativo,
      d: Parameters<typeof validarMovimentacao>[1],
      codigo: string,
    ) => expect(() => validarMovimentacao(a, d)).toThrow(expect.objectContaining({ codigo }));
    recusa(ativo, { ...destino, hotelId: 'h2' }, 'mover_ativo_entre_hoteis');
    recusa(ativo, { ...destino, id: 'l1' }, 'mover_ativo_mesmo_local');
    recusa(ativo, { ...destino, status: 'inativo' }, 'mover_ativo_local_inativo');
    recusa({ ...ativo, desativado: true }, destino, 'ativo_desativado');
  });
});
