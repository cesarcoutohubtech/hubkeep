// Painel Mews V1: contrato mínimo e renderização inicial nos quatro idiomas.
import {
  LinhaDoStatusMewsApi,
  RespostaDoStatusMews,
  RespostaDeCandidatosMews,
} from '@hubkeep/contratos';
import { IDIOMAS, mensagensDe } from '@hubkeep/i18n';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ProvedorDeIdioma } from '../src/i18n/cliente';
import PainelAdministrativoMews from '../src/app/(painel)/admin/mews/page';
import { CandidatosMewsDemo } from '../src/app/(painel)/admin/mews/candidatos';

describe('Mews V1: somente leitura administrativa', () => {
  it.each(IDIOMAS)('renderiza estado inicial no idioma %s', (idioma) => {
    const html = renderToString(
      <ProvedorDeIdioma idioma={idioma} mensagens={mensagensDe(idioma)} pseudoLiberado={false}>
        <PainelAdministrativoMews />
      </ProvedorDeIdioma>,
    );
    expect(html).toContain(mensagensDe(idioma)['comum.carregando']);
    expect(html).not.toContain('<h1');
    expect(html).not.toContain('<button');
  });

  it('contrato aceita apenas os campos técnicos aprovados para leitura', () => {
    const exemplo = {
      hotelId: 'ca200000-0000-0000-0000-000000000001',
      nome: 'Hotel de teste',
      versao: '3',
      ultimoUpdatedUtc: '2026-10-17T19:00:00.000Z',
      ultimoSweepUtc: null,
      concluidoEm: '2026-10-17T19:00:01.000Z',
      recursosAtivos: 120,
      bloqueiosOutOfOrder: 2,
      bloqueiosInternalUse: 1,
    };
    expect(RespostaDoStatusMews.parse({ hoteis: [exemplo] }).hoteis[0]).toEqual(exemplo);
    expect(LinhaDoStatusMewsApi.safeParse({ ...exemplo, recursosAtivos: -1 }).success).toBe(false);
    // Zod remove chaves desconhecidas; nenhuma delas entra na resposta.
    const sanitizado = LinhaDoStatusMewsApi.parse({
      ...exemplo,
      credencial_ref: 'nao-pode-sair',
      digest_incremental: 'nao-pode-sair',
      resource_id: 'nao-pode-sair',
      enterprise_id: 'nao-pode-sair',
      block_id: 'nao-pode-sair',
    });
    expect(sanitizado).toEqual(exemplo);
  });

  it.each(IDIOMAS)('pré-seleção Mews começa sem ações de escrita no idioma %s', (idioma) => {
    const html = renderToString(
      <ProvedorDeIdioma idioma={idioma} mensagens={mensagensDe(idioma)} pseudoLiberado={false}>
        <CandidatosMewsDemo />
      </ProvedorDeIdioma>,
    );
    expect(html).toContain(mensagensDe(idioma)['comum.carregando']);
    expect(html).not.toContain('<button');
    expect(html).not.toContain('resource_id');
  });

  it('DTO Mews de candidatos não exporta dados de propriedade ou credencial', () => {
    const exemplo = {
      hotelId: 'ca200000-0000-0000-0000-000000000001',
      nome: 'Hotel Demonstração Centro',
      status: 'ativo',
      vinculo: 'nenhum',
      candidato: true,
    };
    const resposta = RespostaDeCandidatosMews.parse({
      hoteis: [
        { ...exemplo, enterprise_id: 'privado', credencial_ref: 'privado', tenant_id: 'privado' },
      ],
      truncado: false,
    });
    expect(resposta).toEqual({ hoteis: [exemplo], truncado: false });
    expect(
      RespostaDeCandidatosMews.safeParse({
        hoteis: [{ ...exemplo, vinculo: 'outro' }],
        truncado: false,
      }).success,
    ).toBe(false);
  });
});
