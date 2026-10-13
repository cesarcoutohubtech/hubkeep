// Campos da instrumentação (I4): o fornecedor pelo id, o custo informado das
// corretivas encerradas na janela (com e sem o dado) e o impacto no hóspede
// pelo indicador do chamado, sempre disponível (respostas de 10/10/2026).
import { describe, expect, it } from 'vitest';
import {
  type Score,
  atencaoDoAtivo,
  fornecedorDaOs,
  custoNaJanela,
  impactoHospedeDosChamados,
} from '../src';
import { agora, corretiva, dia } from './apoio';

describe('impacto no hóspede pelo indicador do chamado', () => {
  const cs = [
    corretiva({ abertaEm: dia(-10), impactoHospede: true }),
    corretiva({ abertaEm: dia(-20), impactoHospede: false }),
    corretiva({ abertaEm: dia(-30), impactoHospede: false }),
    corretiva({ abertaEm: dia(-40), impactoHospede: true }),
    // Sem a marca e anterior à migração: contam como "não teve".
    corretiva({ abertaEm: dia(-5), impactoHospede: null }),
    corretiva({ abertaEm: dia(-6) }),
    // Fora da janela: não entra.
    corretiva({ abertaEm: dia(-200), impactoHospede: true }),
  ];

  it('porcentagem dos chamados da janela que afetaram hóspede; não marcado é "não teve"', () => {
    // 2 de 6.
    expect(impactoHospedeDosChamados(cs, agora, 90)).toBe(33.3);
  });

  it('só chamados sem marca: 0, e não sem dado', () => {
    expect(impactoHospedeDosChamados(cs.slice(4, 6), agora, 90)).toBe(0);
  });

  it('sem chamado na janela: 0', () => {
    expect(impactoHospedeDosChamados([], agora, 90)).toBe(0);
    expect(impactoHospedeDosChamados(cs.slice(6), agora, 90)).toBe(0);
  });

  it('entra na atenção por ativo como o componente de impacto no hóspede', () => {
    const reincidencia: Score = {
      chave: 'reincidencia',
      versao: 1,
      valor: 77,
      faixa: 'alta_atencao',
      componentes: [],
      ausentes: [],
      configuracao: {},
    };
    const s = atencaoDoAtivo({
      criticidade: null,
      reincidencia,
      horasParadas: 24,
      impactoHospede: impactoHospedeDosChamados(cs, agora, 90),
    });
    // Garantia sem data conta 0 e tem peso: (0,154 + 0,075 + 0,333 × 0,15 + 0) / 0,55 = 51.
    expect(s.valor).toBe(51);
    expect(s.ausentes).not.toContain('impacto_hospede');
  });
});

describe('fornecedor da OS', () => {
  it('é o id do cadastro, só quando a OS foi executada por fornecedor', () => {
    expect(fornecedorDaOs({ executadoPor: 'fornecedor', fornecedorId: 'f1' })).toBe('f1');
  });

  it('equipe interna, fornecedor sem id e OS anterior ao cadastro não têm chave', () => {
    expect(fornecedorDaOs({ executadoPor: 'equipe_interna', fornecedorId: 'f1' })).toBeNull();
    expect(fornecedorDaOs({ executadoPor: 'fornecedor', fornecedorId: null })).toBeNull();
    expect(fornecedorDaOs({ executadoPor: 'fornecedor' })).toBeNull();
    expect(fornecedorDaOs({})).toBeNull();
  });
});
describe('custo informado na janela', () => {
  it('soma o custo das corretivas aceitas na janela que têm o dado, e conta as duas', () => {
    const cs = [
      corretiva({
        abertaEm: dia(-40),
        concluidaEm: dia(-38),
        aceitaEm: dia(-37),
        custoInformado: 1200.5,
      }),
      corretiva({
        abertaEm: dia(-20),
        concluidaEm: dia(-19),
        aceitaEm: dia(-19),
        custoInformado: 300,
      }),
      // Aceita sem o custo: conta em aceitas, não em informadas.
      corretiva({
        abertaEm: dia(-10),
        concluidaEm: dia(-9),
        aceitaEm: dia(-8),
        custoInformado: null,
      }),
      corretiva({ abertaEm: dia(-12), concluidaEm: dia(-11), aceitaEm: dia(-10) }),
      // Fora da janela, só concluída (ainda sem aceite) e sem conclusão: não contam.
      corretiva({
        abertaEm: dia(-400),
        concluidaEm: dia(-399),
        aceitaEm: dia(-398),
        custoInformado: 9000,
      }),
      corretiva({ abertaEm: dia(-6), concluidaEm: dia(-5), custoInformado: 700 }),
      corretiva({ abertaEm: dia(-5), concluidaEm: null, custoInformado: 500 }),
    ];
    expect(custoNaJanela(cs, agora, 365)).toEqual({ soma: 1500.5, informadas: 2, aceitas: 4 });
  });

  it('a corretiva concluída na janela e aceita depois dela conta pelo aceite', () => {
    const cs = [
      corretiva({
        abertaEm: dia(-370),
        concluidaEm: dia(-366),
        aceitaEm: dia(-360),
        custoInformado: 80,
      }),
    ];
    expect(custoNaJanela(cs, agora, 365)).toEqual({ soma: 80, informadas: 1, aceitas: 1 });
  });

  it('ninguém informou custo: soma 0, com 0 informadas', () => {
    const cs = [corretiva({ abertaEm: dia(-10), concluidaEm: dia(-9), aceitaEm: dia(-9) })];
    expect(custoNaJanela(cs, agora, 365)).toEqual({ soma: 0, informadas: 0, aceitas: 1 });
  });

  it('custo zero informado conta como informado', () => {
    const cs = [
      corretiva({ abertaEm: dia(-10), concluidaEm: dia(-9), aceitaEm: dia(-9), custoInformado: 0 }),
    ];
    expect(custoNaJanela(cs, agora, 365)).toEqual({ soma: 0, informadas: 1, aceitas: 1 });
  });
});
