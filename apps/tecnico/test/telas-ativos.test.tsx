// Tela de ativos do PWA (B3b) nos quatro idiomas e no pseudo-idioma, pelo
// catálogo (ADR-022). Renderiza com react-dom/server.
import { IDIOMAS, type IdiomaDeExibicao, PSEUDO_IDIOMA, mensagensDe } from '@hubkeep/i18n';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ProvedorDeIdioma } from '../src/i18n';
import type { Referencia } from '../src/referencia/banco';
import { Ativos } from '../src/telas/Ativos';

const referencia: Referencia = {
  usuarioId: 'u',
  tenantId: 't',
  hoteis: [{ id: 'h1', nome: 'Hotel 1' }],
  locais: { h1: [{ id: 'l1', nome: 'UH 101', status: 'ativo' }] },
  ativos: {
    h1: [
      {
        id: 'a1',
        localId: 'l1',
        categoriaId: null,
        nome: 'Frigobar',
        fabricante: null,
        modelo: null,
        numeroSerie: null,
        campos: {},
        versao: 1,
        ativo: true,
      },
    ],
  },
  idiomaPadrao: 'pt-BR',
  categorias: [],
  lidaEm: 0,
};

const renderizar = (idioma: IdiomaDeExibicao, r: Referencia | null) =>
  renderToString(
    <ProvedorDeIdioma idioma={idioma}>
      <Ativos
        idioma={idioma}
        referencia={r}
        pendentes={[{ chave: 'k1', nome: 'TV', localId: 'l1' }]}
        aoCadastrar={async () => undefined}
        aoAlterar={async () => undefined}
        aoVoltar={() => undefined}
      />
    </ProvedorDeIdioma>,
  ).replaceAll('&#x27;', "'");

describe('tela de ativos do PWA', () => {
  it.each(IDIOMAS)('%s', (idioma) => {
    const m = mensagensDe(idioma);
    const html = renderizar(idioma, referencia);
    expect(html).toContain(m['admin.ativos.titulo']);
    expect(html).toContain(m['tecnico.ativos.pendentes_envio']);
    expect(html).toContain(m['tecnico.ativos.acao.alterar']);
    expect(renderizar(idioma, null)).toContain(m['tecnico.ativos.sem_referencia']);
  });

  it('lista os ativos guardados e os cadastros aguardando envio', () => {
    const html = renderizar('pt-BR', referencia);
    expect(html).toContain('Frigobar (UH 101)');
    expect(html).toContain('TV, em UH 101');
  });

  it('pseudo-idioma: todo texto visível vem do catálogo (entre colchetes)', () => {
    const html = renderizar(PSEUDO_IDIOMA, referencia).replace(/<select[\s\S]*?<\/select>/g, '');
    const textos = [...html.matchAll(/>([^<>]+)</g)]
      .map((m) => (m[1] ?? '').trim())
      .filter(Boolean);
    expect(textos.length).toBeGreaterThan(4);
    for (const texto of textos) expect(texto, texto).toMatch(/^\[.*\]$/s);
  });
});
