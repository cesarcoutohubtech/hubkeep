// Tela da PV2 (fase 1b): os planos preventivos do hotel, com a periodicidade,
// a próxima data, o responsável, a situação e as ações de cada situação; e a
// prévia das próximas datas pelo calendário do domínio. Renderiza no servidor
// (react-dom/server), sem rede: a lista e o apoio entram já carregados.
import { IDIOMAS, type IdiomaDeExibicao, mensagensDe } from '@hubkeep/i18n';
import type { ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  type Apoio,
  type Plano,
  PlanosPreventivos,
  previa,
} from '../src/cliente/planos-preventivos';
import { ProvedorDeIdioma } from '../src/i18n/cliente';

const renderizar = (idioma: IdiomaDeExibicao, tela: ReactNode) =>
  renderToString(
    <ProvedorDeIdioma idioma={idioma} mensagens={mensagensDe(idioma)} pseudoLiberado={false}>
      {tela}
    </ProvedorDeIdioma>,
  ).replaceAll('&#x27;', "'");

const APOIO: Apoio = {
  ativos: [{ id: 'a1', nome: 'Split UH 101', ativo: true }],
  categorias: [{ id: 'c1', chavePadrao: null, nomes: { 'pt-BR': 'Elevador' }, ativa: true }],
  modelos: [{ id: 'm1', nomes: { 'pt-BR': 'Inspeção do ar' }, ativa: true }],
  equipes: [{ id: 'e1', nome: 'Manutenção', ativa: true }],
  tecnicos: [{ usuarioId: 't1', nome: 'Ana Técnica' }],
  idiomaPadrao: 'pt-BR',
};

const plano = (p: Partial<Plano>): Plano => ({
  id: 'p1',
  ativoId: 'a1',
  categoriaId: null,
  nome: 'Limpeza do filtro',
  intervalo: 1,
  unidade: 'mes',
  inicio: '2026-01-31',
  checklistModeloId: null,
  tecnicoId: 't1',
  equipeId: null,
  situacao: 'ativo',
  versao: 3,
  proximaData: '2026-10-31',
  pendencias: [],
  ...p,
});

const LISTA = {
  hoje: '2026-10-13',
  planos: [
    plano({}),
    plano({
      id: 'p2',
      ativoId: null,
      categoriaId: 'c1',
      nome: 'PMOC',
      intervalo: 3,
      tecnicoId: null,
      equipeId: 'e1',
      situacao: 'pausado',
    }),
    plano({ id: 'p3', nome: 'Antigo', situacao: 'encerrado', proximaData: null }),
  ],
};

describe('planos preventivos no web (PV2)', () => {
  it.each(IDIOMAS)('%s: lista, alvo, responsável, situação e ações', (idioma) => {
    const m = mensagensDe(idioma);
    const html = renderizar(idioma, <PlanosPreventivos inicial={{ lista: LISTA, apoio: APOIO }} />);
    expect(html).toContain('Limpeza do filtro');
    expect(html).toContain('Split UH 101');
    expect(html).toContain('Ana Técnica');
    expect(html).toContain('Manutenção');
    expect(html).toContain('Elevador');
    // A situação e as ações de cada uma: o ativo pausa, o pausado ativa, o encerrado não tem ação.
    const acoes = m['admin.preventivas.acao_da_situacao'] ?? '';
    expect(acoes).toContain('ativar');
    expect(html).toContain(m['admin.preventivas.novo']);
    expect(html).toContain('name="alvo"');
    expect(html).toContain('name="responsavel"');
    expect(html).not.toContain('admin.preventivas.');
  });

  it('pt-BR: periodicidade no plural, próxima data e sem próxima no encerrado', () => {
    const html = renderizar(
      'pt-BR',
      <PlanosPreventivos inicial={{ lista: LISTA, apoio: APOIO }} />,
    );
    expect(html).toContain('A cada mês');
    expect(html).toContain('A cada 3 meses');
    expect(html).toContain('Próxima: 31/10/2026');
    expect(html).toContain('Sem próxima data');
    expect(html).toContain('Pausar');
    expect(html).toContain('Ativar');
    expect(html.match(/Encerrar/g)?.length).toBe(2);
    expect(html).toContain('Categoria: Elevador');
  });

  it.each(IDIOMAS)(
    '%s: as pendências do plano aparecem traduzidas (PV3c; adendo da PV3 ao ADR-041)',
    (idioma) => {
      const lista = {
        hoje: '2026-10-13',
        planos: [plano({ pendencias: ['checklist_inativo', 'responsavel_invalido'] })],
      };
      const html = renderizar(idioma, <PlanosPreventivos inicial={{ lista, apoio: APOIO }} />);
      expect(html.match(/role="status"/g)?.length).toBe(2);
      expect(html).not.toContain('admin.preventivas.');
      expect(html).not.toContain('checklist_inativo');
      expect(html).not.toContain('responsavel_invalido');
    },
  );

  it('pt-BR: o texto de cada pendência', () => {
    const lista = {
      hoje: '2026-10-13',
      planos: [plano({ pendencias: ['checklist_inativo', 'responsavel_invalido'] })],
    };
    const html = renderizar('pt-BR', <PlanosPreventivos inicial={{ lista, apoio: APOIO }} />);
    expect(html).toContain('Modelo de checklist inativo');
    expect(html).toContain('O responsável não atende mais este hotel');
  });

  it('sem planos: a mensagem de lista vazia', () => {
    const html = renderizar(
      'pt-BR',
      <PlanosPreventivos inicial={{ lista: { hoje: '2026-10-13', planos: [] }, apoio: APOIO }} />,
    );
    expect(html).toContain(mensagensDe('pt-BR')['admin.preventivas.vazio']);
  });
});

describe('prévia das próximas datas', () => {
  it('a partir de hoje, ou do início se ele é futuro; vazia com dado inválido', () => {
    expect(previa('1', 'mes', '2026-01-31', '2026-10-13')).toEqual([
      '2026-10-31',
      '2026-11-30',
      '2026-12-31',
      '2027-01-31',
      '2027-02-28',
    ]);
    expect(previa('2', 'semana', '2026-12-01', '2026-10-13')[0]).toBe('2026-12-01');
    expect(previa('25', 'mes', '2026-01-31', '2026-10-13')).toEqual([]);
    expect(previa('1', 'ano', '2026-01-31', '2026-10-13')).toEqual([]);
    expect(previa('1', 'mes', '', '2026-10-13')).toEqual([]);
  });
});
