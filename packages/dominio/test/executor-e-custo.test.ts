// Quem executa a OS, custo informado, impacto no hóspede e origem do chamado
// (I4). As tabelas esperadas são escritas à mão.
import { describe, expect, it } from 'vitest';
import {
  type Atribuicao,
  CUSTO_MAXIMO,
  ESTADOS_DA_OS,
  ESTADOS_DO_CHAMADO,
  EXECUCAO_PADRAO,
  EXECUTORES_DA_OS,
  ORIGEM_PADRAO_DO_CHAMADO,
  ORIGENS_DO_CHAMADO,
  PAPEIS,
  type Papel,
  decidirQuemExecuta,
  ehExecutorDaOs,
  normalizarCustoInformado,
  podeAjustarQuemExecuta,
  podeInformarImpacto,
} from '../src';

const agora = new Date('2026-10-09T12:00:00Z');
const codigo = (f: () => unknown): string | null => {
  try {
    f();
    return null;
  } catch (e) {
    return (e as { codigo: string }).codigo;
  }
};

describe('valores canônicos', () => {
  it('origem do chamado: só interno, que é o padrão', () => {
    expect([...ORIGENS_DO_CHAMADO]).toEqual(['interno']);
    expect(ORIGEM_PADRAO_DO_CHAMADO).toBe('interno');
  });

  it('quem executa: equipe interna ou fornecedor', () => {
    expect([...EXECUTORES_DA_OS]).toEqual(['equipe_interna', 'fornecedor']);
    expect(ehExecutorDaOs('fornecedor')).toBe(true);
    expect(ehExecutorDaOs('terceiro')).toBe(false);
    expect(ehExecutorDaOs(null)).toBe(false);
  });
});

describe('quem executa a OS', () => {
  it('equipe interna, sem fornecedor', () => {
    expect(decidirQuemExecuta({ executadoPor: 'equipe_interna' }, null)).toEqual(EXECUCAO_PADRAO);
    expect(
      decidirQuemExecuta({ executadoPor: 'equipe_interna', fornecedorId: null }, null),
    ).toEqual({ executadoPor: 'equipe_interna', fornecedorId: null });
  });

  it('equipe interna com fornecedor é recusada', () => {
    expect(
      codigo(() =>
        decidirQuemExecuta({ executadoPor: 'equipe_interna', fornecedorId: 'f1' }, null),
      ),
    ).toBe('os_fornecedor_indevido');
  });

  it('fornecedor ativo do grupo', () => {
    expect(
      decidirQuemExecuta({ executadoPor: 'fornecedor', fornecedorId: 'f1' }, { ativo: true }),
    ).toEqual({ executadoPor: 'fornecedor', fornecedorId: 'f1' });
  });

  it('fornecedor exige o id, que precisa existir e estar ativo', () => {
    expect(codigo(() => decidirQuemExecuta({ executadoPor: 'fornecedor' }, null))).toBe(
      'os_fornecedor_obrigatorio',
    );
    expect(
      codigo(() => decidirQuemExecuta({ executadoPor: 'fornecedor', fornecedorId: 'f1' }, null)),
    ).toBe('fornecedor_nao_encontrado');
    expect(
      codigo(() =>
        decidirQuemExecuta({ executadoPor: 'fornecedor', fornecedorId: 'f1' }, { ativo: false }),
      ),
    ).toBe('os_fornecedor_desativado');
  });
});

describe('custo informado', () => {
  it('opcional', () => {
    expect(normalizarCustoInformado(null)).toBeNull();
    expect(normalizarCustoInformado(undefined)).toBeNull();
  });

  it('aceita zero, centavos e o teto da coluna', () => {
    expect(normalizarCustoInformado(0)).toBe(0);
    expect(normalizarCustoInformado(150.5)).toBe(150.5);
    expect(normalizarCustoInformado(0.1 + 0.2)).toBe(0.3);
    expect(normalizarCustoInformado(CUSTO_MAXIMO)).toBe(CUSTO_MAXIMO);
  });

  it('recusa negativo, mais de dois decimais, acima do teto e não finito', () => {
    for (const v of [-0.01, 1.005, CUSTO_MAXIMO + 0.01, Number.NaN, Number.POSITIVE_INFINITY])
      expect(codigo(() => normalizarCustoInformado(v))).toBe('os_custo_invalido');
  });
});

const HOTEL = { id: 'hotel-1', bandeiraId: null };
const ator = (papel: Papel) => {
  const escopo: Atribuicao['escopo'] =
    papel === 'admin_grupo' ? { tipo: 'grupo' } : { tipo: 'hotel', hotelId: HOTEL.id };
  return {
    usuarioId: 'u',
    atribuicoes: [
      { id: 'a', usuarioId: 'u', papel, escopo, validoAte: null, revogadoEm: null },
    ] as Atribuicao[],
    equipes: [],
  };
};
const TRIA: Record<Papel, boolean> = {
  admin_grupo: true,
  gestor_csc: true,
  gerente_hotel: true,
  implantador: false,
  tecnico: false,
  solicitante: false,
  proprietario: false,
};

describe('corrigir o impacto no hóspede', () => {
  const chamado = (estado: (typeof ESTADOS_DO_CHAMADO)[number]) => ({
    hotel: HOTEL,
    estado,
    abertoPor: 'outro',
  });

  for (const papel of PAPEIS)
    it(`papel: ${papel}`, () => {
      expect(codigo(() => podeInformarImpacto(ator(papel), chamado('em_triagem'), agora))).toBe(
        TRIA[papel] ? null : 'triagem_fora_do_papel',
      );
    });

  for (const estado of ESTADOS_DO_CHAMADO)
    it(`estado do chamado: ${estado}`, () => {
      const vale = ['aberto', 'em_triagem', 'em_execucao', 'aguardando_aceite'].includes(estado);
      expect(codigo(() => podeInformarImpacto(ator('gerente_hotel'), chamado(estado), agora))).toBe(
        vale ? null : 'transicao_invalida',
      );
    });
});

describe('corrigir quem executa a OS', () => {
  const chamado = { hotel: HOTEL, estado: 'em_execucao' as const, abertoPor: 'outro' };

  for (const papel of PAPEIS)
    it(`papel: ${papel}`, () => {
      expect(codigo(() => podeAjustarQuemExecuta(ator(papel), chamado, 'atribuida', agora))).toBe(
        TRIA[papel] ? null : 'triagem_fora_do_papel',
      );
    });

  for (const estado of ESTADOS_DA_OS)
    it(`estado da OS: ${estado}`, () => {
      const vale = ['atribuida', 'em_execucao', 'pausada'].includes(estado);
      expect(codigo(() => podeAjustarQuemExecuta(ator('gestor_csc'), chamado, estado, agora))).toBe(
        vale ? null : 'transicao_invalida',
      );
    });
});
