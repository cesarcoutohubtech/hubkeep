// A OS impressa (1c, item 9): a leitura do servidor (a descrição do chamado, o
// custo oculto e o aceite no papel), a página que só aceita UUID e a folha nos
// quatro idiomas e no pseudo-idioma, renderizada no servidor, sem rede.
import type { OsGravada } from '@hubkeep/aplicacao';
import { IDIOMAS, type IdiomaDeExibicao, PSEUDO_IDIOMA, mensagensDe } from '@hubkeep/i18n';
import type { ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import ImpressaoDaOsPagina from '../src/app/(painel)/os/[id]/impressao/page';
import { TelaDaImpressao } from '../src/app/(painel)/os/[id]/impressao/tela';
import { FolhaDaOs, type ImpressaoDaOs } from '../src/cliente/impressao-da-os';
import { ProvedorDeIdioma } from '../src/i18n/cliente';
import { type FontesDaOs, impressaoDaOs } from '../src/servidor/leituras-da-os';

vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
  usePathname: () => '/',
}));

const ID = '55555555-5555-4555-8555-555555555555';
const CHAMADO = '66666666-6666-4666-8666-666666666666';
const TECNICO = '77777777-7777-4777-8777-777777777777';
const FORNECEDOR = '88888888-8888-4888-8888-888888888888';
const AGORA = new Date('2026-10-19T12:00:00Z');

const gravada: OsGravada = {
  id: ID,
  hotelId: '11111111-1111-4111-8111-111111111111',
  bandeiraId: null,
  chamadoId: CHAMADO,
  preventiva: null,
  estado: 'aceita',
  situacaoId: '22222222-2222-4222-8222-222222222222',
  responsavel: { tipo: 'tecnico', usuarioId: TECNICO },
  motivoCancelamento: null,
  motivoReabertura: null,
  executadoPor: 'fornecedor',
  fornecedorId: FORNECEDOR,
  custoInformado: null,
  codigos: { falhaId: null, causaId: null, solucaoId: null },
  assinaturaAceiteId: '99999999-9999-4999-8999-999999999999',
  responsavelArrendamento: 'locador',
  locadorAvisadoEm: null,
  criadoPor: TECNICO,
  versao: 4,
  criadoEm: AGORA,
};

const NOMES = {
  hotel: 'Hotel Centro',
  local: 'UH 101',
  localTipo: 'uh' as const,
  ativo: 'Split 12k',
  pessoas: { [TECNICO]: 'Ana Técnica' },
  equipes: {},
  fornecedores: { [FORNECEDOR]: 'Frio Bom' },
};

const fontes = (custoOculto: boolean): FontesDaOs => ({
  triagem: async () => ({
    os: async () => gravada,
    osParaImpressao: async () => ({ os: gravada, custoOculto }),
    assinaturaNoAceite: async () => false,
  }),
  consultas: async () => ({ nomesDaOs: async () => NOMES }),
  chamados: async () => ({
    chamado: async () => ({ descricao: 'Ar-condicionado pingando' }) as never,
  }),
});

describe('a leitura da OS para imprimir', () => {
  it('traz a descrição do chamado, o custo oculto e o aceite no papel', async () => {
    const ctx = { usuarioId: 'u', tenantId: 't' };
    const r = await impressaoDaOs(ctx, ID, fontes(true));
    expect(r).toMatchObject({
      descricao: 'Ar-condicionado pingando',
      custoOculto: true,
      aceite: 'assinado',
      os: { id: ID, custoInformado: null },
      nomes: NOMES,
    });
  });
});

describe('a página da impressão', () => {
  const abrir = (id: string) => ImpressaoDaOsPagina({ params: Promise.resolve({ id }) });

  it('entrega a id à tela, e a id que não é UUID é 404', async () => {
    const el = await abrir(ID);
    expect(el.type).toBe(TelaDaImpressao);
    expect(el.props).toEqual({ id: ID });
    await expect(abrir('nao-e-uuid')).rejects.toThrow('NEXT_NOT_FOUND');
  });
});

const impressao = (extra: Partial<ImpressaoDaOs> = {}): ImpressaoDaOs => ({
  os: {
    ...gravada,
    custoInformado: 350,
    locadorAvisadoEm: null,
    criadoEm: AGORA.toISOString(),
  },
  nomes: NOMES,
  assinaturaNoAceite: false,
  descricao: 'Ar-condicionado pingando',
  custoOculto: false,
  aceite: 'assinado',
  ...extra,
});

const renderizar = (idioma: IdiomaDeExibicao, tela: ReactNode) =>
  renderToString(
    <ProvedorDeIdioma idioma={idioma} mensagens={mensagensDe(idioma)} pseudoLiberado>
      {tela}
    </ProvedorDeIdioma>,
  );

const folha = (i: ImpressaoDaOs, fotos: Parameters<typeof FolhaDaOs>[0]['fotos'] = []) => (
  <FolhaDaOs
    impressao={i}
    refs={null}
    codigos={null}
    fotos={fotos}
    assinaturaUrl="https://storage.invalid/assinatura.png"
    impressaEm={AGORA}
  />
);

describe('a folha da OS', () => {
  it.each<IdiomaDeExibicao>([...IDIOMAS, PSEUDO_IDIOMA])('%s: sem chave crua', (idioma) => {
    const html = renderizar(
      idioma,
      folha(impressao(), [
        {
          id: 'f1',
          url: 'https://storage.invalid/f1.jpg',
          momento: 'antes',
          criadoEm: AGORA.toISOString(),
        },
      ]),
    );
    expect(html).not.toMatch(/impressao_os\.[a-z_.]+/);
    expect(html).toContain('Ar-condicionado pingando');
    expect(html).toContain('Frio Bom');
    expect(html.match(/<img /g)).toHaveLength(2);
  });

  it('pt-BR: os campos, o custo, a foto e o aceite com assinatura', () => {
    const html = renderizar(
      'pt-BR',
      folha(impressao(), [
        {
          id: 'f1',
          url: 'https://storage.invalid/f1.jpg',
          momento: 'depois',
          criadoEm: AGORA.toISOString(),
        },
      ]),
    );
    for (const texto of [
      'Ordem de serviço · Hotel Centro',
      'Serviço',
      'Split 12k',
      'Ana Técnica',
      'Fornecedor Frio Bom',
      'Locador',
      'Custo informado',
      'Sem códigos de falha, causa e solução informados.',
      'Aceita com assinatura',
      'data-foto="f1"',
    ]) {
      expect(html).toContain(texto);
    }
    expect(html).toMatch(/R\$.350,00/);
  });

  it('para o proprietário, o custo não sai na folha', () => {
    const html = renderizar(
      'pt-BR',
      folha(impressao({ custoOculto: true, os: { ...impressao().os, custoInformado: null } })),
    );
    expect(html).not.toContain('Custo informado');
    expect(html).toContain('data-custo-oculto="true"');
    expect(html).toContain('Sem fotos nesta OS.');
  });

  it('a preventiva mostra o plano, e a cancelada não tem aceite', () => {
    const html = renderizar(
      'pt-BR',
      folha(
        impressao({
          descricao: null,
          aceite: null,
          os: {
            ...impressao().os,
            chamadoId: null,
            estado: 'cancelada',
            preventiva: {
              planoId: '33333333-3333-4333-8333-333333333333',
              planoNome: 'PMOC mensal',
              ativoId: '44444444-4444-4444-8444-444444444444',
              dataPrevista: '2026-10-20',
            },
          },
        }),
      ),
    );
    expect(html).toContain('Preventiva do plano PMOC mensal, prevista para 20/10/2026');
    expect(html).not.toContain('data-secao="aceite"');
  });
});
