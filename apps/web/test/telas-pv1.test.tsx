// Tela da PV1 (fase 1b) no detalhe do chamado: o checklist da OS, com a
// versão do modelo e as respostas do técnico só para leitura, no tipo de cada
// item; quem tria aplica um modelo na OS sem checklist e troca o que não tem
// resposta. Renderiza no servidor (react-dom/server), sem rede: o checklist e
// os modelos entram já carregados.
import { IDIOMAS, type IdiomaDeExibicao, PSEUDO_IDIOMA, mensagensDe } from '@hubkeep/i18n';
import type { ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { type Checklist, ChecklistDaOs, type Modelo } from '../src/cliente/checklist-da-os';
import { ProvedorDeIdioma } from '../src/i18n/cliente';

const OS = '66666666-6666-4666-8666-666666666661';

const renderizar = (idioma: IdiomaDeExibicao, tela: ReactNode) =>
  renderToString(
    <ProvedorDeIdioma idioma={idioma} mensagens={mensagensDe(idioma)} pseudoLiberado={false}>
      {tela}
    </ProvedorDeIdioma>,
  ).replaceAll('&#x27;', "'");

const checklist = (respostas: Checklist['respostas']): Checklist => ({
  id: 'ac100000-0000-4000-8000-000000000001',
  modeloId: 'cc100000-0000-4000-8000-000000000001',
  modeloVersao: 3,
  nomes: { 'pt-BR': 'Inspeção do ar' },
  itens: [
    {
      chave: 'filtro_limpo',
      tipo: 'sim_nao',
      obrigatorio: true,
      rotulos: { 'pt-BR': 'Filtro limpo' },
      unidade: null,
      opcoes: [],
    },
    {
      chave: 'conformidade',
      tipo: 'lista',
      obrigatorio: false,
      rotulos: { 'pt-BR': 'Conformidade' },
      unidade: null,
      opcoes: [{ chave: 'nao_conforme', rotulos: { 'pt-BR': 'Não conforme' } }],
    },
  ],
  respostas,
});

const MODELOS: Modelo[] = [
  {
    id: 'cc100000-0000-4000-8000-000000000001',
    nomes: { 'pt-BR': 'Inspeção do ar' },
    versao: 3,
    ativa: true,
  },
];

describe('checklist da OS no web (PV1)', () => {
  it.each(IDIOMAS)('%s: versão, respostas no tipo do item e sem resposta', (idioma) => {
    const m = mensagensDe(idioma);
    const html = renderizar(
      idioma,
      <ChecklistDaOs
        osId={OS}
        estado="concluida"
        inicial={{
          checklist: checklist({ filtro_limpo: { valor: true, feitaEm: '2026-10-12T09:00:00Z' } }),
          modelos: [],
        }}
      />,
    );
    expect(html).toContain('data-checklist-da-os=');
    expect(html).toContain('Inspeção do ar');
    expect(html).toContain('data-respondido="sim"');
    expect(html).toContain('data-respondido="nao"');
    expect(html).toContain(m['checklist.sem_resposta']);
    // OS concluída: sem aplicar nem trocar.
    expect(html).not.toContain('name="modelo"');
  });

  it('a lista mostra o rótulo da opção; o sim/não, no idioma', () => {
    const html = renderizar(
      'en',
      <ChecklistDaOs
        osId={OS}
        estado="em_execucao"
        inicial={{
          checklist: checklist({
            filtro_limpo: { valor: false, feitaEm: '' },
            conformidade: { valor: 'nao_conforme', feitaEm: '' },
          }),
          modelos: MODELOS,
        }}
      />,
    );
    expect(html).toContain('>No<');
    expect(html).toContain('Não conforme');
    // Já respondido: não troca.
    expect(html).not.toContain('name="modelo"');
  });

  it('OS sem checklist: quem tria aplica; com cópia sem resposta, troca; sem modelos, nada', () => {
    const aplicar = renderizar(
      'pt-BR',
      <ChecklistDaOs
        osId={OS}
        estado="atribuida"
        inicial={{ checklist: null, modelos: MODELOS }}
      />,
    );
    expect(aplicar).toContain('name="modelo"');
    expect(aplicar).toContain('Aplicar checklist');
    const trocar = renderizar(
      'pt-BR',
      <ChecklistDaOs
        osId={OS}
        estado="em_execucao"
        inicial={{ checklist: checklist({}), modelos: MODELOS }}
      />,
    );
    expect(trocar).toContain('Trocar checklist');
    expect(
      renderizar(
        'pt-BR',
        <ChecklistDaOs osId={OS} estado="atribuida" inicial={{ checklist: null, modelos: [] }} />,
      ),
    ).toBe('');
  });

  it('pseudo-idioma: todo texto visível vem do catálogo (entre colchetes)', () => {
    const html = renderizar(
      PSEUDO_IDIOMA,
      <ChecklistDaOs
        osId={OS}
        estado="em_execucao"
        inicial={{ checklist: checklist({}), modelos: MODELOS }}
      />,
    );
    const textos = [...html.matchAll(/>([^<>]+)</g)]
      .map((m) => (m[1] ?? '').trim())
      .filter(Boolean)
      // Os nomes do modelo e dos itens são dados do grupo, não texto de interface.
      .filter((t) => !['Inspeção do ar', 'Filtro limpo', 'Conformidade'].includes(t));
    expect(textos.length).toBeGreaterThan(3);
    for (const texto of textos) expect(texto, texto).toMatch(/^\[.*\]$/s);
  });
});
