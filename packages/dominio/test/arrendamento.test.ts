// Arrendado mínimo (1c; decisões 5 a 8 do Cesar, de 13/10/2026): quem
// responde pela OS no hotel arrendado, pela categoria do chamado.
import { describe, expect, it } from 'vitest';
import {
  LIMITE_DA_MATRIZ,
  MODELOS_CONTRATUAIS,
  matrizDeArrendamentoValida,
  responsavelDoArrendamento,
} from '../src';

const AR = '01900000-0000-7000-8000-0000000000a1';
const ELETRICA = '01900000-0000-7000-8000-0000000000a2';
const SEM_REGRA = '01900000-0000-7000-8000-0000000000a3';
const MATRIZ = { [AR]: 'locador', [ELETRICA]: 'arrendataria' } as const;

describe('responsavelDoArrendamento', () => {
  it('no hotel arrendado, a regra da categoria do chamado', () => {
    expect(responsavelDoArrendamento('arrendado', MATRIZ, AR)).toBe('locador');
    expect(responsavelDoArrendamento('arrendado', MATRIZ, ELETRICA)).toBe('arrendataria');
  });

  it('a categoria sem regra e o chamado sem categoria ficam com a arrendatária (decisão 7)', () => {
    expect(responsavelDoArrendamento('arrendado', MATRIZ, SEM_REGRA)).toBe('arrendataria');
    expect(responsavelDoArrendamento('arrendado', MATRIZ, null)).toBe('arrendataria');
    expect(responsavelDoArrendamento('arrendado', {}, AR)).toBe('arrendataria');
    // Chave herdada do protótipo não é regra.
    expect(responsavelDoArrendamento('arrendado', MATRIZ, 'constructor')).toBe('arrendataria');
  });

  it('fora do hotel arrendado, e com o modelo não informado, a OS não tem responsável', () => {
    for (const modelo of MODELOS_CONTRATUAIS.filter((m) => m !== 'arrendado')) {
      expect(responsavelDoArrendamento(modelo, MATRIZ, AR)).toBeNull();
    }
    expect(responsavelDoArrendamento(null, MATRIZ, AR)).toBeNull();
  });
});

describe('matrizDeArrendamentoValida', () => {
  it('por categoria (id), a arrendatária ou o locador, até o limite', () => {
    expect(matrizDeArrendamentoValida({})).toBe(true);
    expect(matrizDeArrendamentoValida(MATRIZ)).toBe(true);
    const cheia = (n: number) =>
      Object.fromEntries(
        Array.from({ length: n }, (_, i) => [
          `01900000-0000-7000-8000-${String(i).padStart(12, '0')}`,
          'locador',
        ]),
      );
    expect(matrizDeArrendamentoValida(cheia(LIMITE_DA_MATRIZ))).toBe(true);
    expect(matrizDeArrendamentoValida(cheia(LIMITE_DA_MATRIZ + 1))).toBe(false);
  });

  it('recusa categoria fora do formato, responsável desconhecido e o que não é objeto', () => {
    expect(matrizDeArrendamentoValida({ ar: 'locador' })).toBe(false);
    expect(matrizDeArrendamentoValida({ [AR]: 'proprietario' })).toBe(false);
    expect(matrizDeArrendamentoValida({ [AR]: null })).toBe(false);
    expect(matrizDeArrendamentoValida([])).toBe(false);
    expect(matrizDeArrendamentoValida(null)).toBe(false);
    expect(matrizDeArrendamentoValida('locador')).toBe(false);
  });
});
