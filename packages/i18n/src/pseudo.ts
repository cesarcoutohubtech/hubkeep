// Pseudo-idioma (ADR-022): troca letras por versões acentuadas, alonga o texto
// em ~35% e marca início e fim com colchetes. Texto que aparece sem colchetes
// na tela não veio do catálogo; colchete cortado indica quebra de layout.
// Só o texto literal muda: variáveis, plural, select e tags ICU ficam intactos.
import { type MessageFormatElement, TYPE, parse } from '@formatjs/icu-messageformat-parser';
import { printAST } from '@formatjs/icu-messageformat-parser/printer.js';

const ACENTOS: Record<string, string> = {
  a: 'á',
  b: 'ƀ',
  c: 'ç',
  d: 'ď',
  e: 'é',
  f: 'ƒ',
  g: 'ĝ',
  h: 'ĥ',
  i: 'í',
  j: 'ĵ',
  k: 'ķ',
  l: 'ĺ',
  m: 'ɱ',
  n: 'ñ',
  o: 'ö',
  p: 'þ',
  q: 'ǫ',
  r: 'ŕ',
  s: 'š',
  t: 'ţ',
  u: 'ü',
  v: 'ṽ',
  w: 'ŵ',
  x: 'ẋ',
  y: 'ý',
  z: 'ž',
  A: 'Á',
  B: 'Ɓ',
  C: 'Ç',
  D: 'Ď',
  E: 'É',
  F: 'Ƒ',
  G: 'Ĝ',
  H: 'Ĥ',
  I: 'Í',
  J: 'Ĵ',
  K: 'Ķ',
  L: 'Ĺ',
  M: 'Ṁ',
  N: 'Ñ',
  O: 'Ö',
  P: 'Þ',
  Q: 'Ǫ',
  R: 'Ŕ',
  S: 'Š',
  T: 'Ţ',
  U: 'Ü',
  V: 'Ṽ',
  W: 'Ŵ',
  X: 'Ẋ',
  Y: 'Ý',
  Z: 'Ž',
};

/** Quanto o texto cresce, em fração do tamanho original. */
export const EXPANSAO_PSEUDO = 0.35;

const acentuar = (texto: string) => texto.replace(/[A-Za-z]/g, (c) => ACENTOS[c] ?? c);

function transformar(elementos: MessageFormatElement[]): MessageFormatElement[] {
  return elementos.map((el) => {
    if (el.type === TYPE.literal) return { ...el, value: acentuar(el.value) };
    if (el.type === TYPE.plural || el.type === TYPE.select) {
      const options = Object.fromEntries(
        Object.entries(el.options).map(([k, op]) => [k, { ...op, value: transformar(op.value) }]),
      );
      return { ...el, options };
    }
    if (el.type === TYPE.tag) return { ...el, children: transformar(el.children) };
    return el;
  });
}

export function pseudoMensagem(mensagem: string): string {
  const ast = transformar(parse(mensagem));
  const enchimento = '·'.repeat(Math.max(1, Math.ceil(mensagem.length * EXPANSAO_PSEUDO)));
  return `[${printAST(ast)} ${enchimento}]`;
}
