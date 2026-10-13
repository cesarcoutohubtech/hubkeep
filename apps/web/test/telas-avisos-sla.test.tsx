// Avisos de SLA (fase 1c; ADR-043, M4): a lista do painel e os selos da ficha
// nos quatro idiomas e no pseudo-idioma, renderizados no servidor
// (react-dom/server), com dados prontos, sem rede.
import { IDIOMAS, type IdiomaDeExibicao, PSEUDO_IDIOMA, mensagensDe } from '@hubkeep/i18n';
import type { ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  type ChamadoNoPainel,
  ListaDoPainelDeSla,
  SelosDosAvisos,
} from '../src/cliente/avisos-sla';
import { ProvedorDeIdioma } from '../src/i18n/cliente';

const C1 = '11111111-1111-4111-8111-111111111111';
const C2 = '22222222-2222-4222-8222-222222222222';
const chamados: ChamadoNoPainel[] = [
  {
    chamadoId: C1,
    descricao: 'Ar não liga',
    estado: 'em_execucao',
    prioridadeId: null,
    avisos: [{ tipo: 'solucao_vencida', nivel: 'vencido', prazo: '2026-10-13T18:00:00.000Z' }],
  },
  {
    chamadoId: C2,
    descricao: 'Chuveiro frio',
    estado: 'aberto',
    prioridadeId: null,
    avisos: [
      { tipo: 'atendimento_em_risco', nivel: 'em_risco', prazo: '2026-10-13T21:00:00.000Z' },
      { tipo: 'solucao_em_risco', nivel: 'em_risco', prazo: '2026-10-14T10:00:00.000Z' },
    ],
  },
];
const DADOS = ['Ar não liga', 'Chuveiro frio'];

const renderizar = (idioma: IdiomaDeExibicao, tela: ReactNode) =>
  renderToString(
    <ProvedorDeIdioma idioma={idioma} mensagens={mensagensDe(idioma)} pseudoLiberado>
      {tela}
    </ProvedorDeIdioma>,
  );

describe('avisos de SLA (M4) em cada idioma', () => {
  it.each(IDIOMAS)('%s: a lista com o link da ficha e um selo por aviso', (idioma) => {
    const html = renderizar(idioma, <ListaDoPainelDeSla chamados={chamados} />);
    expect(html).toContain(`href="/chamados/${C1}"`);
    for (const dado of DADOS) expect(html).toContain(dado);
    expect(html.match(/class="hk-selo"/g)).toHaveLength(3);
    expect(html).toContain('data-tom="vermelho"');
    expect(html).toContain('data-tom="ambar"');
  });

  it('pt-BR: o tipo do aviso e o prazo; sem chamado, a mensagem do painel vazio', () => {
    const html = renderizar('pt-BR', <ListaDoPainelDeSla chamados={chamados} />);
    expect(html).toContain('Solução vencida · prazo');
    expect(html).toContain('Atendimento em risco · prazo');
    expect(renderizar('pt-BR', <ListaDoPainelDeSla chamados={[]} />)).toContain(
      'Nenhum chamado com prazo em risco ou vencido',
    );
  });

  it('a ficha sem aviso não mostra nada', () => {
    expect(renderizar('pt-BR', <SelosDosAvisos avisos={[]} />)).toBe('');
  });

  it('pseudo-idioma: todo texto visível vem do catálogo, fora os dados do banco', () => {
    const html = renderizar(PSEUDO_IDIOMA, <ListaDoPainelDeSla chamados={chamados} />);
    const textos = [...html.matchAll(/>([^<>]+)</g)]
      .map((m) => (m[1] ?? '').trim())
      .filter((t) => t !== '' && !DADOS.includes(t));
    expect(textos.length).toBe(3);
    for (const texto of textos) expect(texto, texto).toMatch(/^\[.*\]$/s);
  });
});
