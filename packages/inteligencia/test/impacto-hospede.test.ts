// O Guest Impact Score v1 (ADR-047; Cesar e Kaio, 17/10/2026, D1 a D4): as
// reclamações de manutenção ligadas ao ativo, só a ligação confirmada pesa,
// e o hotel sem reclamação na janela fica com a porcentagem dos chamados.
import { IDIOMAS, criarTradutor } from '@hubkeep/i18n';
import { describe, expect, it } from 'vitest';
import {
  PADRAO_IMPACTO_HOSPEDE,
  type SinalDaFonte,
  VERSAO_IMPACTO_HOSPEDE,
  atencaoDoAtivo,
  configImpactoHospedeValida,
  detalhamentoDoScore,
  explicacaoDoScore,
  guestImpactScore,
  hoteisComReclamacao,
  impactoNoHospede,
  reincidencia,
} from '../src';
import { agora, dia } from './apoio';

let seq = 0;
const sinal = (p: Partial<SinalDaFonte> = {}): SinalDaFonte => {
  seq += 1;
  return {
    id: `s${seq}`,
    hotelId: 'h1',
    ocorridoEm: dia(-5),
    nota: null,
    escala: null,
    manutencao: true,
    categoriaId: 'ar',
    uhId: `uh${seq}`,
    ativoId: 'a1',
    ligacao: 'confirmada',
    ...p,
  };
};
const componente = (s: ReturnType<typeof guestImpactScore>, chave: string) =>
  s.componentes.find((c) => c.chave === chave);

describe('Guest Impact Score v1', () => {
  it('o padrão: 90 dias, 5 reclamações, 3 depois do reparo, 3 UHs e os pesos do PRD', () => {
    expect(VERSAO_IMPACTO_HOSPEDE).toBe(1);
    expect(PADRAO_IMPACTO_HOSPEDE).toMatchObject({
      janelaDias: 90,
      limiteReclamacoes: 5,
      limiteRecorrencia: 3,
      limiteUhs: 3,
      pesos: { volume: 0.3, severidade: 0.25, recorrencia: 0.2, amplitude: 0.15, operacional: 0.1 },
    });
    expect(configImpactoHospedeValida(PADRAO_IMPACTO_HOSPEDE)).toBe(true);
    expect(configImpactoHospedeValida({ ...PADRAO_IMPACTO_HOSPEDE, limiteUhs: 0 })).toBe(false);
  });

  it('cheio: 5 confirmadas de 5 UHs, nota mínima, todas depois do reparo, chamados todos com hóspede', () => {
    const s = guestImpactScore(
      {
        reclamacoes: Array.from({ length: 5 }, () => sinal({ nota: 0, escala: 5 })),
        ultimoReparoEm: dia(-30),
        percentualDosChamados: 100,
      },
      agora,
    );
    expect(s.valor).toBe(100);
    expect(s.faixa).toBe('critico');
  });

  it('só a confirmada pesa; a possível aparece na evidência (D2); fora da janela e sem manutenção, nada', () => {
    const s = guestImpactScore(
      {
        reclamacoes: [
          sinal(),
          sinal({ ligacao: 'possivel' }),
          sinal({ ocorridoEm: dia(-91) }),
          sinal({ manutencao: false }),
          sinal({ ocorridoEm: dia(1) }),
        ],
        ultimoReparoEm: null,
        percentualDosChamados: 0,
      },
      agora,
    );
    expect(componente(s, 'volume')).toMatchObject({
      valor: 0.2,
      evidencia: { confirmadas: 1, possiveis: 1, limite: 5, janelaDias: 90 },
    });
    expect(componente(s, 'amplitude')?.evidencia).toEqual({ uhs: 1, limite: 3 });
  });

  it('sem nota e sem reparo: severidade e recorrência sem dado, e o peso redistribui', () => {
    const s = guestImpactScore(
      { reclamacoes: [sinal(), sinal()], ultimoReparoEm: null, percentualDosChamados: 50 },
      agora,
    );
    expect(s.ausentes).toEqual(['severidade', 'recorrencia']);
    // volume 2/5 × 0,30, amplitude 2/3 × 0,15, operacional 0,5 × 0,10, sobre 0,55.
    expect(s.valor).toBe(Math.round(((0.4 * 0.3 + (2 / 3) * 0.15 + 0.5 * 0.1) / 0.55) * 100));
  });

  it('a severidade pela nota e a recorrência só depois do último reparo', () => {
    const s = guestImpactScore(
      {
        reclamacoes: [
          sinal({ nota: 1, escala: 5, ocorridoEm: dia(-20) }),
          sinal({ nota: 4, escala: 10, ocorridoEm: dia(-5) }),
          sinal({ ocorridoEm: dia(-2) }),
        ],
        ultimoReparoEm: dia(-10),
        percentualDosChamados: 0,
      },
      agora,
    );
    // (1 − 0,2 + 1 − 0,4) / 2 = 0,7; a nota média em 5 é 1,5.
    expect(componente(s, 'severidade')).toMatchObject({
      valor: 0.7,
      evidencia: { comNota: 2, notaMediaEm5: 1.5 },
    });
    expect(componente(s, 'recorrencia')).toMatchObject({
      valor: 2 / 3,
      evidencia: { depoisDoReparo: 2, limite: 3 },
    });
  });
});

describe('o impacto no hóspede da atenção e da substituição (D1)', () => {
  const e = { reclamacoes: [sinal()], ultimoReparoEm: null, percentualDosChamados: 40 };

  it('o hotel sem reclamação na janela fica com a porcentagem dos chamados', () => {
    expect(impactoNoHospede({ ...e, hotelComReclamacao: false }, agora)).toEqual({
      valor: 40,
      fonte: 'chamados',
      score: null,
    });
  });

  it('o hotel com reclamação usa o score, mesmo no ativo sem reclamação ligada', () => {
    const com = impactoNoHospede({ ...e, hotelComReclamacao: true }, agora);
    expect(com.fonte).toBe('reclamacoes');
    expect(com.valor).toBe(com.score?.valor);
    const semLigada = impactoNoHospede(
      {
        reclamacoes: [],
        ultimoReparoEm: null,
        percentualDosChamados: 40,
        hotelComReclamacao: true,
      },
      agora,
    );
    // Só o operacional tem dado além do volume e da amplitude zerados.
    expect(semLigada.valor).toBe(Math.round((0.4 * 0.1 * 100) / 0.55));
  });

  it('o hotel com reclamação é o que tem qualquer reclamação importada na janela dele', () => {
    const hoteis = hoteisComReclamacao(
      [
        sinal({ hotelId: 'h1', ativoId: null, manutencao: null, ligacao: 'sem_ligacao' }),
        sinal({ hotelId: 'h2', ocorridoEm: dia(-40) }),
        sinal({ hotelId: 'h3', ocorridoEm: dia(-100) }),
      ],
      agora,
      (h) => (h === 'h2' ? 30 : 90),
    );
    expect([...hoteis].sort()).toEqual(['h1']);
  });
});

describe('o impacto no hóspede na atenção versão 7', () => {
  const reinc = reincidencia([], agora);
  const atencao = (ih: ReturnType<typeof impactoNoHospede>) =>
    atencaoDoAtivo({ criticidade: 5, reincidencia: reinc, horasParadas: 48, impactoHospede: ih });

  it('pelas reclamações: a evidência com a fonte e o porquê, o motivo e a nota da linha', () => {
    const ih = impactoNoHospede(
      {
        reclamacoes: [
          sinal({ nota: 0, escala: 5 }),
          sinal({ nota: 1, escala: 5 }),
          sinal({ ligacao: 'possivel' }),
        ],
        ultimoReparoEm: null,
        percentualDosChamados: 20,
        hotelComReclamacao: true,
      },
      agora,
    );
    const s = atencao(ih);
    expect(s.versao).toBe(7);
    const c = s.componentes.find((x) => x.chave === 'impacto_hospede');
    expect(c?.evidencia).toMatchObject({
      score: ih.valor,
      fonte: 'reclamacoes',
      versaoImpacto: 1,
      confirmadas: 2,
      possiveis: 1,
      uhs: 2,
      depoisDoReparo: null,
      notaMediaEm5: 0.5,
      percentualDosChamados: 20,
    });
    expect(explicacaoDoScore(s, 10).map((e) => e.chave)).toContain(
      'inteligencia.motivo.atencao_ativo.impacto_hospede_reclamacoes',
    );
    const linha = detalhamentoDoScore(s).linhas.find((l) => l.componente === 'impacto_hospede');
    expect(linha?.nota).toEqual({
      chave: 'inteligencia.detalhamento.impacto_pelas_reclamacoes',
      valores: { confirmadas: 2, possiveis: 1, uhs: 2, janelaDias: 90 },
    });
  });

  it('pelos chamados: a evidência diz a fonte, e o motivo é o de antes', () => {
    const s = atencao({ valor: 50, fonte: 'chamados', score: null });
    const c = s.componentes.find((x) => x.chave === 'impacto_hospede');
    expect(c?.evidencia).toEqual({ score: 50, fonte: 'chamados' });
    expect(explicacaoDoScore(s, 10).map((e) => e.chave)).toContain(
      'inteligencia.motivo.atencao_ativo.impacto_hospede',
    );
    expect(
      detalhamentoDoScore(s).linhas.find((l) => l.componente === 'impacto_hospede')?.nota,
    ).toEqual({ chave: 'inteligencia.detalhamento.impacto_pelos_chamados', valores: {} });
  });

  it.each(IDIOMAS)('%s: as frases do impacto formatam pelo catálogo', (idioma) => {
    const { t } = criarTradutor(idioma);
    for (const [chave, valores] of [
      ['inteligencia.motivo.atencao_ativo.impacto_hospede_reclamacoes', { score: 64 }],
      [
        'inteligencia.detalhamento.impacto_pelas_reclamacoes',
        { confirmadas: 2, possiveis: 1, uhs: 2, janelaDias: 90 },
      ],
      ['inteligencia.detalhamento.impacto_pelos_chamados', {}],
      ['inteligencia.substituicao.valor', { chave: 'impactoHospede', valor: 64 }],
    ] as const)
      expect(t(chave, valores)).not.toMatch(/[{}]|^$/);
  });
});
