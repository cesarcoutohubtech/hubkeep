// Pacote da bandeira (PB1): o que vale para o hotel, quem mantém e quem
// aplica o pacote, a validação do plano do pacote e o que aplicar copia.
import { describe, expect, it } from 'vitest';
import {
  type Atribuicao,
  type PlanoPadrao,
  copiasDoPacote,
  podeAplicarPacote,
  podeGerirPacote,
  vaiParaOHotel,
  validarPlanoPadrao,
} from '../src/index';

const AGORA = new Date('2026-10-20T12:00:00Z');
const HOTEL = { id: 'h1', bandeiraId: 'bx' };
const atr = (
  papel: Atribuicao['papel'],
  escopo: Atribuicao['escopo'],
  validoAte: Date | null = null,
): Atribuicao => ({ id: 'a', usuarioId: 'u', papel, escopo, validoAte, revogadoEm: null });
const codigo = (f: () => unknown) => {
  try {
    f();
  } catch (e) {
    return (e as { codigo?: string }).codigo;
  }
  return undefined;
};

const plano = (p: Partial<PlanoPadrao> & Pick<PlanoPadrao, 'id' | 'nome'>): PlanoPadrao => ({
  bandeiraId: null,
  categoriaId: 'cat',
  intervalo: 1,
  unidade: 'mes',
  checklistModeloId: null,
  ativa: true,
  ...p,
});

describe('vaiParaOHotel', () => {
  it('o item do grupo vale para todo hotel; o da bandeira, só para os dela', () => {
    expect(vaiParaOHotel({ bandeiraId: null }, HOTEL)).toBe(true);
    expect(vaiParaOHotel({ bandeiraId: 'bx' }, HOTEL)).toBe(true);
    expect(vaiParaOHotel({ bandeiraId: 'by' }, HOTEL)).toBe(false);
    expect(vaiParaOHotel({ bandeiraId: 'bx' }, { bandeiraId: null })).toBe(false);
  });
});

describe('quem mantém e quem aplica', () => {
  it('só o Admin do grupo mantém o pacote', () => {
    expect(podeGerirPacote([atr('admin_grupo', { tipo: 'grupo' })], AGORA).permitido).toBe(true);
    const r = podeGerirPacote([atr('gestor_csc', { tipo: 'grupo' })], AGORA);
    expect(r.permitido ? null : r.erro.codigo).toBe('pacote_so_do_admin');
  });
  it('aplicam o Admin e o Implantador vigente do hotel; o Gerente e o vencido não', () => {
    const futuro = new Date('2026-11-20T00:00:00Z');
    const passado = new Date('2026-10-01T00:00:00Z');
    const ok = (a: Atribuicao) => podeAplicarPacote([a], HOTEL, AGORA).permitido;
    expect(ok(atr('admin_grupo', { tipo: 'grupo' }))).toBe(true);
    expect(ok(atr('implantador', { tipo: 'hotel', hotelId: 'h1' }, futuro))).toBe(true);
    expect(ok(atr('implantador', { tipo: 'hotel', hotelId: 'h2' }, futuro))).toBe(false);
    expect(ok(atr('implantador', { tipo: 'hotel', hotelId: 'h1' }, passado))).toBe(false);
    const r = podeAplicarPacote(
      [atr('gerente_hotel', { tipo: 'hotel', hotelId: 'h1' })],
      HOTEL,
      AGORA,
    );
    expect(r.permitido ? null : r.erro.codigo).toBe('pacote_fora_do_escopo');
  });
});

describe('validarPlanoPadrao', () => {
  const base = {
    nome: '  Limpeza   de filtros ',
    intervalo: 1,
    unidade: 'mes',
    bandeiraId: 'bx',
    categoriaId: 'cat',
  };
  it('normaliza o nome e confere a periodicidade', () => {
    expect(validarPlanoPadrao(base, null)).toEqual({
      nome: 'Limpeza de filtros',
      intervalo: 1,
      unidade: 'mes',
    });
    expect(codigo(() => validarPlanoPadrao({ ...base, intervalo: 0 }, null))).toBe(
      'periodicidade_invalida',
    );
    expect(codigo(() => validarPlanoPadrao({ ...base, nome: ' ' }, null))).toBe(
      'plano_nome_invalido',
    );
  });
  it('o checklist é ativo, da categoria (ou de nenhuma) e vai para os mesmos hotéis', () => {
    const ok = (c: { ativa: boolean; categoriaId: string | null; bandeiraId: string | null }) =>
      codigo(() => validarPlanoPadrao(base, c));
    expect(ok({ ativa: true, categoriaId: 'cat', bandeiraId: 'bx' })).toBeUndefined();
    expect(ok({ ativa: true, categoriaId: null, bandeiraId: null })).toBeUndefined();
    expect(ok({ ativa: false, categoriaId: 'cat', bandeiraId: null })).toBe(
      'plano_checklist_invalido',
    );
    expect(ok({ ativa: true, categoriaId: 'outra', bandeiraId: null })).toBe(
      'plano_checklist_invalido',
    );
    expect(ok({ ativa: true, categoriaId: 'cat', bandeiraId: 'by' })).toBe(
      'plano_checklist_invalido',
    );
    // O plano do grupo só usa checklist do grupo.
    expect(
      codigo(() =>
        validarPlanoPadrao(
          { ...base, bandeiraId: null },
          { ativa: true, categoriaId: null, bandeiraId: 'bx' },
        ),
      ),
    ).toBe('plano_checklist_invalido');
  });
});

describe('copiasDoPacote', () => {
  it('copia os ativos que valem para o hotel e ainda não foram copiados, pausados e sem responsável', () => {
    const padroes = [
      plano({ id: 'p3', nome: 'Revisão anual', bandeiraId: null, checklistModeloId: 'ck' }),
      plano({ id: 'p1', nome: 'Limpeza', bandeiraId: 'bx' }),
      plano({ id: 'p2', nome: 'Da outra bandeira', bandeiraId: 'by' }),
      plano({ id: 'p4', nome: 'Desativado', ativa: false }),
      plano({ id: 'p5', nome: 'Já copiado' }),
    ];
    expect(copiasDoPacote(padroes, HOTEL, new Set(['p5']), '2026-10-20')).toEqual([
      {
        planoPadraoId: 'p1',
        categoriaId: 'cat',
        nome: 'Limpeza',
        intervalo: 1,
        unidade: 'mes',
        checklistModeloId: null,
        inicio: '2026-10-20',
        situacao: 'pausado',
        tecnicoId: null,
        equipeId: null,
      },
      expect.objectContaining({
        planoPadraoId: 'p3',
        checklistModeloId: 'ck',
        situacao: 'pausado',
      }),
    ]);
  });
  it('reaplicar com tudo copiado não copia nada', () => {
    expect(
      copiasDoPacote([plano({ id: 'p1', nome: 'A' })], HOTEL, new Set(['p1']), '2026-10-20'),
    ).toEqual([]);
  });
});
