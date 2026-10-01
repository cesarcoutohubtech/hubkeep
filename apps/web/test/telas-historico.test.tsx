// Histórico do registro (fase 1a, D1): a ação, quem gravou e o antes e o
// depois de cada campo, nos quatro idiomas e no pseudo-idioma. Renderiza no
// servidor (react-dom/server), com dados prontos, sem rede.
import { IDIOMAS, type IdiomaDeExibicao, PSEUDO_IDIOMA, mensagensDe } from '@hubkeep/i18n';
import type { ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { type Historico, ListaDoHistorico } from '../src/cliente/HistoricoDoRegistro';
import { ProvedorDeIdioma } from '../src/i18n/cliente';

const C = '55555555-5555-4555-8555-555555555555';
const G = '77777777-7777-4777-8777-777777777777';
const P1 = '44444444-4444-4444-8444-444444444441';
const P2 = '44444444-4444-4444-8444-444444444442';
const E = '88888888-8888-4888-8888-888888888888';
const OCULTO = '99999999-9999-4999-8999-999999999999';

const chamado: Historico = {
  entidade: 'chamado',
  registroId: C,
  idiomaPadrao: 'pt-BR',
  eventos: [
    {
      id: '00000000-0000-4000-8000-000000000001',
      em: '2026-09-30T12:00:00.000Z',
      acao: 'abrir',
      usuarioId: G,
      usuarioNome: 'Gerente Centro',
      mudancas: [
        { campo: 'descricao', chave: null, antes: null, depois: 'Chuveiro sem água quente' },
        { campo: 'estado', chave: null, antes: null, depois: 'aberto' },
      ],
    },
    {
      id: '00000000-0000-4000-8000-000000000002',
      em: '2026-09-30T13:00:00.000Z',
      acao: 'triar',
      usuarioId: G,
      usuarioNome: null,
      mudancas: [
        { campo: 'estado', chave: null, antes: 'aberto', depois: 'em_triagem' },
        { campo: 'prioridadeId', chave: null, antes: P1, depois: P2 },
        { campo: 'equipeId', chave: null, antes: OCULTO, depois: E },
      ],
    },
    {
      id: '00000000-0000-4000-8000-000000000003',
      em: '2026-09-30T14:00:00.000Z',
      acao: 'cancelar',
      usuarioId: null,
      usuarioNome: null,
      mudancas: [{ campo: 'motivo', chave: null, antes: null, depois: 'Duplicado' }],
    },
  ],
  referencias: {
    [P1]: { tipo: 'prioridade', chavePadrao: 'baixa', nomes: {} },
    [P2]: { tipo: 'prioridade', chavePadrao: null, nomes: { 'pt-BR': 'Crítica' } },
    [E]: { tipo: 'equipe', nome: 'Equipe Centro' },
  },
};

const ativo: Historico = {
  entidade: 'ativo',
  registroId: C,
  idiomaPadrao: 'pt-BR',
  eventos: [
    {
      id: '00000000-0000-4000-8000-000000000004',
      em: '2026-09-30T15:00:00.000Z',
      acao: 'alterar',
      usuarioId: G,
      usuarioNome: 'Gerente Centro',
      mudancas: [
        { campo: 'campos', chave: 'potencia', antes: 9000, depois: 12000 },
        { campo: 'desativado', chave: null, antes: false, depois: true },
      ],
    },
  ],
  referencias: {},
};

const vazio: Historico = { ...ativo, entidade: 'local', eventos: [] };

/** Os valores que vêm do banco (nomes e textos do cliente), fora do catálogo. */
const DADOS = [
  'Gerente Centro',
  'Chuveiro sem água quente',
  'Crítica',
  'Equipe Centro',
  'Duplicado',
  'potencia',
];

const renderizar = (idioma: IdiomaDeExibicao, tela: ReactNode) =>
  renderToString(
    <ProvedorDeIdioma idioma={idioma} mensagens={mensagensDe(idioma)} pseudoLiberado>
      {tela}
    </ProvedorDeIdioma>,
  );

const telas = () => (
  <>
    <ListaDoHistorico historico={chamado} />
    <ListaDoHistorico historico={ativo} />
    <ListaDoHistorico historico={vazio} />
  </>
);

describe('histórico do registro', () => {
  it('pt-BR: ação, quem, antes e depois, com os nomes das referências', () => {
    const html = renderizar('pt-BR', telas()).replace(/<!-- -->/g, '');
    expect(html).toContain('Chamado aberto');
    expect(html).toContain('por Gerente Centro');
    expect(html).toContain('por outra pessoa');
    expect(html).toContain('pelo sistema');
    expect(html).toContain('Estado: aberto → em triagem');
    // Prioridade padrão pelo catálogo; a do tenant pelo nome dele.
    expect(html).toContain('Prioridade: Baixa → Crítica');
    // A equipe que quem vê não lê aparece sem acesso.
    expect(html).toContain('Equipe: (sem acesso) → Equipe Centro');
    expect(html).toContain('Motivo: vazio → Duplicado');
    expect(html).toContain('Campo da categoria (potencia): 9.000 → 12.000');
    expect(html).toContain('Desativado: não → sim');
    expect(html).toContain('Nenhuma alteração registrada que você possa ver.');
  });

  it.each(IDIOMAS)('%s: os textos do histórico saem do catálogo', (idioma) => {
    const m = mensagensDe(idioma);
    const html = renderizar(idioma, telas());
    for (const chave of ['auditoria.titulo', 'auditoria.vazio', 'auditoria.por_sistema'] as const)
      expect(html).toContain(m[chave].replace(/'/g, '&#x27;'));
    for (const dado of DADOS) expect(html).toContain(dado);
  });

  it('pseudo-idioma: todo texto visível vem do catálogo, fora os dados do banco', () => {
    const html = renderizar(PSEUDO_IDIOMA, telas());
    const textos = [...html.matchAll(/>([^<>]+)</g)]
      .map((m) => (m[1] ?? '').trim())
      .filter((t) => t !== '' && !DADOS.includes(t));
    expect(textos.length).toBeGreaterThan(10);
    for (const texto of textos) expect(texto, texto).toMatch(/^\[.*\]$/s);
  });
});
