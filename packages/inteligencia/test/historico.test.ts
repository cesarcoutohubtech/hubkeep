// Campos da instrumentação (fase A): o nome do terceiro comparável e o custo
// informado somado na janela, com null quando ninguém informou.
import { describe, expect, it } from 'vitest';
import { chaveDeTerceiro, custoInformadoNaJanela } from '../src';
import { agora, corretiva, dia } from './apoio';

describe('nome do terceiro', () => {
  it('compara sem caixa e sem espaço sobrando ou repetido', () => {
    expect(
      chaveDeTerceiro({ executadoPor: 'terceiro', terceiroNome: '  Refrigeração   SILVA ' }),
    ).toBe('refrigeração silva');
  });

  it('equipe interna, terceiro sem nome e OS anterior à migração não têm chave', () => {
    expect(chaveDeTerceiro({ executadoPor: 'equipe_interna', terceiroNome: 'Silva' })).toBeNull();
    expect(chaveDeTerceiro({ executadoPor: 'terceiro', terceiroNome: '  ' })).toBeNull();
    expect(chaveDeTerceiro({})).toBeNull();
  });
});

describe('custo informado na janela', () => {
  it('soma o custo das OS concluídas na janela', () => {
    const cs = [
      corretiva({ abertaEm: dia(-40), concluidaEm: dia(-38), custoInformado: 1200.5 }),
      corretiva({ abertaEm: dia(-20), concluidaEm: dia(-19), custoInformado: 300 }),
      // Fora da janela, sem conclusão e sem custo informado: não somam.
      corretiva({ abertaEm: dia(-400), concluidaEm: dia(-399), custoInformado: 9000 }),
      corretiva({ abertaEm: dia(-5), concluidaEm: null, custoInformado: 500 }),
      corretiva({ abertaEm: dia(-10), concluidaEm: dia(-9), custoInformado: null }),
    ];
    expect(custoInformadoNaJanela(cs, agora, 365)).toBe(1500.5);
  });

  it('ninguém informou custo: null, e não zero', () => {
    const cs = [corretiva({ abertaEm: dia(-10), concluidaEm: dia(-9) })];
    expect(custoInformadoNaJanela(cs, agora, 365)).toBeNull();
  });

  it('custo zero informado conta como informado', () => {
    const cs = [corretiva({ abertaEm: dia(-10), concluidaEm: dia(-9), custoInformado: 0 })];
    expect(custoInformadoNaJanela(cs, agora, 365)).toBe(0);
  });
});
