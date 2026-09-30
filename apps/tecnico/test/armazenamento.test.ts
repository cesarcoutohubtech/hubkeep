// Espaço do aparelho (adendo ao ADR-025, C4b): persistência, aviso de
// pendência antiga, teto das fotos e confirmação ao sair com pendente.
import { describe, expect, it } from 'vitest';
import {
  FOLGA_DO_ARMAZENAMENTO,
  PENDENCIA_ANTIGA_MS,
  TETO_DAS_FOTOS_NA_FILA,
  bytesDasFotos,
  conferirEspacoParaFoto,
  faltouEspaco,
  pedirPersistencia,
  pendenteAntigaDesde,
} from '../src/armazenamento';
import type { FotoNaFila, OperacaoNaFila } from '../src/fila/banco';
import { podeApagar } from '../src/saida';

const MB = 1024 * 1024;
const AGORA = Date.UTC(2026, 8, 29, 12);

const foto = (mb: number): Pick<OperacaoNaFila, 'tipo' | 'dados'> => ({
  tipo: 'anexo.foto',
  dados: {
    entidade: 'os',
    registroId: 'os-1',
    arquivoId: 'a',
    miniaturaArquivoId: 'b',
    foto: new ArrayBuffer(mb * MB),
    miniatura: new ArrayBuffer(0),
    nome: null,
  } satisfies FotoNaFila,
});

const horas = { tipo: 'os.apontar_horas', dados: { osId: 'os-1' } } as Pick<
  OperacaoNaFila,
  'tipo' | 'dados'
>;

describe('persistência (a)', () => {
  it('já persistente: não pede de novo', async () => {
    let pediu = false;
    const g = {
      persisted: async () => true,
      persist: async () => ((pediu = true), true),
    };
    expect(await pedirPersistencia(g)).toBe(true);
    expect(pediu).toBe(false);
  });

  it('pede e devolve a resposta do navegador', async () => {
    expect(
      await pedirPersistencia({ persisted: async () => false, persist: async () => true }),
    ).toBe(true);
    expect(
      await pedirPersistencia({ persisted: async () => false, persist: async () => false }),
    ).toBe(false);
  });

  it('sem a API ou com erro: false, sem quebrar', async () => {
    expect(await pedirPersistencia(null)).toBe(false);
    expect(await pedirPersistencia({})).toBe(false);
    expect(
      await pedirPersistencia({
        persisted: async () => {
          throw new Error('negado');
        },
      }),
    ).toBe(false);
  });
});

describe('pendência antiga (a)', () => {
  const op = (estado: OperacaoNaFila['estado'], idadeMs: number) => ({
    estado,
    criadaEm: AGORA - idadeMs,
  });

  it('avisa a partir de um dia, com a data da mais velha', () => {
    expect(pendenteAntigaDesde([], AGORA)).toBeNull();
    expect(pendenteAntigaDesde([op('pendente', PENDENCIA_ANTIGA_MS - 1)], AGORA)).toBeNull();
    expect(
      pendenteAntigaDesde(
        [op('pendente', 1000), op('pendente', PENDENCIA_ANTIGA_MS), op('pendente', 5000)],
        AGORA,
      ),
    ).toBe(AGORA - PENDENCIA_ANTIGA_MS);
  });

  it('recusada não conta: já voltou do servidor e aparece como recusada', () => {
    expect(pendenteAntigaDesde([op('rejeitada', 3 * PENDENCIA_ANTIGA_MS)], AGORA)).toBeNull();
  });
});

describe('teto de espaço das fotos (b)', () => {
  const folgado = { estimate: async () => ({ quota: 1000 * MB, usage: 10 * MB }) };

  it('soma só as fotos (foto e miniatura)', () => {
    expect(bytesDasFotos([foto(2), horas, foto(3)])).toBe(5 * MB);
  });

  it('abaixo do teto e com espaço: passa', async () => {
    await expect(conferirEspacoParaFoto([foto(10), horas], MB, folgado)).resolves.toBeUndefined();
  });

  it('passaria do teto das fotos na fila: fotos_na_fila_no_limite', async () => {
    const cheia = [foto(TETO_DAS_FOTOS_NA_FILA / MB - 1)];
    await expect(conferirEspacoParaFoto(cheia, MB, folgado)).resolves.toBeUndefined();
    await expect(conferirEspacoParaFoto(cheia, MB + 1, folgado)).rejects.toMatchObject({
      codigo: 'fotos_na_fila_no_limite',
    });
  });

  it('sem espaço livre no aparelho (com a folga): espaco_insuficiente', async () => {
    const justo = {
      estimate: async () => ({ quota: 100 * MB, usage: 100 * MB - FOLGA_DO_ARMAZENAMENTO - MB }),
    };
    await expect(conferirEspacoParaFoto([], MB, justo)).resolves.toBeUndefined();
    await expect(conferirEspacoParaFoto([], MB + 1, justo)).rejects.toMatchObject({
      codigo: 'espaco_insuficiente',
    });
  });

  it('sem estimativa do navegador: vale só o teto', async () => {
    await expect(conferirEspacoParaFoto([], MB, null)).resolves.toBeUndefined();
    await expect(
      conferirEspacoParaFoto([], MB, { estimate: async () => ({}) }),
    ).resolves.toBeUndefined();
    await expect(
      conferirEspacoParaFoto([], MB, {
        estimate: async () => {
          throw new Error('indisponível');
        },
      }),
    ).resolves.toBeUndefined();
  });

  it('erro de cota do IndexedDB é reconhecido', () => {
    expect(faltouEspaco(new DOMException('cheio', 'QuotaExceededError'))).toBe(true);
    expect(faltouEspaco(new DOMException('outro', 'AbortError'))).toBe(false);
    expect(faltouEspaco(new Error('QuotaExceededError'))).toBe(false);
  });
});

describe('sair com pendente (c)', () => {
  const filaCom = (estados: OperacaoNaFila['estado'][]) => ({
    doUsuario: async () => estados.map((estado) => ({ estado }) as OperacaoNaFila),
  });

  it('sem pendente: sai sem perguntar', async () => {
    const perguntas: number[] = [];
    const confirmar = (n: number) => (perguntas.push(n), false);
    expect(await podeApagar(filaCom([]), 'u', confirmar)).toBe(true);
    expect(await podeApagar(filaCom(['rejeitada']), 'u', confirmar)).toBe(true);
    expect(perguntas).toEqual([]);
  });

  it('com pendente: pergunta com a quantidade, e só apaga se confirmar', async () => {
    const perguntas: number[] = [];
    const fila = filaCom(['pendente', 'rejeitada', 'pendente']);
    expect(await podeApagar(fila, 'u', (n) => (perguntas.push(n), false))).toBe(false);
    expect(await podeApagar(fila, 'u', (n) => (perguntas.push(n), true))).toBe(true);
    expect(perguntas).toEqual([2, 2]);
  });
});
