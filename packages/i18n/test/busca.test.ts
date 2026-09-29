import { describe, expect, it } from 'vitest';
import { TAMANHO_MINIMO_DA_BUSCA, textoDeBusca } from '../src/index';

// O mesmo par do translate() da migração 0019, que preencheu a coluna dos
// registros que já existiam: a função tem de dar o mesmo resultado.
const COM_ACENTO = 'ÁÀÂÃÄÅáàâãäåÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñÝýÿ';
const SEM_ACENTO = 'AAAAAAaaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNnYyy';

describe('textoDeBusca', () => {
  it('tira acento e passa para minúsculas', () => {
    expect(textoDeBusca('Açúcar')).toBe('acucar');
    expect(textoDeBusca('Refrigerador ÁGUA Gelada')).toBe('refrigerador agua gelada');
    expect(textoDeBusca('Cœur, Straße, Øre')).toBe('coeur, strasse, ore');
  });

  it('reduz espaços e apara as pontas', () => {
    expect(textoDeBusca('  Sala   de\tmáquinas ')).toBe('sala de maquinas');
  });

  it('dá o mesmo resultado do translate() da migração 0019', () => {
    expect(textoDeBusca(COM_ACENTO)).toBe(SEM_ACENTO.toLowerCase());
  });

  it('o termo mínimo é de 3 caracteres (um trigrama)', () => {
    expect(TAMANHO_MINIMO_DA_BUSCA).toBe(3);
  });
});
