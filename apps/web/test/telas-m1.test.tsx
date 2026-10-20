// Tela dos modelos de ativo (fase 1b, M1): o formulário mostra os campos da
// categoria sem a marca de obrigatório (o modelo só sugere), os checklists
// que cabem na categoria e a periodicidade sugerida; o modelo existente vem
// com os valores e com desativar. As sugestões de plano (M1c) mostram o
// ativo, o modelo e a periodicidade, com criar só quando há periodicidade e
// o descarte com motivo. Renderiza no servidor (react-dom/server), sem rede.
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
import { ListaDeSugestoes, type SugestaoDePlano } from '../src/cliente/sugestoes-de-plano';
import {
  type CadastroPendente,
  ListaDeCadastrosPendentes,
} from '../src/cliente/aprovacao-de-cadastros';
import { ResultadoDaPlanilha } from '../src/cliente/importacao-de-ativos';
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

const SUGESTOES: SugestaoDePlano[] = [
  {
    ativoId: '0a000000-0000-4000-8000-000000000001',
    ativoNome: 'Split UH 101',
    ativoVersao: 3,
    modeloId: MODELO.id,
    modeloNome: 'Split 12.000',
    periodicidade: { intervalo: 3, unidade: 'mes' },
    checklistModeloId: null,
  },
  {
    ativoId: '0a000000-0000-4000-8000-000000000002',
    ativoNome: 'Frigobar UH 102',
    ativoVersao: 1,
    modeloId: '3a000000-0000-4000-8000-000000000002',
    modeloNome: null,
    periodicidade: null,
    checklistModeloId: null,
  },
];

describe('sugestões de plano no web (M1c)', () => {
  it.each(IDIOMAS)('%s: ativo, modelo, criar só com periodicidade e descarte', (idioma) => {
    const m = mensagensDe(idioma);
    const html = renderizar(
      idioma,
      <ListaDeSugestoes sugestoes={SUGESTOES} executar={async () => {}} />,
    );
    expect(html).toContain('Split UH 101');
    expect(html).toContain('Frigobar UH 102');
    expect(html).toContain('Split 12.000');
    expect(html).toContain(m['admin.preventivas.sugestoes.sem_periodicidade']);
    expect(html.split(m['admin.preventivas.sugestoes.criar'] ?? '§').length - 1).toBe(1);
    expect(html.split(m['admin.preventivas.sugestoes.descartar'] ?? '§').length - 1).toBe(2);
    expect(html).toContain('name="motivo"');
  });

  it('sem sugestões, a mensagem vazia', () => {
    const m = mensagensDe('pt-BR');
    const html = renderizar('pt-BR', <ListaDeSugestoes sugestoes={[]} executar={async () => {}} />);
    expect(html).toContain(m['admin.preventivas.sugestoes.vazio']);
  });
});

const PENDENTE: CadastroPendente = {
  id: '0a000000-0000-4000-8000-000000000009',
  localId: '0b000000-0000-4000-8000-000000000001',
  localNome: 'UH 101',
  categoriaId: null,
  nome: 'Split novo',
  fabricante: 'Fabricante X',
  modelo: 'X-12',
  numeroSerie: null,
  versao: 1,
  criadoEm: '2026-10-19T12:00:00.000Z',
};

describe('fila de aprovação do cadastro no web (M4)', () => {
  it.each(IDIOMAS)('%s: o ativo, o local, aprovar e recusar com motivo', (idioma) => {
    const m = mensagensDe(idioma);
    const html = renderizar(
      idioma,
      <ListaDeCadastrosPendentes cadastros={[PENDENTE]} executar={async () => {}} />,
    );
    expect(html).toContain('Split novo');
    expect(html).toContain('UH 101');
    expect(html).toContain('Fabricante X · X-12');
    expect(html).toContain(m['admin.aprovacao_cadastro.aprovar']);
    expect(html).toContain(m['admin.aprovacao_cadastro.recusar']);
    expect(html).toContain('name="motivo"');
  });

  it('sem pendentes, a mensagem vazia', () => {
    const m = mensagensDe('pt-BR');
    expect(
      renderizar('pt-BR', <ListaDeCadastrosPendentes cadastros={[]} executar={async () => {}} />),
    ).toContain(m['admin.aprovacao_cadastro.vazio']);
  });
});

describe('importação de ativos por planilha no web (M2)', () => {
  const LINHAS = [
    { numero: 2, situacao: 'nova' as const, nome: 'Split 1', erros: [] },
    { numero: 3, situacao: 'ja_importada' as const, nome: 'Split 2', erros: [] },
    {
      numero: 4,
      situacao: 'invalida' as const,
      nome: 'Bomba',
      erros: [
        {
          codigo: 'importacao_local_nao_encontrado',
          coluna: 'local',
          parametros: { local: 'Sala 9' },
        },
      ],
    },
  ];

  it.each(IDIOMAS)('%s: o resumo e as linhas que pedem atenção, com o erro traduzido', (idioma) => {
    const m = mensagensDe(idioma);
    const html = renderizar(
      idioma,
      <ResultadoDaPlanilha
        gravada={false}
        resumo={{ prontas: 1, jaImportadas: 1, invalidas: 1 }}
        linhas={LINHAS}
      />,
    );
    expect(html).not.toContain('Split 1');
    expect(html).toContain('Split 2');
    expect(html).toContain('Bomba');
    expect(html).toContain('Sala 9');
    expect(html).not.toContain('importacao_local_nao_encontrado');
    expect(m['erro.importacao_local_nao_encontrado']).toBeTruthy();
  });

  it('sem linha com problema, a mensagem vazia', () => {
    const m = mensagensDe('pt-BR');
    expect(
      renderizar(
        'pt-BR',
        <ResultadoDaPlanilha
          gravada
          resumo={{ prontas: 1, jaImportadas: 0, invalidas: 0 }}
          linhas={[{ numero: 2, situacao: 'criada', nome: 'Split 1', erros: [] }]}
        />,
      ),
    ).toContain(m['admin.importacao.sem_problemas']);
  });
});
