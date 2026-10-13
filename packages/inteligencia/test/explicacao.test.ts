// "Por que estou vendo isso?" (ADR-034): todo motivo que o motor pode devolver
// tem mensagem nos quatro catálogos e formata com os valores da evidência.
import { CATALOGOS, type Chave, IDIOMAS, criarTradutor } from '@hubkeep/i18n';
import { describe, expect, it } from 'vitest';
import {
  FAIXAS_PADRAO,
  type Score,
  atencaoDoAtivo,
  chaveDaFaixa,
  chaveDoNomeDoScore,
  explicacaoDoScore,
  reincidencia,
} from '../src';
import { agora, corretiva, dia } from './apoio';

/** Um ativo com todos os componentes presentes e acima de zero. */
function scoresCheios(): [Score, Score] {
  const cs = Array.from({ length: 6 }, (_, i) =>
    corretiva({
      abertaEm: dia(-1 - i * 5),
      concluidaEm: dia(-i * 5),
      reaberturas: 1,
      codigoFalha: 'compressor',
      aposPreventiva: i % 2 === 0,
    }),
  );
  const r = reincidencia(cs, agora);
  const a = atencaoDoAtivo({
    criticidade: 4,
    reincidencia: r,
    horasParadas: 30.5,
    custo: {
      ativo: { soma: 4_250.75, informadas: 3, aceitas: 4 },
      tenant: { informadas: 30, aceitas: 40 },
    },
    impactoHospede: 50,
    preventivaAtrasada: true,
    medicoes: { foraDaFaixa: 2, total: 5 },
    garantia: { vencida: true, diasVencida: 12 },
  });
  return [r, a];
}

describe('explicacaoDoScore', () => {
  const [r, a] = scoresCheios();

  it('cada componente com dado e pontos vira chave do catálogo, do maior para o menor', () => {
    const todas = [
      ...explicacaoDoScore(r, Number.POSITIVE_INFINITY),
      ...explicacaoDoScore(a, Number.POSITIVE_INFINITY),
    ];
    expect(todas.map((e) => e.chave).sort()).toEqual(
      [
        'inteligencia.motivo.atencao_ativo.criticidade',
        'inteligencia.motivo.atencao_ativo.custo',
        'inteligencia.motivo.atencao_ativo.garantia_vencida',
        'inteligencia.motivo.atencao_ativo.impacto_hospede',
        'inteligencia.motivo.atencao_ativo.medicoes_fora_da_faixa',
        'inteligencia.motivo.atencao_ativo.parada',
        'inteligencia.motivo.atencao_ativo.preventiva_atrasada',
        'inteligencia.motivo.atencao_ativo.reincidencia',
        'inteligencia.motivo.reincidencia.apos_corretiva',
        'inteligencia.motivo.reincidencia.apos_preventiva',
        'inteligencia.motivo.reincidencia.corretivas',
        'inteligencia.motivo.reincidencia.intervalo',
        'inteligencia.motivo.reincidencia.mesma_falha',
        'inteligencia.motivo.reincidencia.reaberturas',
      ].sort(),
    );
    expect(explicacaoDoScore(a)).toHaveLength(3);
  });

  it('os valores são só números e textos da evidência, sem ids nem listas', () => {
    for (const e of explicacaoDoScore(r, Number.POSITIVE_INFINITY))
      for (const v of Object.values(e.valores)) expect(['number', 'string']).toContain(typeof v);
    const voltas = explicacaoDoScore(r, Number.POSITIVE_INFINITY).find((e) =>
      e.chave.endsWith('apos_corretiva'),
    );
    expect(voltas?.valores).not.toHaveProperty('corretivaIds');
  });

  it.each(IDIOMAS)('%s: todo motivo, score e faixa formata pelo catálogo', (idioma) => {
    const { t } = criarTradutor(idioma);
    for (const s of [r, a]) {
      expect(t(chaveDoNomeDoScore(s) as Chave)).not.toBe('');
      for (const e of explicacaoDoScore(s, Number.POSITIVE_INFINITY)) {
        expect(CATALOGOS[idioma]).toHaveProperty([e.chave]);
        expect(t(e.chave as Chave, e.valores)).not.toMatch(/[{}]/);
      }
    }
    for (const f of [...FAIXAS_PADRAO.map((x) => x.chave), 'dados_insuficientes'])
      expect(CATALOGOS[idioma]).toHaveProperty([chaveDaFaixa(f)]);
  });

  it('pt-BR: o texto sai com plural e moeda', () => {
    const { t } = criarTradutor('pt-BR');
    const porChave = new Map(
      explicacaoDoScore(a, Number.POSITIVE_INFINITY).map((e) => [e.chave, e.valores]),
    );
    expect(
      t(
        'inteligencia.motivo.atencao_ativo.criticidade',
        porChave.get('inteligencia.motivo.atencao_ativo.criticidade'),
      ),
    ).toBe('Criticidade 4 de 5');
    expect(
      t(
        'inteligencia.motivo.atencao_ativo.custo',
        porChave.get('inteligencia.motivo.atencao_ativo.custo'),
      ),
    ).toMatch(/R\$\s?4\.250,75/);
    expect(
      t('inteligencia.motivo.reincidencia.corretivas', { quantidade: 1, janelaDias: 90 }),
    ).toBe('1 corretiva nos últimos 90 dias');
  });

  it('sem nenhum componente com pontos: lista vazia', () => {
    const vazio = atencaoDoAtivo({
      criticidade: null,
      reincidencia: reincidencia([], agora),
      horasParadas: 0,
    });
    expect(explicacaoDoScore(vazio)).toEqual([]);
  });
});
