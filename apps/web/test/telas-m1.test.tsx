// Tela dos modelos de ativo (fase 1b, M1): o formulário mostra os campos da
// categoria sem a marca de obrigatório (o modelo só sugere), os checklists
// que cabem na categoria e a periodicidade sugerida; o modelo existente vem
// com os valores e com desativar. Renderiza no servidor (react-dom/server),
// sem rede.
import { IDIOMAS, type IdiomaDeExibicao, mensagensDe } from '@hubkeep/i18n';
import type { ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  type Categoria,
  type Checklist,
  FormularioDeModelo,
  type Modelo,
} from '../src/cliente/modelos-de-ativo';
import { ProvedorDeIdioma } from '../src/i18n/cliente';

const renderizar = (idioma: IdiomaDeExibicao, tela: ReactNode) =>
  renderToString(
    <ProvedorDeIdioma idioma={idioma} mensagens={mensagensDe(idioma)} pseudoLiberado={false}>
      {tela}
    </ProvedorDeIdioma>,
  ).replaceAll('&#x27;', "'");

const AR = 'ca000000-0000-4000-8000-000000000001';
const CATEGORIAS: Categoria[] = [
  {
    id: AR,
    chavePadrao: null,
    nomes: { 'pt-BR': 'Ar-condicionado' },
    ativa: true,
    campos: [
      {
        chave: 'btus',
        tipo: 'numero',
        obrigatorio: true,
        rotulos: { 'pt-BR': 'BTUs' },
        unidade: null,
        opcoes: [],
      },
    ],
  },
];
const CHECKLISTS: Checklist[] = [
  {
    id: 'cc000000-0000-4000-8000-000000000001',
    categoriaId: AR,
    nomes: { 'pt-BR': 'Inspeção do ar' },
    ativa: true,
  },
  {
    id: 'cc000000-0000-4000-8000-000000000002',
    categoriaId: 'cb000000-0000-4000-8000-000000000009',
    nomes: { 'pt-BR': 'Porta corta-fogo' },
    ativa: true,
  },
  {
    id: 'cc000000-0000-4000-8000-000000000003',
    categoriaId: null,
    nomes: { 'pt-BR': 'Antigo' },
    ativa: false,
  },
];
const MODELO: Modelo = {
  id: '3a000000-0000-4000-8000-000000000001',
  categoriaId: AR,
  nome: 'Split 12.000',
  fabricante: 'Fabricante X',
  modelo: 'X-12',
  campos: { btus: 12000 },
  checklistModeloId: 'cc000000-0000-4000-8000-000000000001',
  planoSugerido: { intervalo: 3, unidade: 'mes' },
  versao: 2,
  ativa: true,
};

const formulario = (modelo: Modelo | null) => (
  <FormularioDeModelo
    modelo={modelo}
    categorias={CATEGORIAS}
    checklists={CHECKLISTS}
    nomeDaCategoria={(c) => c.nomes['pt-BR'] ?? c.id}
    rotulo={(r, reserva) => r['pt-BR'] ?? reserva}
    executar={async () => {}}
  />
);

describe('modelos de ativo no web (M1)', () => {
  it.each(IDIOMAS)('%s: novo modelo, com os campos da categoria sem obrigatório', (idioma) => {
    const m = mensagensDe(idioma);
    const html = renderizar(idioma, formulario(null));
    expect(html).toContain('name="campo.btus"');
    expect(html).toContain('BTUs');
    expect(html).not.toContain(m['admin.ativos.obrigatorio']?.replace('{campo}', 'BTUs') ?? '§');
    expect(html).toContain(m['admin.modelos_de_ativo.acao.criar']);
    expect(html).toContain('name="intervalo"');
  });

  it('só os checklists ativos da categoria, ou de todas', () => {
    const html = renderizar('pt-BR', formulario(null));
    expect(html).toContain('Inspeção do ar');
    expect(html).not.toContain('Porta corta-fogo');
    expect(html).not.toContain('Antigo');
  });

  it('o modelo existente vem com os valores, a periodicidade e desativar', () => {
    const m = mensagensDe('pt-BR');
    const html = renderizar('pt-BR', formulario(MODELO));
    expect(html).toContain('value="Split 12.000"');
    expect(html).toContain('value="12000"');
    expect(html).toContain('value="3"');
    expect(html).toContain(m['admin.modelos_de_ativo.acao.desativar']);
  });
});
