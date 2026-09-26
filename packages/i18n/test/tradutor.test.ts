// O motor no Node, sem React: é o mesmo caminho do worker (e-mail, push).
import { type MessageFormatElement, TYPE, parse } from '@formatjs/icu-messageformat-parser';
import { describe, expect, it } from 'vitest';
import {
  CATALOGOS,
  EXPANSAO_PSEUDO,
  IDIOMAS,
  PSEUDO_IDIOMA,
  QUEDA_DE_TRADUCAO,
  criarFormatador,
  criarTradutor,
  mensagensDe,
  mesclarPelaQueda,
  pseudoMensagem,
} from '../src/index';

describe('tradutor (worker, Node)', () => {
  it.each([
    ['pt-BR', 'Use ao menos 8 caracteres.'],
    ['en', 'Use at least 8 characters.'],
    ['es', 'Usa al menos 8 caracteres.'],
    ['fr', 'Utilisez au moins 8 caractères.'],
  ] as const)('%s: plural com número', (idioma, esperado) => {
    expect(criarTradutor(idioma).t('senha.erro.curta', { minimo: 8 })).toBe(esperado);
  });

  it('plural no singular e select de status', () => {
    const t = criarTradutor('pt-BR').t;
    expect(t('senha.erro.curta', { minimo: 1 })).toBe('Use ao menos 1 caractere.');
    expect(t('hotel.status', { status: 'em_implantacao' })).toBe('em implantação');
    expect(t('hotel.status', { status: 'novo_status' })).toBe('novo_status');
  });

  it('variável faltando é erro, não texto quebrado na tela', () => {
    expect(() => criarTradutor('pt-BR').t('email.convite.saudacao')).toThrow();
  });

  it('queda por idioma: es → pt-BR → en; fr → en → pt-BR', () => {
    const catalogos = {
      'pt-BR': { a: 'pt-a', b: 'pt-b', c: 'pt-c' },
      en: { a: 'en-a', b: 'en-b', c: 'en-c' },
      es: { a: 'es-a' },
      fr: { a: 'fr-a' },
    };
    expect(mesclarPelaQueda(QUEDA_DE_TRADUCAO.es, catalogos)).toEqual({
      a: 'es-a',
      b: 'pt-b',
      c: 'pt-c',
    });
    expect(mesclarPelaQueda(QUEDA_DE_TRADUCAO.fr, catalogos)).toEqual({
      a: 'fr-a',
      b: 'en-b',
      c: 'en-c',
    });
    // Sem pt-BR, o espanhol cai para o inglês.
    expect(mesclarPelaQueda(QUEDA_DE_TRADUCAO.es, { ...catalogos, 'pt-BR': {} }).b).toBe('en-b');
    expect(QUEDA_DE_TRADUCAO.en).toEqual(['en', 'pt-BR']);
  });

  it('com a queda, todo idioma tem texto para toda chave', () => {
    for (const idioma of IDIOMAS) {
      const mensagens = mensagensDe(idioma);
      expect(Object.keys(mensagens).sort()).toEqual(Object.keys(CATALOGOS['pt-BR']).sort());
    }
  });
});

describe('pseudo-idioma', () => {
  it('acentua, alonga ~35%, marca com colchetes e mantém variáveis e plural', () => {
    const fonte = CATALOGOS['pt-BR']['senha.erro.curta'] ?? '';
    const pseudo = pseudoMensagem(fonte);
    expect(pseudo.startsWith('[')).toBe(true);
    expect(pseudo.endsWith(']')).toBe(true);
    const t = criarTradutor(PSEUDO_IDIOMA).t;
    const texto = t('senha.erro.curta', { minimo: 8 });
    const original = criarTradutor('pt-BR').t('senha.erro.curta', { minimo: 8 });
    expect(texto.length).toBeGreaterThanOrEqual(original.length * (1 + EXPANSAO_PSEUDO));
    expect(texto).toMatch(/^\[Üšé áö ɱéñöš 8 çáŕáçţéŕéš\. ·+\]$/);
  });

  it('toda chave formata no pseudo-idioma', () => {
    const t = criarTradutor(PSEUDO_IDIOMA);
    const fonte = CATALOGOS['pt-BR'];
    for (const chave of Object.keys(mensagensDe(PSEUDO_IDIOMA))) {
      // Valores de teste para as variáveis da mensagem, lidas pelo parser.
      const valores: Record<string, string | number | ((p: string[]) => string)> = {};
      const visitar = (els: MessageFormatElement[]) => {
        for (const el of els) {
          if (el.type === TYPE.argument) valores[el.value] = 'x';
          if (el.type === TYPE.number || el.type === TYPE.plural) valores[el.value] = 2;
          if (el.type === TYPE.select) valores[el.value] = 'outro';
          if (el.type === TYPE.tag) valores[el.value] = (p: string[]) => p.join('');
          if (el.type === TYPE.plural || el.type === TYPE.select) {
            for (const op of Object.values(el.options)) visitar(op.value);
          }
          if (el.type === TYPE.tag) visitar(el.children);
        }
      };
      visitar(parse(fonte[chave] ?? ''));
      const texto = t.intl.formatMessage({ id: chave }, valores);
      expect(String(texto), chave).toMatch(/^\[.*\]$/s);
    }
  });
});

describe('formatação por formato regional e fuso', () => {
  const instante = new Date('2026-09-26T02:30:00Z');

  it('data no fuso de quem vê', () => {
    const sp = criarFormatador({ formatoRegional: 'pt-BR', fuso: 'America/Sao_Paulo' });
    expect(sp.data(instante)).toBe('25/09/2026');
    const paris = criarFormatador({ formatoRegional: 'fr-FR', fuso: 'Europe/Paris' });
    expect(paris.data(instante)).toBe('26/09/2026');
    const eua = criarFormatador({ formatoRegional: 'en-US', fuso: 'America/New_York' });
    expect(eua.data(instante)).toBe('9/25/26');
  });

  it('número e moeda', () => {
    const br = criarFormatador({ formatoRegional: 'pt-BR', fuso: 'America/Sao_Paulo' });
    expect(br.numero(1234.5)).toBe('1.234,5');
    expect(br.moeda(1234.5, 'BRL').replace(/\s/g, ' ')).toBe('R$ 1.234,50');
    const us = criarFormatador({ formatoRegional: 'en-US', fuso: 'UTC' });
    expect(us.moeda(1234.5, 'USD')).toBe('$1,234.50');
  });
});
