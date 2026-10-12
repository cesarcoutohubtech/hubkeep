// Telas da I6 (fase 1b) no detalhe do chamado: os códigos de falha, causa e
// solução da OS, pelo nome no idioma de quem lê (o do grupo, senão o do
// catálogo, senão o do idioma padrão), nos quatro idiomas e no pseudo-idioma.
// Renderiza no servidor (react-dom/server), sem rede: a lista do aceite, que
// vem da API, fica fora deste teste.
import { IDIOMAS, type IdiomaDeExibicao, PSEUDO_IDIOMA, mensagensDe } from '@hubkeep/i18n';
import type { ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { CodigosDoTenant } from '../src/cliente/codigos-manutencao';
import {
  ChamadoEmDetalhe,
  type DetalheDoChamado,
  type OsDoChamado,
  type Referencias,
} from '../src/cliente/corretiva';
import { ProvedorDeIdioma } from '../src/i18n/cliente';

const H = '11111111-1111-4111-8111-111111111111';
const S = '22222222-2222-4222-8222-222222222222';
const P = '44444444-4444-4444-8444-444444444444';
const C = '55555555-5555-4555-8555-555555555555';
const U = '77777777-7777-4777-8777-777777777777';
const L = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const FALHA = 'c0000000-0000-4000-8000-000000000001';
const CAUSA = 'c0000000-0000-4000-8000-000000000002';
const SUMIDO = 'c0000000-0000-4000-8000-000000000009';

const refs: Referencias = {
  hoteis: [{ id: H, nome: 'Hotel Um' }],
  corretiva: { idiomaPadrao: 'pt-BR', situacoes: [], prioridades: [] },
};

const codigos: CodigosDoTenant = {
  idiomaPadrao: 'pt-BR',
  codigos: [
    {
      id: FALHA,
      tipo: 'falha',
      categoriaId: null,
      chavePadrao: 'falha_nao_refrigera',
      nomes: {},
      ativa: true,
    },
    {
      id: CAUSA,
      tipo: 'causa',
      categoriaId: null,
      chavePadrao: null,
      nomes: { 'pt-BR': 'Borracha ressecada', en: 'Dry seal' },
      ativa: false,
    },
  ],
};

const os = (c: OsDoChamado['codigos']): OsDoChamado => ({
  id: '66666666-6666-4666-8666-666666666661',
  hotelId: H,
  chamadoId: C,
  estado: 'aceita',
  situacaoId: S,
  responsavel: { tipo: 'tecnico', usuarioId: U },
  motivoCancelamento: null,
  motivoReabertura: null,
  executadoPor: 'equipe_interna',
  fornecedorId: null,
  custoInformado: null,
  codigos: c,
  assinaturaAceiteId: null,
  criadoPor: U,
  versao: 4,
  criadoEm: '2026-10-10T12:00:00.000Z',
});

const detalhe = (o: OsDoChamado): DetalheDoChamado => ({
  chamado: {
    id: C,
    hotelId: H,
    localId: L,
    ativoId: null,
    descricao: 'Frigobar quente',
    estado: 'concluido',
    situacaoId: S,
    prioridadeId: P,
    politicaAplicada: {},
    abertoPor: U,
    motivoCancelamento: null,
    origem: 'interno',
    impactoHospede: null,
    versao: 3,
    criadoEm: '2026-10-10T10:00:00.000Z',
  },
  os: [o],
  nomes: {
    hotel: 'Hotel Um',
    local: 'UH 101',
    localTipo: 'uh',
    ativo: null,
    pessoas: { [U]: 'Ana Técnica' },
    equipes: {},
    fornecedores: {},
  },
  assinaturaNoAceite: false,
});

const nada = () => undefined;

const renderizar = (idioma: IdiomaDeExibicao, tela: ReactNode) =>
  renderToString(
    <ProvedorDeIdioma idioma={idioma} mensagens={mensagensDe(idioma)} pseudoLiberado>
      {tela}
    </ProvedorDeIdioma>,
  ).replaceAll('&#x27;', "'");

const tela = (o: OsDoChamado) => (
  <ChamadoEmDetalhe
    detalhe={detalhe(o)}
    refs={refs}
    codigos={codigos}
    aoAceitar={nada}
    aoReabrir={nada}
  />
);

describe('códigos da OS no detalhe (I6)', () => {
  it.each(IDIOMAS)('%s: o padrão pelo catálogo; o do grupo pelo nome dele', (idioma) => {
    const m = mensagensDe(idioma);
    const html = renderizar(idioma, tela(os({ falhaId: FALHA, causaId: CAUSA, solucaoId: null })));
    expect(html).toContain('data-codigos-da-os');
    expect(html).toContain(m['codigo_manutencao.padrao.falha_nao_refrigera']);
    // Desativado depois: a OS antiga continua mostrando o nome.
    expect(html).toContain(idioma === 'en' ? 'Dry seal' : 'Borracha ressecada');
    expect(html).not.toContain(`data-codigo="${SUMIDO}"`);
  });

  it('código que não está na lista do tenant aparece como não disponível', () => {
    const m = mensagensDe('pt-BR');
    const html = renderizar('pt-BR', tela(os({ falhaId: SUMIDO, causaId: null, solucaoId: null })));
    expect(html).toContain(`data-codigo="${SUMIDO}"`);
    expect(html).toContain(m['corretiva.os.codigo_sem_nome']);
  });

  it('sem nenhum código, a OS não mostra a lista', () => {
    const html = renderizar('pt-BR', tela(os({ falhaId: null, causaId: null, solucaoId: null })));
    expect(html).not.toContain('data-codigos-da-os');
  });

  it('pseudo-idioma: o rótulo vem do catálogo (entre colchetes)', () => {
    const html = renderizar(
      PSEUDO_IDIOMA,
      tela(os({ falhaId: FALHA, causaId: null, solucaoId: null })),
    );
    expect(html).toContain(
      mensagensDe(PSEUDO_IDIOMA)['codigo_manutencao.padrao.falha_nao_refrigera'],
    );
  });
});
