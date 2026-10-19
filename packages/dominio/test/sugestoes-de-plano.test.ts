// Sugestões de plano (M1, caminho C): entra o ativo ativo, com modelo, sem
// descarte e sem plano que o cubra; o plano de um clique precisa da
// periodicidade do modelo e leva o nome do ativo.
import { describe, expect, it } from 'vitest';
import {
  ativoSemPlanoComModelo,
  exigirPeriodicidadeSugerida,
  nomeDoPlanoSugerido,
} from '../src/index';

const ATIVO = {
  id: 'a1',
  categoriaId: 'cat-ar',
  modeloId: 'm-ar',
  ativo: true,
  sugestaoDescartada: false,
  cadastroPendente: false,
};

describe('sugestões de plano (M1)', () => {
  it('ativo com modelo e sem plano entra', () => {
    expect(ativoSemPlanoComModelo(ATIVO, [])).toBe(true);
  });

  it('sem modelo, desativado, descartado ou com o cadastro pendente não entra', () => {
    expect(ativoSemPlanoComModelo({ ...ATIVO, cadastroPendente: true }, [])).toBe(false);
    expect(ativoSemPlanoComModelo({ ...ATIVO, modeloId: null }, [])).toBe(false);
    expect(ativoSemPlanoComModelo({ ...ATIVO, ativo: false }, [])).toBe(false);
    expect(ativoSemPlanoComModelo({ ...ATIVO, sugestaoDescartada: true }, [])).toBe(false);
  });

  it('plano que cobre tira; plano encerrado ou de outro ativo não', () => {
    expect(
      ativoSemPlanoComModelo(ATIVO, [
        { ativoId: null, categoriaId: 'cat-ar', situacao: 'pausado' },
      ]),
    ).toBe(false);
    expect(
      ativoSemPlanoComModelo(ATIVO, [{ ativoId: 'a1', categoriaId: null, situacao: 'ativo' }]),
    ).toBe(false);
    expect(
      ativoSemPlanoComModelo(ATIVO, [
        { ativoId: 'a2', categoriaId: null, situacao: 'ativo' },
        { ativoId: 'a1', categoriaId: null, situacao: 'encerrado' },
      ]),
    ).toBe(true);
  });

  it('o plano de um clique precisa da periodicidade e leva o nome do ativo', () => {
    expect(() => exigirPeriodicidadeSugerida(null)).toThrow(
      expect.objectContaining({ codigo: 'sugestao_sem_periodicidade' }),
    );
    expect(exigirPeriodicidadeSugerida({ intervalo: 3, unidade: 'mes' })).toEqual({
      intervalo: 3,
      unidade: 'mes',
    });
    expect(nomeDoPlanoSugerido('  Split UH 101 ')).toBe('Split UH 101');
    expect(nomeDoPlanoSugerido('x'.repeat(130))).toHaveLength(120);
  });
});
