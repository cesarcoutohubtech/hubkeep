// Histórico do registro (fase 1a, D1): as mudanças que cada linha da auditoria
// mostra, com os formatos que os repositórios gravam de verdade.
import { describe, expect, it } from 'vitest';
import { mudancasDaAuditoria, mudancasVisiveis, referenciasDasMudancas } from '../src/auditoria';

const S1 = 'situacao-1';
const S2 = 'situacao-2';

describe('mudanças de uma linha da auditoria', () => {
  it('criação: os campos gravados, sem os nulos, a versão nem a cópia da política', () => {
    expect(
      mudancasDaAuditoria(null, {
        localId: 'l1',
        ativoId: null,
        descricao: 'Chuveiro frio',
        estado: 'aberto',
        politicaAplicada: { prazo: 4 },
        versao: 1,
      }),
    ).toEqual([
      { campo: 'localId', chave: null, antes: null, depois: 'l1' },
      { campo: 'descricao', chave: null, antes: null, depois: 'Chuveiro frio' },
      { campo: 'estado', chave: null, antes: null, depois: 'aberto' },
    ]);
  });

  it('o antes com o nome da coluna e o depois com o do domínio viram o mesmo campo', () => {
    // Triagem: o repositório lê estado, situacao_id, prioridade_id e versao.
    expect(
      mudancasDaAuditoria(
        { estado: 'aberto', situacao_id: S1, prioridade_id: 'p1', versao: 1 },
        { acao: 'triar', estado: 'em_triagem', situacaoId: S2, versao: 2 },
      ),
    ).toEqual([
      { campo: 'estado', chave: null, antes: 'aberto', depois: 'em_triagem' },
      { campo: 'situacaoId', chave: null, antes: S1, depois: S2 },
    ]);
  });

  it('só o que o depois grava: o resto do antes não vira mudança', () => {
    expect(
      mudancasDaAuditoria({ nome: 'UH 101', andar: '1', status: 'ativo' }, { status: 'inativo' }),
    ).toEqual([{ campo: 'status', chave: null, antes: 'ativo', depois: 'inativo' }]);
  });

  it('valores iguais dos dois lados não aparecem', () => {
    expect(mudancasDaAuditoria({ nome: 'A', andar: '2' }, { nome: 'A', andar: '3' })).toEqual([
      { campo: 'andar', chave: null, antes: '2', depois: '3' },
    ]);
  });

  it('reatribuição: o responsável vira técnico e equipe, como as colunas da OS', () => {
    expect(
      mudancasDaAuditoria(
        { estado: 'atribuida', situacao_id: S1, tecnico_id: 'u1', equipe_id: null, versao: 2 },
        { responsavel: { tipo: 'equipe', equipeId: 'e1' }, situacaoId: S1, versao: 3 },
      ),
    ).toEqual([
      { campo: 'tecnicoId', chave: null, antes: 'u1', depois: null },
      { campo: 'equipeId', chave: null, antes: null, depois: 'e1' },
    ]);
  });

  it('campos estendidos do ativo: uma mudança por chave, inclusive a que saiu', () => {
    expect(
      mudancasDaAuditoria(
        { nome: 'Split', campos: { potencia: 9000, voltagem: '220', cor: 'branco' } },
        { nome: 'Split', campos: { potencia: 12000, voltagem: '220' } },
      ),
    ).toEqual([
      { campo: 'campos', chave: 'potencia', antes: 9000, depois: 12000 },
      { campo: 'campos', chave: 'cor', antes: 'branco', depois: null },
    ]);
  });

  it('remoção: sem depois, os campos do antes', () => {
    expect(mudancasDaAuditoria({ caminho: 'x/y.jpg', ativo: null }, null)).toEqual([
      { campo: 'caminho', chave: null, antes: 'x/y.jpg', depois: null },
    ]);
  });

  it('o chamado da OS, o registro e o hotel não viram mudança', () => {
    expect(
      mudancasDaAuditoria(null, { id: 'o1', hotelId: 'h1', chamadoId: 'c1', situacaoId: 's1' }),
    ).toEqual([{ campo: 'situacaoId', chave: null, antes: null, depois: 's1' }]);
  });

  it('lista vira texto, sem quebrar a tela', () => {
    expect(mudancasDaAuditoria(null, { opcoes: ['a', 'b'] })).toEqual([
      { campo: 'opcoes', chave: null, antes: null, depois: '["a","b"]' },
    ]);
  });

  it('antes e depois ausentes ou fora do formato: nenhuma mudança', () => {
    expect(mudancasDaAuditoria(null, null)).toEqual([]);
    expect(mudancasDaAuditoria('x', 3)).toEqual([]);
  });
});

describe('o que o histórico mostra', () => {
  it('a ativação bloqueada não mostra o uso da licença', () => {
    const uso = { hoteis: { usados: 3, contratados: 3 } };
    expect(mudancasVisiveis('hotel', 'ativacao_bloqueada_sem_saldo', null, uso)).toEqual([]);
    expect(
      mudancasVisiveis('hotel', 'ativar', { status: 'em_implantacao' }, { status: 'ativo' }),
    ).toHaveLength(1);
  });

  it('os ids das mudanças, com o tipo de registro, para buscar os nomes', () => {
    const r = referenciasDasMudancas([
      { campo: 'tecnicoId', chave: null, antes: 'u1', depois: null },
      { campo: 'equipeId', chave: null, antes: null, depois: 'e1' },
      { campo: 'situacaoId', chave: null, antes: S1, depois: S2 },
      { campo: 'campos', chave: 'localId', antes: null, depois: 'nao-e-referencia' },
      { campo: 'nome', chave: null, antes: 'a', depois: 'b' },
    ]);
    expect(Object.fromEntries(r)).toEqual({
      u1: 'pessoa',
      e1: 'equipe',
      [S1]: 'situacao',
      [S2]: 'situacao',
    });
  });
});
