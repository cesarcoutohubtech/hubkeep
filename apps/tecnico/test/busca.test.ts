import { describe, expect, it } from 'vitest';
import { filtrarPorBusca } from '../src/busca';

const ativo = (
  nome: string,
  extra: Partial<Record<'fabricante' | 'modelo' | 'numeroSerie', string>> = {},
) => ({
  nome,
  fabricante: extra.fabricante ?? null,
  modelo: extra.modelo ?? null,
  numeroSerie: extra.numeroSerie ?? null,
});

describe('filtrarPorBusca (B6)', () => {
  const ativos = [
    ativo('Refrigerador do Açúcar', { fabricante: 'Cônsul' }),
    ativo('Ar da 102', { numeroSerie: 'SN-77' }),
  ];

  it('acha por trecho e sem acento, em nome, fabricante e série', () => {
    expect(filtrarPorBusca(ativos, 'acucar').map((a) => a.nome)).toEqual([
      'Refrigerador do Açúcar',
    ]);
    expect(filtrarPorBusca(ativos, 'FRIG').map((a) => a.nome)).toEqual(['Refrigerador do Açúcar']);
    expect(filtrarPorBusca(ativos, 'consul')).toHaveLength(1);
    expect(filtrarPorBusca(ativos, 'sn-7').map((a) => a.nome)).toEqual(['Ar da 102']);
    expect(filtrarPorBusca(ativos, 'geladeira')).toEqual([]);
  });

  it('abaixo de 3 caracteres, a lista inteira', () => {
    expect(filtrarPorBusca(ativos, 'ar')).toHaveLength(2);
    expect(filtrarPorBusca(ativos, '  ')).toHaveLength(2);
  });
});
