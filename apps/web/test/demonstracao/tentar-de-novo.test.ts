// A nova tentativa da gravação do histórico (tentar-de-novo.ts), sem banco.
import { describe, expect, it } from 'vitest';
import { ConexaoPerdida, comNovaTentativa, ehQuedaDeConexao } from './tentar-de-novo';

const queda = () => new Error('Connection terminated unexpectedly');
const opcoes = (esperas: number[]) => {
  const linhas: string[] = [];
  return {
    linhas,
    o: {
      descricao: 'a operação 7',
      comoContinuar: 'Rode de novo.',
      log: (l: string) => linhas.push(l),
      esperasMs: [1, 2, 3],
      esperar: async (ms: number) => {
        esperas.push(ms);
      },
    },
  };
};

describe('ehQuedaDeConexao', () => {
  it('reconhece a queda pela mensagem, pelo código e pela causa', () => {
    expect(ehQuedaDeConexao(queda())).toBe(true);
    expect(ehQuedaDeConexao(Object.assign(new Error('read'), { code: 'ECONNRESET' }))).toBe(true);
    expect(ehQuedaDeConexao(Object.assign(new Error('x'), { code: '57P01' }))).toBe(true);
    expect(ehQuedaDeConexao(new Error('falhou', { cause: queda() }))).toBe(true);
  });

  it('não confunde erro do dado ou da regra com queda', () => {
    expect(ehQuedaDeConexao(new Error('versao_desatualizada'))).toBe(false);
    expect(ehQuedaDeConexao(Object.assign(new Error('dup'), { code: '23505' }))).toBe(false);
    expect(ehQuedaDeConexao(Object.assign(new Error('timeout'), { code: '57014' }))).toBe(false);
    expect(ehQuedaDeConexao(undefined)).toBe(false);
  });
});

describe('comNovaTentativa', () => {
  it('tenta de novo depois de cada queda, com a espera crescente, até dar certo', async () => {
    const esperas: number[] = [];
    const { o, linhas } = opcoes(esperas);
    let vezes = 0;
    const r = await comNovaTentativa(async () => {
      vezes += 1;
      if (vezes < 3) throw queda();
      return 'ok';
    }, o);
    expect(r).toBe('ok');
    expect(vezes).toBe(3);
    expect(esperas).toEqual([1, 2]);
    expect(linhas).toHaveLength(2);
  });

  it('para com mensagem clara quando todas as tentativas caem', async () => {
    const esperas: number[] = [];
    const { o } = opcoes(esperas);
    let vezes = 0;
    const r = comNovaTentativa(async () => {
      vezes += 1;
      throw queda();
    }, o);
    await expect(r).rejects.toBeInstanceOf(ConexaoPerdida);
    await expect(r).rejects.toThrow(/caiu 4 vezes seguidas em a operação 7.*Rode de novo\./);
    expect(vezes).toBe(4);
    expect(esperas).toEqual([1, 2, 3]);
  });

  it('não tenta de novo um erro que não é queda de conexão', async () => {
    const esperas: number[] = [];
    const { o } = opcoes(esperas);
    let vezes = 0;
    const r = comNovaTentativa(async () => {
      vezes += 1;
      throw new Error('regra');
    }, o);
    await expect(r).rejects.toThrow('regra');
    expect(vezes).toBe(1);
    expect(esperas).toEqual([]);
  });
});
