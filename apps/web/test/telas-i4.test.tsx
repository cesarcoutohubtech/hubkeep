// Telas da I4 (fase 1b) no detalhe do chamado: se afeta hóspede, quem executa
// cada OS e o custo informado, o campo de custo no aceite e o painel da UH
// indisponível (períodos, liberar e marcar), nos quatro idiomas e no
// pseudo-idioma. Renderiza no servidor (react-dom/server), sem rede.
import { IDIOMAS, type IdiomaDeExibicao, PSEUDO_IDIOMA, mensagensDe } from '@hubkeep/i18n';
import type { ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  ChamadoEmDetalhe,
  type DetalheDoChamado,
  type OsDoChamado,
  type Referencias,
  chaveDoImpacto,
  custoDoCampo,
} from '../src/cliente/corretiva';
import {
  type PeriodoDeUh,
  UhIndisponivelDoChamado,
  podeMarcarUh,
} from '../src/cliente/uh-indisponivel';
import { ProvedorDeIdioma } from '../src/i18n/cliente';

const H = '11111111-1111-4111-8111-111111111111';
const S = '22222222-2222-4222-8222-222222222222';
const P = '44444444-4444-4444-8444-444444444444';
const C = '55555555-5555-4555-8555-555555555555';
const U = '77777777-7777-4777-8777-777777777777';
const F = '99999999-9999-4999-8999-9999999999f1';
const L = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const refs: Referencias = {
  hoteis: [{ id: H, nome: 'Hotel Um' }],
  corretiva: { idiomaPadrao: 'pt-BR', situacoes: [], prioridades: [] },
};

const osDe = (o: Partial<OsDoChamado>, i: number): OsDoChamado => ({
  id: `66666666-6666-4666-8666-66666666666${i}`,
  hotelId: H,
  chamadoId: C,
  estado: 'concluida',
  situacaoId: S,
  responsavel: { tipo: 'tecnico', usuarioId: U },
  motivoCancelamento: null,
  motivoReabertura: null,
  executadoPor: 'equipe_interna',
  fornecedorId: null,
  custoInformado: null,
  codigos: { falhaId: null, causaId: null, solucaoId: null },
  assinaturaAceiteId: null,
  criadoPor: U,
  versao: 3,
  criadoEm: '2026-10-09T12:00:00.000Z',
  ...o,
});

const detalheDe = (
  estado: DetalheDoChamado['chamado']['estado'],
  extra: { impacto?: boolean | null; localTipo?: 'uh' | 'area_comum'; os?: OsDoChamado[] } = {},
): DetalheDoChamado => ({
  chamado: {
    id: C,
    hotelId: H,
    localId: L,
    ativoId: null,
    descricao: 'Chuveiro sem água quente',
    estado,
    situacaoId: S,
    prioridadeId: P,
    politicaAplicada: {},
    abertoPor: U,
    motivoCancelamento: null,
    origem: 'interno',
    impactoHospede: extra.impacto === undefined ? null : extra.impacto,
    versao: 2,
    criadoEm: '2026-10-09T10:00:00.000Z',
  },
  os: extra.os ?? [],
  nomes: {
    hotel: 'Hotel Um',
    local: 'UH 101',
    localTipo: extra.localTipo ?? 'uh',
    ativo: null,
    pessoas: { [U]: 'Ana Técnica' },
    equipes: {},
    fornecedores: { [F]: 'Refrigeração Sul' },
  },
  assinaturaNoAceite: false,
});

const aberto: PeriodoDeUh = {
  id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
  localId: L,
  chamadoId: C,
  inicio: '2026-10-09T10:00:00.000Z',
  fim: null,
  abertaPor: U,
  encerradaPor: null,
  tempoIndisponivelMs: 2.5 * 3_600_000,
};
const encerrado: PeriodoDeUh = {
  ...aberto,
  id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2',
  inicio: '2026-10-08T10:00:00.000Z',
  fim: '2026-10-08T16:00:00.000Z',
  encerradaPor: U,
  tempoIndisponivelMs: 6 * 3_600_000,
};

const nada = () => undefined;

/** Os valores que vêm do banco (nomes e textos do cliente), fora do catálogo. */
const DADOS = ['Hotel Um', 'UH 101', 'Chuveiro sem água quente', 'Ana Técnica', 'Refrigeração Sul'];

const renderizar = (idioma: IdiomaDeExibicao, tela: ReactNode) =>
  renderToString(
    <ProvedorDeIdioma idioma={idioma} mensagens={mensagensDe(idioma)} pseudoLiberado>
      {tela}
    </ProvedorDeIdioma>,
  );

const detalheComTudo = () =>
  detalheDe('aguardando_aceite', {
    impacto: true,
    os: [
      osDe({ executadoPor: 'fornecedor', fornecedorId: F, custoInformado: 150.5 }, 1),
      osDe({ estado: 'cancelada' }, 2),
    ],
  });

const telas = () => (
  <>
    <ChamadoEmDetalhe detalhe={detalheComTudo()} refs={refs} aoAceitar={nada} aoReabrir={nada} />
    <UhIndisponivelDoChamado
      detalhe={detalheDe('em_execucao')}
      periodos={[aberto, encerrado]}
      aoMarcar={nada}
      aoLiberar={nada}
    />
    <UhIndisponivelDoChamado
      detalhe={detalheDe('em_execucao')}
      periodos={[encerrado]}
      aoMarcar={nada}
      aoLiberar={nada}
    />
  </>
);

describe('campos da I4', () => {
  it('custo do campo: vazio é não informado; vírgula vale como ponto', () => {
    expect(custoDoCampo('')).toBeNull();
    expect(custoDoCampo('  ')).toBeNull();
    expect(custoDoCampo('150,50')).toBe(150.5);
    expect(custoDoCampo('0')).toBe(0);
  });

  it('impacto como o catálogo o nomeia', () => {
    expect(chaveDoImpacto(true)).toBe('sim');
    expect(chaveDoImpacto(false)).toBe('nao');
    expect(chaveDoImpacto(null)).toBe('nao_informado');
  });
});

describe('detalhe do chamado com impacto, quem executa e custo', () => {
  it('pt-BR: o fornecedor pelo nome, o custo em reais e a equipe interna', () => {
    const html = renderizar(
      'pt-BR',
      <ChamadoEmDetalhe detalhe={detalheComTudo()} refs={refs} aoAceitar={nada} aoReabrir={nada} />,
    );
    expect(html).toContain('data-impacto="sim"');
    expect(html).toContain('Refrigeração Sul');
    expect(html).toContain('data-executado-por="equipe_interna"');
    expect(html).toContain('data-custo="150.5"');
    expect(html).toMatch(/R\$\s150,50/);
  });

  it('o campo de custo só no aceite da OS concluída', () => {
    const m = mensagensDe('pt-BR');
    const comAceite = renderizar(
      'pt-BR',
      <ChamadoEmDetalhe detalhe={detalheComTudo()} refs={refs} aoAceitar={nada} aoReabrir={nada} />,
    );
    expect(comAceite).toContain(m['corretiva.aceite.custo']);
    const semAceite = renderizar(
      'pt-BR',
      <ChamadoEmDetalhe
        detalhe={detalheDe('em_execucao', { os: [osDe({ estado: 'em_execucao' }, 1)] })}
        refs={refs}
        aoAceitar={nada}
        aoReabrir={nada}
      />,
    );
    expect(semAceite).not.toContain(m['corretiva.aceite.custo']);
  });
});

describe('painel da UH indisponível', () => {
  it('marcar só na UH, com o chamado em curso e sem período aberto', () => {
    expect(podeMarcarUh(detalheDe('em_execucao'), [])).toBe(true);
    expect(podeMarcarUh(detalheDe('em_execucao'), [encerrado])).toBe(true);
    expect(podeMarcarUh(detalheDe('em_execucao'), [aberto])).toBe(false);
    expect(podeMarcarUh(detalheDe('concluido'), [])).toBe(false);
    expect(podeMarcarUh(detalheDe('em_execucao', { localTipo: 'area_comum' }), [])).toBe(false);
  });

  it('área comum sem períodos: o painel não aparece', () => {
    const html = renderizar(
      'pt-BR',
      <UhIndisponivelDoChamado
        detalhe={detalheDe('em_execucao', { localTipo: 'area_comum' })}
        periodos={[]}
        aoMarcar={nada}
        aoLiberar={nada}
      />,
    );
    expect(html).toBe('');
  });

  it('o período aberto tem o botão de liberar; o encerrado, não', () => {
    const m = mensagensDe('pt-BR');
    const html = renderizar(
      'pt-BR',
      <UhIndisponivelDoChamado
        detalhe={detalheDe('em_execucao')}
        periodos={[aberto, encerrado]}
        aoMarcar={nada}
        aoLiberar={nada}
      />,
    );
    expect(html.split(m['corretiva.uh.liberar']).length - 1).toBe(1);
    expect(html).not.toContain(m['corretiva.uh.marcar_descricao']);
  });
});

describe('telas da I4 em cada idioma', () => {
  it.each(IDIOMAS)('%s: impacto, quem executa, custo e UH', (idioma) => {
    const m = mensagensDe(idioma);
    const html = renderizar(idioma, telas());
    for (const chave of [
      'corretiva.aceite.custo',
      'corretiva.aceite.custo_dica',
      'corretiva.uh.titulo',
      'corretiva.uh.indisponivel',
      'corretiva.uh.liberada',
      'corretiva.uh.liberar',
      'corretiva.uh.marcar',
      'corretiva.uh.marcar_descricao',
      'corretiva.uh.desde',
    ] as const)
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
