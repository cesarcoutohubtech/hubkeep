// O motor no Node, sem React: é o mesmo caminho do worker (e-mail, push).
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
    for (const chave of Object.keys(mensagensDe(PSEUDO_IDIOMA))) {
      const valores = { nome: 'N', tenant: 'T', minimo: 8, status: 'ativo', email: 'e', n: 2 };
      const texto = t.intl.formatMessage(
        { id: chave },
        { ...valores, b: (p: string[]) => p.join('') },
      );
      expect(String(texto)).toMatch(/^\[.*\]$/s);
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
