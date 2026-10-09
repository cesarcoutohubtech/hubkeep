// Triagem no detalhe do chamado (fase 1a, depois da C7): o que cada estado
// oferece (pelas tabelas de transição do domínio), o valor do seletor de
// responsável e o painel nos quatro idiomas e no pseudo-idioma. Renderiza no
// servidor (react-dom/server), com dados prontos, sem rede.
import { IDIOMAS, type IdiomaDeExibicao, PSEUDO_IDIOMA, mensagensDe } from '@hubkeep/i18n';
import type { ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { DetalheDoChamado, OsDoChamado, Referencias } from '../src/cliente/corretiva';
import {
  type AcoesDaTriagem,
  type CandidatosAResponsavel,
  TriagemDoChamado,
  acoesPossiveis,
  execucaoDoValor,
  responsavelDoValor,
} from '../src/cliente/triagem';
import { ProvedorDeIdioma } from '../src/i18n/cliente';

const H = '11111111-1111-4111-8111-111111111111';
const S = '22222222-2222-4222-8222-222222222222';
const P = '44444444-4444-4444-8444-444444444444';
const C = '55555555-5555-4555-8555-555555555555';
const OS = '66666666-6666-4666-8666-666666666666';
const U = '77777777-7777-4777-8777-777777777777';
const E = '88888888-8888-4888-8888-888888888888';

const refs = {
  hoteis: [{ id: H, nome: 'Hotel Um' }],
  corretiva: {
    idiomaPadrao: 'pt-BR',
    situacoes: [
      {
        id: S,
        entidade: 'os',
        estado: 'atribuida',
        chavePadrao: 'os_atribuida',
        nomes: {},
        ordem: 1,
        cor: '#000000',
        ativa: true,
      },
    ],
    prioridades: [{ id: P, chavePadrao: 'urgente', nomes: {}, ordem: 1, peso: 100, ativa: true }],
  },
} as Referencias;

const candidatos: CandidatosAResponsavel = {
  equipes: [
    { id: E, nome: 'Equipe Centro', ativa: true },
    { id: C, nome: 'Equipe Antiga', ativa: false },
  ],
  disponiveis: [{ usuarioId: U, nome: 'Ana Técnica' }],
};

const osDe = (estado: OsDoChamado['estado']): OsDoChamado => ({
  id: OS,
  hotelId: H,
  chamadoId: C,
  estado,
  situacaoId: S,
  responsavel: { tipo: 'tecnico', usuarioId: U },
  motivoCancelamento: null,
  motivoReabertura: null,
  executadoPor: 'equipe_interna',
  fornecedorId: null,
  custoInformado: null,
  criadoPor: U,
  versao: 2,
  criadoEm: '2026-09-30T13:00:00.000Z',
});

const detalheDe = (
  estado: DetalheDoChamado['chamado']['estado'],
  os: OsDoChamado[] = [],
): DetalheDoChamado => ({
  chamado: {
    id: C,
    hotelId: H,
    localId: U,
    ativoId: null,
    descricao: 'Chuveiro sem água quente',
    estado,
    situacaoId: S,
    prioridadeId: P,
    politicaAplicada: {},
    abertoPor: U,
    motivoCancelamento: null,
    origem: 'interno',
    impactoHospede: null,
    versao: 1,
    criadoEm: '2026-09-30T12:00:00.000Z',
  },
  os,
  nomes: {
    hotel: 'Hotel Um',
    local: 'UH 104',
    localTipo: 'uh',
    ativo: null,
    pessoas: { [U]: 'Ana Técnica' },
    equipes: {},
    fornecedores: {},
  },
});

const nada = () => undefined;
const acoes: AcoesDaTriagem = {
  triar: nada,
  priorizar: nada,
  gerarOs: nada,
  cancelarChamado: nada,
  reatribuirOs: nada,
  cancelarOs: nada,
  informarImpacto: nada,
  definirExecutor: nada,
};

const F_ATIVO = '0193a000-0000-7000-8000-0000000000f1';
const F_INATIVO = '0193a000-0000-7000-8000-0000000000f2';
const fornecedores = [
  { id: F_ATIVO, nome: 'Refrigeração Sul', ativo: true },
  { id: F_INATIVO, nome: 'Refrigeração Velha', ativo: false },
];

/** Os valores que vêm do banco (nomes do cliente), fora do catálogo. */
const DADOS = ['Equipe Centro', 'Ana Técnica', 'Refrigeração Sul'];

const painel = (detalhe: DetalheDoChamado, c: CandidatosAResponsavel | null = candidatos) => (
  <TriagemDoChamado
    detalhe={detalhe}
    refs={refs}
    candidatos={c}
    fornecedores={fornecedores}
    acoes={acoes}
  />
);

const renderizar = (idioma: IdiomaDeExibicao, tela: ReactNode) =>
  renderToString(
    <ProvedorDeIdioma idioma={idioma} mensagens={mensagensDe(idioma)} pseudoLiberado>
      {tela}
    </ProvedorDeIdioma>,
  );

describe('ações da triagem por estado', () => {
  const resumo = (d: DetalheDoChamado) => {
    const a = acoesPossiveis(d);
    return {
      triar: a.triar,
      priorizar: a.priorizar,
      gerarOs: a.gerarOs,
      cancelarChamado: a.cancelarChamado,
      reatribuir: a.osReatribuiveis.length,
      cancelarOs: a.osCancelaveis.length,
    };
  };

  it('aberto: triar (com a prioridade junto), gerar a OS e cancelar o chamado', () => {
    expect(resumo(detalheDe('aberto'))).toEqual({
      triar: true,
      priorizar: false,
      gerarOs: true,
      cancelarChamado: true,
      reatribuir: 0,
      cancelarOs: 0,
    });
  });

  it('em triagem: ajustar a prioridade, gerar a OS e cancelar o chamado', () => {
    expect(resumo(detalheDe('em_triagem'))).toEqual({
      triar: false,
      priorizar: true,
      gerarOs: true,
      cancelarChamado: true,
      reatribuir: 0,
      cancelarOs: 0,
    });
  });

  it('em execução: ajustar a prioridade, reatribuir e cancelar a OS em curso', () => {
    for (const estadoDaOs of ['atribuida', 'em_execucao', 'pausada'] as const) {
      expect(resumo(detalheDe('em_execucao', [osDe('cancelada'), osDe(estadoDaOs)]))).toEqual({
        triar: false,
        priorizar: true,
        gerarOs: false,
        cancelarChamado: false,
        reatribuir: 1,
        cancelarOs: 1,
      });
    }
  });

  it('aguardando aceite, concluído e cancelado: nada da triagem', () => {
    for (const d of [
      detalheDe('aguardando_aceite', [osDe('concluida')]),
      detalheDe('concluido', [osDe('aceita')]),
      detalheDe('cancelado'),
    ]) {
      expect(resumo(d)).toEqual({
        triar: false,
        priorizar: false,
        gerarOs: false,
        cancelarChamado: false,
        reatribuir: 0,
        cancelarOs: 0,
      });
    }
  });
});

describe('impacto e quem executa (I4)', () => {
  it('impacto até o aceite; quem executa até a conclusão da OS', () => {
    const impacto = (d: DetalheDoChamado) => acoesPossiveis(d).impacto;
    expect(impacto(detalheDe('aberto'))).toBe(true);
    expect(impacto(detalheDe('aguardando_aceite', [osDe('concluida')]))).toBe(true);
    expect(impacto(detalheDe('concluido', [osDe('aceita')]))).toBe(false);
    expect(impacto(detalheDe('cancelado'))).toBe(false);
    const ajustaveis = (estado: OsDoChamado['estado']) =>
      acoesPossiveis(detalheDe('em_execucao', [osDe(estado)])).osComExecutorAjustavel.length;
    expect(ajustaveis('atribuida')).toBe(1);
    expect(ajustaveis('em_execucao')).toBe(1);
    expect(ajustaveis('pausada')).toBe(1);
    expect(ajustaveis('concluida')).toBe(0);
    expect(ajustaveis('cancelada')).toBe(0);
  });

  it('quem executa pelo valor da opção', () => {
    expect(execucaoDoValor('equipe_interna')).toEqual({ executadoPor: 'equipe_interna' });
    expect(execucaoDoValor(`fornecedor:${F_ATIVO}`)).toEqual({
      executadoPor: 'fornecedor',
      fornecedorId: F_ATIVO,
    });
    expect(execucaoDoValor('fornecedor:')).toBeNull();
    expect(execucaoDoValor('')).toBeNull();
  });

  it('a escolha mostra a equipe interna e só os fornecedores ativos', () => {
    const html = renderizar('pt-BR', painel(detalheDe('em_triagem')));
    expect(html).toContain('value="equipe_interna"');
    expect(html).toContain(`value="fornecedor:${F_ATIVO}"`);
    expect(html).not.toContain('Refrigeração Velha');
  });
});

describe('seletor de responsável', () => {
  it('técnico ou equipe pelo valor da opção; o resto é nulo', () => {
    expect(responsavelDoValor(`tecnico:${U}`)).toEqual({ tipo: 'tecnico', usuarioId: U });
    expect(responsavelDoValor(`equipe:${E}`)).toEqual({ tipo: 'equipe', equipeId: E });
    expect(responsavelDoValor('')).toBeNull();
    expect(responsavelDoValor('tecnico:')).toBeNull();
    expect(responsavelDoValor(`outro:${U}`)).toBeNull();
  });

  it('só as equipes ativas; sem ninguém disponível, o aviso', () => {
    const html = renderizar('pt-BR', painel(detalheDe('em_triagem')));
    expect(html).toContain('Equipe Centro');
    expect(html).not.toContain('Equipe Antiga');
    expect(html).toContain(`value="tecnico:${U}"`);
    const vazio = renderizar(
      'pt-BR',
      painel(detalheDe('em_triagem'), { equipes: [], disponiveis: [] }),
    );
    expect(vazio).toContain(mensagensDe('pt-BR')['corretiva.triagem.sem_candidatos']);
  });
});

describe('painel da triagem em cada idioma', () => {
  const telas = () => (
    <>
      {painel(detalheDe('aberto'))}
      {painel(detalheDe('em_triagem'))}
      {painel(detalheDe('em_execucao', [osDe('atribuida')]))}
      {painel(detalheDe('concluido', [osDe('aceita')]))}
    </>
  );

  it.each(IDIOMAS)('%s: triar, prioridade, gerar, reatribuir, cancelar', (idioma) => {
    const m = mensagensDe(idioma);
    const html = renderizar(idioma, telas());
    for (const chave of [
      'corretiva.triagem.titulo',
      'corretiva.triagem.triar',
      'corretiva.triagem.manter_prioridade',
      'corretiva.triagem.ajustar_prioridade',
      'corretiva.triagem.gerar_os',
      'corretiva.triagem.reatribuir',
      'corretiva.triagem.cancelar_os',
      'corretiva.triagem.cancelar_chamado',
      'corretiva.triagem.nada_a_fazer',
      'corretiva.triagem.executor',
      'corretiva.triagem.equipe_interna',
      'corretiva.triagem.salvar_executor',
      'corretiva.triagem.impacto',
      'corretiva.triagem.salvar_impacto',
      'prioridade.padrao.urgente',
    ] as const)
      expect(html).toContain(m[chave].replace(/'/g, '&#x27;'));
    for (const dado of DADOS) expect(html).toContain(dado);
  });

  it('pseudo-idioma: todo texto visível vem do catálogo, fora os dados do banco', () => {
    const html = renderizar(PSEUDO_IDIOMA, telas());
    const textos = [...html.matchAll(/>([^<>]+)</g)]
      .map((m) => (m[1] ?? '').trim())
      .filter((t) => t !== '' && !DADOS.includes(t));
    expect(textos.length).toBeGreaterThan(20);
    for (const texto of textos) expect(texto, texto).toMatch(/^\[.*\]$/s);
  });
});
