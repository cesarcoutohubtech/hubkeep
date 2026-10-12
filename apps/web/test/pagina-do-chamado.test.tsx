// Página do detalhe do chamado (P1c): entrega à tela o que o servidor leu,
// responde 404 a quem não vê o chamado (e a id que não é UUID) e, sem sessão
// ou grupo, deixa a tela carregar pela API. O carregamento é falso aqui; o
// real está coberto em carga-da-pagina.test.ts.
import { mensagensDe } from '@hubkeep/i18n';
import { renderToString } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Chamado from '../src/app/(painel)/chamados/[id]/page';
import { TelaDoChamado } from '../src/app/(painel)/chamados/[id]/tela';
import { ProvedorDeIdioma } from '../src/i18n/cliente';
import type { TelaDoChamado as DadosDaTela } from '../src/servidor/leituras-do-chamado';

const carga = vi.hoisted(() => ({ atual: null as unknown, pedidos: [] as string[] }));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));

vi.mock('../src/servidor/pagina', () => ({
  carregarNaPagina: async (nome: string) => {
    carga.pedidos.push(nome);
    return carga.atual;
  },
}));

const C = '55555555-5555-4555-8555-555555555555';

describe('página do detalhe do chamado', () => {
  beforeEach(() => {
    carga.atual = null;
    carga.pedidos = [];
  });
  const abrir = (id: string) => Chamado({ params: Promise.resolve({ id }) });

  it('entrega os dados lidos no servidor à tela', async () => {
    const dados = { detalhe: { chamado: { id: C } } };
    carga.atual = { tipo: 'ok', dados };
    const el = await abrir(C);
    expect(el.props).toMatchObject({ id: C, inicial: dados, erroInicial: null });
    expect(carga.pedidos).toEqual(['pagina.chamado']);
  });

  it('quem não vê o chamado recebe 404', async () => {
    carga.atual = { tipo: 'nao_encontrado' };
    await expect(abrir(C)).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('id que não é UUID recebe 404 sem ir ao banco', async () => {
    await expect(abrir('nao-e-uuid')).rejects.toThrow('NEXT_NOT_FOUND');
    expect(carga.pedidos).toEqual([]);
  });

  it('sem sessão ou grupo, a tela carrega pela API; recusa chega como código', async () => {
    carga.atual = { tipo: 'sem_contexto' };
    expect((await abrir(C)).props).toMatchObject({ inicial: null, erroInicial: null });
    const erro = { codigo: 'sem_permissao', parametros: {} };
    carga.atual = { tipo: 'erro', erro };
    expect((await abrir(C)).props).toMatchObject({ inicial: null, erroInicial: erro });
  });
});

describe('tela do detalhe com os dados do servidor', () => {
  const H = '11111111-1111-4111-8111-111111111111';
  const S = '22222222-2222-4222-8222-222222222222';
  const P = '44444444-4444-4444-8444-444444444444';
  const L = '77777777-7777-4777-8777-777777777777';
  const U = 'aaaaaaaa-0000-4000-8000-000000000001';
  const dados: DadosDaTela = {
    detalhe: {
      chamado: {
        id: C,
        hotelId: H,
        localId: L,
        ativoId: null,
        descricao: 'Ar da UH 101 não liga',
        estado: 'aberto',
        situacaoId: S,
        prioridadeId: P,
        politicaAplicada: {},
        abertoPor: U,
        motivoCancelamento: null,
        origem: 'interno',
        impactoHospede: null,
        versao: 1,
        criadoEm: '2026-10-08T12:00:00.000Z',
      },
      os: [],
      nomes: {
        hotel: 'Hotel Um',
        local: 'UH 101',
        localTipo: 'uh',
        ativo: null,
        pessoas: {},
        equipes: {},
        fornecedores: {},
      },
      assinaturaNoAceite: false,
    },
    eventos: [],
    hoteis: [{ id: H, nome: 'Hotel Um', status: 'ativo', bandeiraId: null }],
    corretiva: null,
    candidatos: null,
  };
  const renderizar = (inicial: DadosDaTela | null) =>
    renderToString(
      <ProvedorDeIdioma idioma="pt-BR" mensagens={mensagensDe('pt-BR')} pseudoLiberado={false}>
        <TelaDoChamado id={C} inicial={inicial} erroInicial={null} />
      </ProvedorDeIdioma>,
    );

  it('já sai com o chamado no primeiro HTML, sem esperar a API', () => {
    const html = renderizar(dados);
    expect(html).toContain('Ar da UH 101 não liga');
    expect(html).not.toContain(mensagensDe('pt-BR')['comum.carregando']);
  });

  it('sem dados do servidor, mostra o carregando (a tela pede à API ao montar)', () => {
    expect(renderizar(null)).toContain(mensagensDe('pt-BR')['comum.carregando']);
  });
});
