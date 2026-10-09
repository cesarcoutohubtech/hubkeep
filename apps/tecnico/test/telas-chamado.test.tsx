// Abertura de chamado no PWA (C2) nos quatro idiomas e no pseudo-idioma, pelo
// catálogo (ADR-022). Renderiza com react-dom/server.
import { IDIOMAS, type IdiomaDeExibicao, PSEUDO_IDIOMA, mensagensDe } from '@hubkeep/i18n';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ProvedorDeIdioma } from '../src/i18n';
import type { Referencia } from '../src/referencia/banco';
import { AbrirChamado, impactoDoValor } from '../src/telas/AbrirChamado';

const referencia: Referencia = {
  usuarioId: 'u',
  tenantId: 't',
  hoteis: [{ id: 'h1', nome: 'Hotel 1' }],
  locais: {
    h1: [
      { id: 'l1', nome: 'UH 101', status: 'ativo' },
      { id: 'l2', nome: 'UH 102', status: 'pendente_licenca' },
      { id: 'l3', nome: 'Sauna antiga', status: 'inativo' },
    ],
  },
  ativos: { h1: [] },
  idiomaPadrao: 'pt-BR',
  categorias: [],
  lidaEm: 0,
};

const renderizar = (idioma: IdiomaDeExibicao, r: Referencia | null) =>
  renderToString(
    <ProvedorDeIdioma idioma={idioma}>
      <AbrirChamado referencia={r} aoAbrir={async () => undefined} aoVoltar={() => undefined} />
    </ProvedorDeIdioma>,
  ).replaceAll('&#x27;', "'");

describe('abertura de chamado no PWA', () => {
  it.each(IDIOMAS)('%s', (idioma) => {
    const m = mensagensDe(idioma);
    const html = renderizar(idioma, referencia);
    expect(html).toContain(m['tecnico.chamado.titulo']);
    expect(html).toContain(m['tecnico.chamado.escolha_o_local']);
    expect(html).toContain(m['tecnico.chamado.sem_ativo']);
    expect(html).toContain(m['tecnico.chamado.acao.abrir']);
    expect(html).toContain(m['tecnico.chamado.parado']);
    expect(html).toContain(m['tecnico.chamado.impacto']);
    expect(html).toContain(m['tecnico.chamado.impacto_nao_sei']);
    expect(renderizar(idioma, null)).toContain(m['tecnico.ativos.sem_referencia']);
  });

  it('afeta hóspede: sim, não ou não sei (I4)', () => {
    expect(impactoDoValor('sim')).toBe(true);
    expect(impactoDoValor('nao')).toBe(false);
    expect(impactoDoValor('nao_sei')).toBeNull();
    expect(impactoDoValor('')).toBeNull();
  });

  it('o local desativado não aparece; a UH pendente aparece, e a recusa diz o motivo', () => {
    const html = renderizar('pt-BR', referencia);
    expect(html).toContain('UH 101');
    expect(html).toContain('UH 102');
    expect(html).not.toContain('Sauna antiga');
  });

  it('pseudo-idioma: todo texto visível vem do catálogo (entre colchetes)', () => {
    const html = renderizar(PSEUDO_IDIOMA, referencia).replace(/<select[\s\S]*?<\/select>/g, '');
    const textos = [...html.matchAll(/>([^<>]+)</g)]
      .map((m) => (m[1] ?? '').trim())
      .filter(Boolean);
    expect(textos.length).toBeGreaterThan(1);
    for (const texto of textos) expect(texto).toMatch(/^\[.*\]$/);
  });
});
