// Sinal de Repair vs Replace. Caso da seção 37 do PRD: 8 falhas, muita parada,
// custo de 12 meses alto, idade alta e impacto no hóspede alto → avaliar
// substituição, com os critérios como justificativa. Nunca decide sozinho.
import { describe, expect, it } from 'vitest';
import { type EntradaSubstituicao, sinalDeSubstituicao } from '../src';

const caso: EntradaSubstituicao = {
  corretivas12m: 8,
  horasParadas12m: 46,
  idadeAnos: 11,
  custo12m: 18_200,
  custoReposicao: 31_000,
  impactoHospede: 82,
  criticidade: null,
  reincidencia: 77,
  garantiaVigente: false,
};

describe('repair vs replace', () => {
  it('PRD 37: avaliar substituição, com a justificativa por critério', () => {
    const s = sinalDeSubstituicao(caso);
    expect(s.sinal).toBe('avaliar_substituicao');
    expect(s.atingidos).toBe(6);
    expect(s.criterios.map((c) => [c.chave, c.atingido])).toEqual([
      ['corretivas12m', true],
      ['horasParadas12m', true],
      ['idadeAnos', true],
      ['custoSobreReposicao', true],
      ['impactoHospede', true],
      ['criticidade', null],
      ['reincidencia', true],
    ]);
    expect(s.criterios.find((c) => c.chave === 'custoSobreReposicao')).toMatchObject({
      valor: 0.587,
      limite: 0.5,
    });
  });

  it('na garantia, os mesmos critérios pedem revisão antes', () => {
    expect(sinalDeSubstituicao({ ...caso, garantiaVigente: true }).sinal).toBe(
      'revisao_necessaria',
    );
  });

  it('dois critérios: observar; menos: sem sinal', () => {
    const pouco: EntradaSubstituicao = {
      corretivas12m: 7,
      horasParadas12m: 50,
      idadeAnos: 2,
      custo12m: null,
      custoReposicao: null,
      impactoHospede: null,
      criticidade: null,
      reincidencia: 20,
      garantiaVigente: null,
    };
    expect(sinalDeSubstituicao(pouco).sinal).toBe('observar');
    expect(sinalDeSubstituicao({ ...pouco, horasParadas12m: 1 }).sinal).toBe('sem_sinal');
  });

  it('sem o valor de reposição, o critério de custo fica sem avaliar', () => {
    const s = sinalDeSubstituicao({ ...caso, custoReposicao: null });
    expect(s.criterios.find((c) => c.chave === 'custoSobreReposicao')?.atingido).toBeNull();
    expect(s.atingidos).toBe(5);
  });
});
