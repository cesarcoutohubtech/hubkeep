// Campos da instrumentação (I4): o fornecedor pelo id, o custo
// informado somado na janela e o impacto no hóspede pelo indicador do chamado,
// com null quando ninguém respondeu.
import { describe, expect, it } from 'vitest';
import {
  type Score,
  atencaoDoAtivo,
  fornecedorDaOs,
  custoInformadoNaJanela,
  impactoHospedeDosChamados,
} from '../src';
import { agora, corretiva, dia } from './apoio';

describe('impacto no hóspede pelo indicador do chamado', () => {
  const cs = [
    corretiva({ abertaEm: dia(-10), impactoHospede: true }),
    corretiva({ abertaEm: dia(-20), impactoHospede: false }),
    corretiva({ abertaEm: dia(-30), impactoHospede: false }),
    corretiva({ abertaEm: dia(-40), impactoHospede: true }),
    // "Não sei", anterior à migração e fora da janela: não entram na conta.
    corretiva({ abertaEm: dia(-5), impactoHospede: null }),
    corretiva({ abertaEm: dia(-6) }),
    corretiva({ abertaEm: dia(-200), impactoHospede: true }),
  ];

  it('porcentagem dos chamados respondidos que afetaram hóspede', () => {
    expect(impactoHospedeDosChamados(cs, agora, 90)).toBe(50);
  });

  it('sem nenhuma resposta, null: o componente fica ausente', () => {
    expect(impactoHospedeDosChamados(cs.slice(4, 6), agora, 90)).toBeNull();
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
    // (0,154 + 0,075 + 0,5 × 0,15) / 0,50 = 61.
    expect(s.valor).toBe(61);
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
  it('soma o custo das OS concluídas na janela', () => {
    const cs = [
      corretiva({ abertaEm: dia(-40), concluidaEm: dia(-38), custoInformado: 1200.5 }),
      corretiva({ abertaEm: dia(-20), concluidaEm: dia(-19), custoInformado: 300 }),
      // Fora da janela, sem conclusão e sem custo informado: não somam.
      corretiva({ abertaEm: dia(-400), concluidaEm: dia(-399), custoInformado: 9000 }),
      corretiva({ abertaEm: dia(-5), concluidaEm: null, custoInformado: 500 }),
      corretiva({ abertaEm: dia(-10), concluidaEm: dia(-9), custoInformado: null }),
    ];
    expect(custoInformadoNaJanela(cs, agora, 365)).toBe(1500.5);
  });

  it('ninguém informou custo: null, e não zero', () => {
    const cs = [corretiva({ abertaEm: dia(-10), concluidaEm: dia(-9) })];
    expect(custoInformadoNaJanela(cs, agora, 365)).toBeNull();
  });

  it('custo zero informado conta como informado', () => {
    const cs = [corretiva({ abertaEm: dia(-10), concluidaEm: dia(-9), custoInformado: 0 })];
    expect(custoInformadoNaJanela(cs, agora, 365)).toBe(0);
  });
});
