// Contraste dos tokens do HubKeep (ADR-038, U1): todo par de texto e fundo
// usado pelos componentes chega a AA do WCAG 2.x nos dois temas, 4,5:1 para
// texto e 3:1 para o contorno de foco. Mudar um token que derrube um par
// reprova aqui. O fundo com transparência (os "suaves" dos selos) é composto
// sobre a superfície do mesmo tema, como aparece na tela.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const CSS = readFileSync('packages/ui/src/tokens.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

function bloco(seletor: string): Map<string, string> {
  const inicio = CSS.indexOf(`${seletor} {`);
  if (inicio < 0) throw new Error(`Bloco ausente: ${seletor}`);
  const corpo = CSS.slice(inicio, CSS.indexOf('}', inicio));
  return new Map(
    [...corpo.matchAll(/(--hk-[a-z0-9-]+):\s*([^;]+);/g)].map((m) => [
      m[1] ?? '',
      (m[2] ?? '').trim(),
    ]),
  );
}

const ESCURO = bloco(':root');
// O claro sobrepõe o escuro: token ausente no bloco claro herda o do escuro.
const CLARO = new Map([...ESCURO, ...bloco(":root[data-tema='claro']")]);

type Rgb = [number, number, number];

function rgba(valor: string): { cor: Rgb; alfa: number } {
  const hex = /^#([0-9a-f]{6})$/i.exec(valor);
  if (hex?.[1]) {
    const h = hex[1];
    return { cor: [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as Rgb, alfa: 1 };
  }
  const r = /^rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)$/.exec(valor);
  if (r) return { cor: [Number(r[1]), Number(r[2]), Number(r[3])], alfa: Number(r[4]) };
  throw new Error(`Cor fora do formato esperado: ${valor}`);
}

function opaca(tokens: Map<string, string>, nome: string): Rgb {
  const valor = tokens.get(nome);
  if (!valor) throw new Error(`Token ausente: ${nome}`);
  const { cor, alfa } = rgba(valor);
  if (alfa === 1) return cor;
  const base = opaca(tokens, '--hk-superficie');
  return cor.map((c, i) => Math.round(c * alfa + (base[i] ?? 0) * (1 - alfa))) as Rgb;
}

const luminancia = (c: Rgb) => {
  const [r, g, b] = c.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as Rgb;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

function razao(a: Rgb, b: Rgb): number {
  const [claro, escuro] = [luminancia(a), luminancia(b)].sort((x, y) => y - x) as [number, number];
  return (claro + 0.05) / (escuro + 0.05);
}

const TEXTO = 4.5;
const CONTORNO = 3;
const FUNDOS_GERAIS = ['--hk-fundo', '--hk-superficie', '--hk-superficie-2'];

// [token da frente, fundos em que ele aparece, mínimo]
const PARES: [string, string[], number][] = [
  ['--hk-texto', [...FUNDOS_GERAIS, '--hk-superficie-3'], TEXTO],
  ['--hk-titulo', FUNDOS_GERAIS, TEXTO],
  ['--hk-texto-suave', [...FUNDOS_GERAIS, '--hk-escopo-fundo'], TEXTO],
  ['--hk-texto-apagado', FUNDOS_GERAIS, TEXTO],
  ['--hk-azul', FUNDOS_GERAIS, TEXTO],
  ['--hk-perigo', FUNDOS_GERAIS, TEXTO],
  ['--hk-ambar-texto', FUNDOS_GERAIS, TEXTO],
  ['--hk-prio-critica', ['--hk-superficie', '--hk-superficie-2'], TEXTO],
  ['--hk-prio-alta', ['--hk-superficie', '--hk-superficie-2'], TEXTO],
  ['--hk-prio-media', ['--hk-superficie', '--hk-superficie-2'], TEXTO],
  ['--hk-prio-baixa', ['--hk-superficie', '--hk-superficie-2'], TEXTO],
  ['--hk-botao-primario-texto', ['--hk-botao-primario-fundo'], TEXTO],
  ['--hk-botao-ambar-texto', ['--hk-ambar'], TEXTO],
  ['--hk-selo-cinza', ['--hk-tinta-2'], TEXTO],
  ['--hk-selo-azul', ['--hk-azul-suave'], TEXTO],
  ['--hk-selo-ambar', ['--hk-ambar-suave'], TEXTO],
  ['--hk-selo-vermelho', ['--hk-vermelho-suave'], TEXTO],
  ['--hk-selo-verde', ['--hk-verde-suave'], TEXTO],
  ['--hk-titulo', ['--hk-barra-fundo'], TEXTO],
  ['--hk-menu-texto', ['--hk-menu-fundo'], TEXTO],
  ['--hk-menu-texto-ativo', ['--hk-menu-fundo'], TEXTO],
  ['--hk-menu-grupo', ['--hk-menu-fundo'], TEXTO],
  ['--hk-foco', FUNDOS_GERAIS, CONTORNO],
];

describe.each([
  ['escuro', ESCURO],
  ['claro', CLARO],
])('contraste do tema %s (AA)', (_tema, tokens) => {
  it.each(PARES)('%s', (frente, fundos, minimo) => {
    const abaixo = fundos
      .map((f) => [f, razao(opaca(tokens, frente), opaca(tokens, f))] as const)
      .filter(([, r]) => r < minimo)
      .map(([f, r]) => `${f}: ${r.toFixed(2)}`);
    expect(abaixo).toEqual([]);
  });
});

describe('tokens nos dois temas', () => {
  it('o claro redefine só tokens que existem no escuro', () => {
    const soNoClaro = [...bloco(":root[data-tema='claro']").keys()].filter((k) => !ESCURO.has(k));
    expect(soNoClaro).toEqual([]);
  });

  it('nenhuma fonte é pedida a um servidor de fora (ADR-038)', () => {
    const estilo = ['fontes.css', 'estilo.css', 'tokens.css', 'componentes.css']
      .map((f) => readFileSync(`packages/ui/src/${f}`, 'utf8'))
      .join('\n');
    expect(estilo).not.toMatch(/fonts\.googleapis|fonts\.gstatic|https?:\/\//);
  });
});

// Os componentes (U2) usam só os tokens: o tema claro muda os tokens, não as
// regras. Cada tom, nível e variante que o código oferece tem regra no CSS.
describe('estilo dos componentes', () => {
  const COMPONENTES = readFileSync('packages/ui/src/componentes.css', 'utf8').replace(
    /\/\*[\s\S]*?\*\//g,
    '',
  );

  it('toda cor vem de um token', () => {
    expect(COMPONENTES).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(/i);
  });

  it('todo token usado existe', () => {
    const usados = new Set([...COMPONENTES.matchAll(/var\((--hk-[a-z0-9-]+)\)/g)].map((m) => m[1]));
    expect([...usados].filter((t) => t && !ESCURO.has(t))).toEqual([]);
  });

  it('toda classe tem o prefixo hk-', () => {
    const classes = [...COMPONENTES.matchAll(/\.([a-z][a-z0-9-]*)/gi)].map((m) => m[1]);
    expect(classes.filter((c) => !c?.startsWith('hk-'))).toEqual([]);
  });

  // [arquivo, constante, seletor, valor que vive sem regra própria]
  const LISTAS: [string, string, string, string?][] = [
    ['selos.tsx', 'TONS_DE_SELO', ".hk-selo[data-tom='%']"],
    ['selos.tsx', 'NIVEIS_DE_PRIORIDADE', ".hk-prioridade[data-nivel='%']"],
    ['botao.tsx', 'VARIANTES_DE_BOTAO', ".hk-botao[data-variante='%']", 'padrao'],
    ['painel.tsx', 'TONS_DE_INDICADOR', ".hk-indicador[data-tom='%']", 'neutro'],
    ['mensagens.tsx', 'TONS_DE_NOTA', ".hk-nota[data-tom='%']", 'info'],
  ];

  it.each(LISTAS)('%s: %s', (arquivo, constante, seletor, padrao) => {
    const fonte = readFileSync(`packages/ui/src/${arquivo}`, 'utf8');
    const lista = new RegExp(String.raw`${constante} = \[([^\]]+)\]`).exec(fonte)?.[1] ?? '';
    const valores = [...lista.matchAll(/'([a-z]+)'/g)].map((m) => m[1] ?? '');
    expect(valores.length).toBeGreaterThan(1);
    const semRegra = valores
      .filter((v) => v !== padrao)
      .filter((v) => !COMPONENTES.includes(seletor.replace('%', v)));
    expect(semRegra).toEqual([]);
  });
});
