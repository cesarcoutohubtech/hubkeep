// Pipeline dos catálogos (ADR-022, aceite da F0-10b): a CI reprova mensagem
// ICU inválida, chave sem pt-BR ou en e variável que difere entre idiomas. O
// parser é o mesmo que o runtime usa (@formatjs/icu-messageformat-parser).
import { type MessageFormatElement, TYPE, parse } from '@formatjs/icu-messageformat-parser';
import { describe, expect, it } from 'vitest';
import { CATALOGOS, IDIOMAS, IDIOMA_FONTE, criarTradutor } from '../src/index';

/** Variáveis e tags de uma mensagem, em ordem alfabética. */
function variaveis(mensagem: string): string[] {
  const nomes = new Set<string>();
  const visitar = (els: MessageFormatElement[]) => {
    for (const el of els) {
      if (el.type === TYPE.literal || el.type === TYPE.pound) continue;
      nomes.add(el.type === TYPE.tag ? `<${el.value}>` : el.value);
      if (el.type === TYPE.plural || el.type === TYPE.select) {
        for (const op of Object.values(el.options)) visitar(op.value);
      }
      if (el.type === TYPE.tag) visitar(el.children);
    }
  };
  visitar(parse(mensagem));
  return [...nomes].sort();
}

const fonte = CATALOGOS[IDIOMA_FONTE];
const chavesFonte = Object.keys(fonte).sort();

describe('catálogos ICU', () => {
  it.each(IDIOMAS)('%s: toda mensagem é ICU válida', (idioma) => {
    const invalidas: string[] = [];
    for (const [chave, texto] of Object.entries(CATALOGOS[idioma])) {
      try {
        parse(texto ?? '');
      } catch (e) {
        invalidas.push(`${chave}: ${(e as Error).message}`);
      }
    }
    expect(invalidas).toEqual([]);
  });

  it('en tem todas as chaves de pt-BR (obrigatório)', () => {
    expect(Object.keys(CATALOGOS.en).sort()).toEqual(chavesFonte);
  });

  it.each(IDIOMAS)('%s: nenhuma chave fora do idioma-fonte', (idioma) => {
    const extras = Object.keys(CATALOGOS[idioma]).filter((c) => !(c in fonte));
    expect(extras).toEqual([]);
  });

  it.each(IDIOMAS.filter((i) => i !== IDIOMA_FONTE))(
    '%s: mesmas variáveis e tags que pt-BR em cada chave',
    (idioma) => {
      const divergentes: string[] = [];
      for (const [chave, texto] of Object.entries(CATALOGOS[idioma])) {
        const esperado = variaveis(fonte[chave] ?? '');
        const obtido = variaveis(texto ?? '');
        if (esperado.join(',') !== obtido.join(',')) {
          divergentes.push(`${chave}: [${obtido}] ≠ pt-BR [${esperado}]`);
        }
      }
      expect(divergentes).toEqual([]);
    },
  );

  it('controle: o teste de ICU enxerga mensagem quebrada e variável trocada', () => {
    expect(() => parse('Olá, {nome')).toThrow();
    expect(variaveis('Olá, {nome}.')).not.toEqual(variaveis('Hello, {name}.'));
  });

  it('apóstrofo ASCII em inglês não some (o ICU só o trata antes de { } # |)', () => {
    expect(criarTradutor('en').t('erro.sem_permissao')).toBe(
      "You don't have permission for this action.",
    );
  });
});
