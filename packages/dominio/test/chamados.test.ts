// Abertura do chamado (C2; ADR-026): pedido e cópia da política aplicada.
import { describe, expect, it } from 'vitest';
import {
  HORARIO_PADRAO,
  SLA_PADRAO,
  exigirAtivoDoChamado,
  exigirLocalParaChamado,
  normalizarDescricaoDoChamado,
  politicaAplicadaNaAbertura,
} from '../src';

const codigo = (f: () => unknown): string | null => {
  try {
    f();
    return null;
  } catch (e) {
    return (e as { codigo: string }).codigo;
  }
};

describe('abertura do chamado', () => {
  it('descrição: sem espaços nas pontas, quebras de linha mantidas, de 1 a 2000', () => {
    expect(normalizarDescricaoDoChamado('  Frigobar\nnão gela  ')).toBe('Frigobar\nnão gela');
    expect(normalizarDescricaoDoChamado('x'.repeat(2000))).toHaveLength(2000);
    for (const d of ['', '   \n ', 'x'.repeat(2001)])
      expect(codigo(() => normalizarDescricaoDoChamado(d))).toBe('chamado_descricao_invalida');
  });

  it('UH pendente de licença e local desativado não recebem chamado', () => {
    expect(() => exigirLocalParaChamado({ status: 'ativo' })).not.toThrow();
    expect(codigo(() => exigirLocalParaChamado({ status: 'pendente_licenca' }))).toBe(
      'chamado_uh_pendente_licenca',
    );
    expect(codigo(() => exigirLocalParaChamado({ status: 'inativo' }))).toBe(
      'chamado_local_inativo',
    );
  });

  it('o ativo precisa estar no local do chamado e ativo', () => {
    expect(() => exigirAtivoDoChamado({ localId: 'l1', desativadoEm: null }, 'l1')).not.toThrow();
    expect(codigo(() => exigirAtivoDoChamado({ localId: 'l2', desativadoEm: null }, 'l1'))).toBe(
      'chamado_ativo_fora_do_local',
    );
    expect(
      codigo(() => exigirAtivoDoChamado({ localId: 'l1', desativadoEm: new Date() }, 'l1')),
    ).toBe('chamado_ativo_desativado');
  });

  it('a cópia da política guarda a categoria, a prioridade, a origem e o SLA inteiro', () => {
    expect(
      politicaAplicadaNaAbertura({
        categoriaId: 'cat-1',
        prioridade: { prioridadeId: 'p-1', origem: 'categoria' },
        sla: SLA_PADRAO,
        horario: HORARIO_PADRAO,
      }),
    ).toEqual({
      'chamado.prioridade_padrao_por_categoria': {
        categoriaId: 'cat-1',
        prioridadeId: 'p-1',
        origem: 'categoria',
      },
      'chamado.sla': SLA_PADRAO,
      'hotel.horario_atendimento': HORARIO_PADRAO,
    });
  });
});
