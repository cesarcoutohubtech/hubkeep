// Telas do PWA nos quatro idiomas e no pseudo-idioma, pelo catálogo (ADR-022).
// Renderiza com react-dom/server; o Supabase não é tocado na renderização.
import { IDIOMAS, type IdiomaDeExibicao, PSEUDO_IDIOMA, mensagensDe } from '@hubkeep/i18n';
import type { ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ProvedorDeIdioma, aplicarIdiomaNaPagina } from '../src/i18n';
import { FilaDoDia } from '../src/telas/FilaDoDia';
import { Login } from '../src/telas/Login';

// O React escapa o apóstrofo ("Today's") como &#x27;.
const renderizar = (idioma: IdiomaDeExibicao, tela: ReactNode) =>
  renderToString(<ProvedorDeIdioma idioma={idioma}>{tela}</ProvedorDeIdioma>).replaceAll(
    '&#x27;',
    "'",
  );

const fila = (
  online: boolean,
  pendentes: number,
  rejeitadas: { chave: string; tipo: 'preferencias.gravar'; codigo: string }[] = [],
) => (
  <FilaDoDia
    idioma="pt-BR"
    online={online}
    fila={{ pendentes, rejeitadas }}
    os={[]}
    lidaEm={null}
    aoAbrirOs={() => undefined}
    aoTrocarIdioma={() => undefined}
    aoEnviarAgora={() => undefined}
    aoDispensar={() => undefined}
    aoAbrirAtivos={() => undefined}
    aoAbrirChamado={() => undefined}
    aoSair={() => undefined}
  />
);

describe('telas do PWA em cada idioma', () => {
  it.each(IDIOMAS)('%s', (idioma) => {
    const m = mensagensDe(idioma);
    const html = renderizar(idioma, fila(false, 2));
    expect(html).toContain(m['tecnico.fila.titulo']);
    expect(html).toContain(m['tecnico.fila.vazia']);
    expect(renderizar(idioma, <Login />)).toContain(m['login.acao.entrar']);
  });

  it('estado da rede e da fila, com plural', () => {
    expect(renderizar('pt-BR', fila(false, 2))).toContain('2 operações aguardando envio.');
    expect(renderizar('pt-BR', fila(true, 1))).toContain('1 operação aguardando envio.');
    expect(renderizar('pt-BR', fila(true, 0))).toContain('Tudo enviado.');
    expect(renderizar('en', fila(false, 0))).toContain('No connection.');
  });

  it('pseudo-idioma: todo texto visível vem do catálogo (entre colchetes)', () => {
    const html = renderizar(PSEUDO_IDIOMA, fila(false, 3)).replace(
      /<select[\s\S]*?<\/select>/g,
      '',
    );
    const textos = [...html.matchAll(/>([^<>]+)</g)]
      .map((m) => (m[1] ?? '').trim())
      .filter(Boolean);
    expect(textos.length).toBeGreaterThan(4);
    for (const texto of textos) expect(texto, texto).toMatch(/^\[.*\]$/s);
  });

  it('(c) recusada aparece para o técnico, com o motivo pelo código de erro da API', () => {
    const rejeitadas = [
      { chave: 'k1', tipo: 'preferencias.gravar' as const, codigo: 'fuso_invalido' },
      { chave: 'k2', tipo: 'preferencias.gravar' as const, codigo: 'codigo_novo_da_api' },
    ];
    const pt = renderizar('pt-BR', fila(true, 0, rejeitadas));
    expect(pt).toContain('2 operações recusadas pelo servidor.');
    expect(pt).toContain('Troca de idioma: Fuso horário inválido.');
    expect(pt).toContain('Troca de idioma: Recusada pelo servidor (código codigo_novo_da_api).');
    expect(pt.match(/Dispensar/g)).toHaveLength(2);
    expect(renderizar('en', fila(true, 0, rejeitadas))).toContain(
      'Language change: Invalid time zone.',
    );
  });

  it('o seletor não oferece o pseudo-idioma sem VITE_PSEUDO_IDIOMA', () => {
    expect(renderizar('pt-BR', fila(true, 0))).not.toContain(`value="${PSEUDO_IDIOMA}"`);
  });
});

// B5 (docs/11): o index.html nasce em pt-BR; sem isto, o leitor de tela lia o
// inglês, o espanhol e o francês com a pronúncia do português.
describe('o idioma da página acompanha o idioma escolhido', () => {
  it.each(IDIOMAS)('%s', (idioma) => {
    const raiz = { lang: 'pt-BR' };
    aplicarIdiomaNaPagina(idioma, raiz);
    expect(raiz.lang).toBe(idioma);
  });

  it('o pseudo-idioma conta como inglês, como no web', () => {
    const raiz = { lang: 'pt-BR' };
    aplicarIdiomaNaPagina(PSEUDO_IDIOMA, raiz);
    expect(raiz.lang).toBe('en');
  });
});
