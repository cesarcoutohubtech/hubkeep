// Aceite da F0-11 (aparelho): a operação feita sem rede fica na fila do
// IndexedDB e é enviada quando a rede volta, sem duplicar. O servidor falso
// guarda as chaves como a API (ADR-025): reenvio de chave conhecida não
// aplica de novo. O envio é o de verdade (src/api.ts), sobre um fetch falso.
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';
import { criarEnvio } from '../src/api';
import { type FilaDeOperacoes, abrirFila } from '../src/fila/banco';
import { ESPERA_INICIAL_MS, sincronizar } from '../src/fila/sincronizar';

/** Servidor falso: aplica uma vez por chave, como POST /api/v1/sincronizacao/operacoes. */
function servidor() {
  const aplicadas: string[] = [];
  const chaves = new Set<string>();
  let rede = true;
  /** Aplica e perde a resposta no caminho de volta (o caso que exige idempotência). */
  let perderProximaResposta = false;
  const fetchFalso: typeof fetch = async (_url, init) => {
    if (!rede) throw new TypeError('Failed to fetch');
    const corpo = JSON.parse(String(init?.body)) as {
      chave: string;
      dados: { idioma: string | null; fuso: string | null };
    };
    if (corpo.dados.fuso === 'America/Atlantida') {
      return new Response(JSON.stringify({ erro: { codigo: 'fuso_invalido' } }), {
        status: 422,
      });
    }
    const repetida = chaves.has(corpo.chave);
    if (!repetida) {
      chaves.add(corpo.chave);
      aplicadas.push(String(corpo.dados.idioma));
    }
    if (perderProximaResposta) {
      perderProximaResposta = false;
      throw new TypeError('Failed to fetch');
    }
    return new Response(
      JSON.stringify({ chave: corpo.chave, repetida, resposta: { aplicada: true } }),
      { status: repetida ? 200 : 201 },
    );
  };
  return {
    aplicadas,
    fetchFalso,
    semRede: () => void (rede = false),
    comRede: () => void (rede = true),
    perderResposta: () => void (perderProximaResposta = true),
  };
}

const credenciais = { token: async () => 'token', tenant: () => 'tenant' };
const preferencia = (idioma: string, fuso: string | null = null) => ({
  tipo: 'preferencias.gravar' as const,
  dados: { idioma: idioma as 'es', formatoRegional: null, fuso },
});

let fila: FilaDeOperacoes;
beforeEach(async () => {
  // Um IndexedDB novo por teste.
  globalThis.indexedDB = new IDBFactory();
  fila = await abrirFila();
});

describe('fila offline no IndexedDB', () => {
  it('a operação feita sem rede fica guardada, inclusive depois de fechar o app', async () => {
    await fila.enfileirar(preferencia('es'), 1_000);
    fila.fechar();
    const reaberta = await abrirFila();
    const todas = await reaberta.todas();
    expect(todas).toHaveLength(1);
    expect(todas[0]).toMatchObject({ tipo: 'preferencias.gravar', estado: 'pendente' });
    expect(todas[0]?.chave).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('sincronização', () => {
  it('sem rede, nada sai; quando a rede volta, a operação é enviada uma vez e sai da fila', async () => {
    const s = servidor();
    const enviar = criarEnvio(credenciais, s.fetchFalso);
    await fila.enfileirar(preferencia('es'), 1_000);

    s.semRede();
    const semRede = await sincronizar(fila, enviar, { agora: () => 1_000 });
    expect(semRede).toEqual({ enviadas: 0, recusadas: 0, adiadas: 1 });
    expect((await fila.todas())[0]).toMatchObject({ tentativas: 1, ultimoErro: 'sem_rede' });

    s.comRede();
    const comRede = await sincronizar(fila, enviar, { agora: () => 2_000, ignorarEspera: true });
    expect(comRede.enviadas).toBe(1);
    expect(await fila.todas()).toEqual([]);
    expect(s.aplicadas).toEqual(['es']);
  });

  it('resposta perdida: o reenvio da mesma chave não aplica de novo', async () => {
    const s = servidor();
    const enviar = criarEnvio(credenciais, s.fetchFalso);
    await fila.enfileirar(preferencia('fr'), 1_000);

    s.perderResposta();
    await sincronizar(fila, enviar, { agora: () => 1_000 });
    expect(await fila.todas()).toHaveLength(1); // o aparelho não sabe que chegou

    await sincronizar(fila, enviar, { agora: () => 1_000, ignorarEspera: true });
    expect(await fila.todas()).toEqual([]);
    expect(s.aplicadas).toEqual(['fr']); // uma vez só
  });

  it('mantém a ordem: com a primeira esperando, a segunda não passa na frente', async () => {
    const s = servidor();
    const enviar = criarEnvio(credenciais, s.fetchFalso);
    await fila.enfileirar(preferencia('es'), 1_000);
    await fila.enfileirar(preferencia('fr'), 1_001);

    s.semRede();
    await sincronizar(fila, enviar, { agora: () => 1_000 });
    s.comRede();
    // Ainda dentro da espera da primeira: nenhuma sai.
    const cedo = await sincronizar(fila, enviar, { agora: () => 1_000 + ESPERA_INICIAL_MS - 1 });
    expect(cedo).toEqual({ enviadas: 0, recusadas: 0, adiadas: 2 });
    // Passada a espera: as duas, na ordem em que foram feitas.
    await sincronizar(fila, enviar, { agora: () => 1_000 + ESPERA_INICIAL_MS });
    expect(s.aplicadas).toEqual(['es', 'fr']);
  });

  it('espera dobra a cada falha de rede', async () => {
    const s = servidor();
    const enviar = criarEnvio(credenciais, s.fetchFalso);
    await fila.enfileirar(preferencia('es'), 0);
    s.semRede();
    await sincronizar(fila, enviar, { agora: () => 0 });
    await sincronizar(fila, enviar, { agora: () => 0, ignorarEspera: true });
    const [op] = await fila.todas();
    expect(op?.tentativas).toBe(2);
    expect(op?.proximaTentativaEm).toBe(2 * ESPERA_INICIAL_MS);
  });

  it('recusada pela API (422): fica como rejeitada, não é reenviada e não trava as outras', async () => {
    const s = servidor();
    const enviar = criarEnvio(credenciais, s.fetchFalso);
    await fila.enfileirar(preferencia('es', 'America/Atlantida'), 1_000);
    await fila.enfileirar(preferencia('fr'), 1_001);
    const r = await sincronizar(fila, enviar);
    expect(r).toEqual({ enviadas: 1, recusadas: 1, adiadas: 0 });
    expect(await fila.todas()).toMatchObject([
      { estado: 'rejeitada', ultimoErro: 'fuso_invalido' },
    ]);
    expect((await sincronizar(fila, enviar)).enviadas).toBe(0);
    expect(s.aplicadas).toEqual(['fr']);
  });

  it('fora do contrato: recusada no aparelho, sem ir à rede', async () => {
    const s = servidor();
    const enviar = criarEnvio(credenciais, s.fetchFalso);
    await fila.enfileirar(preferencia('xx'), 1_000);
    s.semRede();
    expect((await sincronizar(fila, enviar)).recusadas).toBe(1);
    expect((await fila.todas())[0]?.ultimoErro).toBe('entrada_invalida');
  });

  it('duas passadas ao mesmo tempo (online + botão) enviam uma vez', async () => {
    const s = servidor();
    const enviar = criarEnvio(credenciais, s.fetchFalso);
    await fila.enfileirar(preferencia('es'), 1_000);
    await Promise.all([sincronizar(fila, enviar), sincronizar(fila, enviar)]);
    expect(s.aplicadas).toEqual(['es']);
  });

  it('sem sessão, a operação espera (não é recusada nem perdida)', async () => {
    const s = servidor();
    const enviar = criarEnvio({ token: async () => null, tenant: () => null }, s.fetchFalso);
    await fila.enfileirar(preferencia('es'), 1_000);
    await sincronizar(fila, enviar);
    expect((await fila.todas())[0]).toMatchObject({ estado: 'pendente', ultimoErro: 'sem_sessao' });
  });
});
