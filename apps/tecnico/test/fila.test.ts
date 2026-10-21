// Aceite da F0-11 (aparelho): a operação feita sem rede fica na fila do
// IndexedDB e é enviada quando a rede volta, sem duplicar. O servidor falso
// guarda as chaves como a API (ADR-025): reenvio de chave conhecida não
// aplica de novo. O envio é o de verdade (src/api.ts), sobre um fetch falso.
// Ajustes do ADR-025: (a) a operação só sai na sessão de quem a criou;
// (b) sair apaga os dados locais de quem sai; (c) a recusada fica, com o
// código do motivo, até o técnico dispensar.
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EVENTO_DO_SEGUNDO_FATOR, criarEnvio } from '../src/api';
import { type FilaDeOperacoes, abrirFila } from '../src/fila/banco';
import { ESPERA_INICIAL_MS, sincronizar } from '../src/fila/sincronizar';
import { apagarDadosLocais } from '../src/saida';

const A = 'aaaaaaaa-0000-4000-8000-000000000001';
const B = 'bbbbbbbb-0000-4000-8000-000000000002';

/** Servidor falso: aplica uma vez por chave, como POST /api/v1/sincronizacao/operacoes. */
function servidor() {
  const aplicadas: string[] = [];
  /** Token de quem enviou cada operação aplicada. */
  const enviadasPor: string[] = [];
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
      enviadasPor.push(new Headers(init?.headers).get('authorization') ?? '');
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
    enviadasPor,
    fetchFalso,
    semRede: () => void (rede = false),
    comRede: () => void (rede = true),
    perderResposta: () => void (perderProximaResposta = true),
  };
}

const sessaoDe = (usuarioId: string) => ({
  usuarioId: () => usuarioId,
  token: async () => `token-${usuarioId}`,
  tenant: () => 'tenant',
});
const credenciais = sessaoDe(A);
const preferencia = (idioma: string, fuso: string | null = null, usuarioId = A) => ({
  usuarioId,
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
    const todas = await reaberta.doUsuario(A);
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
    const semRede = await sincronizar(fila, enviar, { usuarioId: A, agora: () => 1_000 });
    expect(semRede).toEqual({ enviadas: 0, recusadas: 0, adiadas: 1 });
    expect((await fila.doUsuario(A))[0]).toMatchObject({ tentativas: 1, ultimoErro: 'sem_rede' });

    s.comRede();
    const comRede = await sincronizar(fila, enviar, {
      usuarioId: A,
      agora: () => 2_000,
      ignorarEspera: true,
    });
    expect(comRede.enviadas).toBe(1);
    expect(await fila.doUsuario(A)).toEqual([]);
    expect(s.aplicadas).toEqual(['es']);
  });

  it('resposta perdida: o reenvio da mesma chave não aplica de novo', async () => {
    const s = servidor();
    const enviar = criarEnvio(credenciais, s.fetchFalso);
    await fila.enfileirar(preferencia('fr'), 1_000);

    s.perderResposta();
    await sincronizar(fila, enviar, { usuarioId: A, agora: () => 1_000 });
    expect(await fila.doUsuario(A)).toHaveLength(1); // o aparelho não sabe que chegou

    await sincronizar(fila, enviar, { usuarioId: A, agora: () => 1_000, ignorarEspera: true });
    expect(await fila.doUsuario(A)).toEqual([]);
    expect(s.aplicadas).toEqual(['fr']); // uma vez só
  });

  it('mantém a ordem: com a primeira esperando, a segunda não passa na frente', async () => {
    const s = servidor();
    const enviar = criarEnvio(credenciais, s.fetchFalso);
    await fila.enfileirar(preferencia('es'), 1_000);
    await fila.enfileirar(preferencia('fr'), 1_001);

    s.semRede();
    await sincronizar(fila, enviar, { usuarioId: A, agora: () => 1_000 });
    s.comRede();
    // Ainda dentro da espera da primeira: nenhuma sai.
    const cedo = await sincronizar(fila, enviar, {
      usuarioId: A,
      agora: () => 1_000 + ESPERA_INICIAL_MS - 1,
    });
    expect(cedo).toEqual({ enviadas: 0, recusadas: 0, adiadas: 2 });
    // Passada a espera: as duas, na ordem em que foram feitas.
    await sincronizar(fila, enviar, { usuarioId: A, agora: () => 1_000 + ESPERA_INICIAL_MS });
    expect(s.aplicadas).toEqual(['es', 'fr']);
  });

  it('espera dobra a cada falha de rede', async () => {
    const s = servidor();
    const enviar = criarEnvio(credenciais, s.fetchFalso);
    await fila.enfileirar(preferencia('es'), 0);
    s.semRede();
    await sincronizar(fila, enviar, { usuarioId: A, agora: () => 0 });
    await sincronizar(fila, enviar, { usuarioId: A, agora: () => 0, ignorarEspera: true });
    const [op] = await fila.doUsuario(A);
    expect(op?.tentativas).toBe(2);
    expect(op?.proximaTentativaEm).toBe(2 * ESPERA_INICIAL_MS);
  });

  it('recusada pela API (422): fica como rejeitada, não é reenviada e não trava as outras', async () => {
    const s = servidor();
    const enviar = criarEnvio(credenciais, s.fetchFalso);
    await fila.enfileirar(preferencia('es', 'America/Atlantida'), 1_000);
    await fila.enfileirar(preferencia('fr'), 1_001);
    const r = await sincronizar(fila, enviar, { usuarioId: A });
    expect(r).toEqual({ enviadas: 1, recusadas: 1, adiadas: 0 });
    expect(await fila.doUsuario(A)).toMatchObject([
      { estado: 'rejeitada', ultimoErro: 'fuso_invalido' },
    ]);
    expect((await sincronizar(fila, enviar, { usuarioId: A })).enviadas).toBe(0);
    expect(s.aplicadas).toEqual(['fr']);
  });

  it('SP1: o 403 segundo_fator_obrigatorio adia a operação, avisa a tela e não descarta nada', async () => {
    const avisos: string[] = [];
    vi.stubGlobal('dispatchEvent', (e: Event) => avisos.push(e.type));
    try {
      const pedeFator: typeof fetch = async () =>
        new Response(JSON.stringify({ erro: { codigo: 'segundo_fator_obrigatorio' } }), {
          status: 403,
        });
      await fila.enfileirar(preferencia('fr'), 1_000);
      const r = await sincronizar(fila, criarEnvio(credenciais, pedeFator), { usuarioId: A });
      expect(r).toEqual({ enviadas: 0, recusadas: 0, adiadas: 1 });
      expect(await fila.doUsuario(A)).toMatchObject([{ estado: 'pendente' }]);
      expect(avisos).toEqual([EVENTO_DO_SEGUNDO_FATOR]);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('fora do contrato: recusada no aparelho, sem ir à rede', async () => {
    const s = servidor();
    const enviar = criarEnvio(credenciais, s.fetchFalso);
    await fila.enfileirar(preferencia('xx'), 1_000);
    s.semRede();
    expect((await sincronizar(fila, enviar, { usuarioId: A })).recusadas).toBe(1);
    expect((await fila.doUsuario(A))[0]?.ultimoErro).toBe('entrada_invalida');
  });

  it('duas passadas ao mesmo tempo (online + botão) enviam uma vez', async () => {
    const s = servidor();
    const enviar = criarEnvio(credenciais, s.fetchFalso);
    await fila.enfileirar(preferencia('es'), 1_000);
    await Promise.all([
      sincronizar(fila, enviar, { usuarioId: A }),
      sincronizar(fila, enviar, { usuarioId: A }),
    ]);
    expect(s.aplicadas).toEqual(['es']);
  });

  it('sem sessão, a operação espera (não é recusada nem perdida)', async () => {
    const s = servidor();
    const enviar = criarEnvio(
      { usuarioId: () => A, token: async () => null, tenant: () => null },
      s.fetchFalso,
    );
    await fila.enfileirar(preferencia('es'), 1_000);
    await sincronizar(fila, enviar, { usuarioId: A });
    expect((await fila.doUsuario(A))[0]).toMatchObject({
      estado: 'pendente',
      ultimoErro: 'sem_sessao',
    });
  });
});

describe('(a) a operação é de quem a criou', () => {
  it('outro usuário no aparelho: as pendentes do anterior não saem com a sessão nova', async () => {
    const s = servidor();
    await fila.enfileirar(preferencia('es'), 1_000);
    await fila.enfileirar(preferencia('fr'), 1_001);

    // B entra no mesmo aparelho, com rede.
    const r = await sincronizar(fila, criarEnvio(sessaoDe(B), s.fetchFalso), { usuarioId: B });
    expect(r).toEqual({ enviadas: 0, recusadas: 0, adiadas: 0 });
    expect(s.aplicadas).toEqual([]);
    expect(await fila.doUsuario(B)).toEqual([]);
    expect(await fila.doUsuario(A)).toHaveLength(2); // continuam guardadas para A

    // A volta: saem com o token de A.
    await sincronizar(fila, criarEnvio(sessaoDe(A), s.fetchFalso), { usuarioId: A });
    expect(s.aplicadas).toEqual(['es', 'fr']);
    expect(s.enviadasPor).toEqual([`Bearer token-${A}`, `Bearer token-${A}`]);
  });

  it('segunda barreira: o envio recusa mandar operação de A com a sessão de B', async () => {
    const s = servidor();
    const op = await fila.enfileirar(preferencia('es'), 1_000);
    const r = await criarEnvio(sessaoDe(B), s.fetchFalso)(op);
    expect(r).toEqual({ tipo: 'tentar_depois', motivo: 'outra_sessao' });
    expect(s.aplicadas).toEqual([]);
  });
});

describe('(b) sair apaga os dados locais', () => {
  it('a fila de quem sai é apagada, com o tenant; a de outra pessoa fica intocada', async () => {
    await fila.enfileirar(preferencia('es'), 1_000);
    await fila.enfileirar(preferencia('fr', 'America/Atlantida'), 1_001);
    await fila.enfileirar(preferencia('en', null, B), 1_002);
    const removidas: string[] = [];
    await apagarDadosLocais(fila, A, { removeItem: (k) => void removidas.push(k) });
    expect(await fila.doUsuario(A)).toEqual([]);
    expect(await fila.doUsuario(B)).toHaveLength(1);
    expect(removidas).toEqual(['hk_tenant']);
    // E não volta ao reabrir o app.
    fila.fechar();
    expect(await (await abrirFila()).doUsuario(A)).toEqual([]);
  });
});

describe('(c) recusada volta ao aparelho com o código e não some em silêncio', () => {
  it('fica guardada com o código do motivo até o técnico dispensar', async () => {
    const s = servidor();
    const enviar = criarEnvio(credenciais, s.fetchFalso);
    const op = await fila.enfileirar(preferencia('es', 'America/Atlantida'), 1_000);
    await sincronizar(fila, enviar, { usuarioId: A });
    // Várias passadas depois, continua lá, com o código.
    await sincronizar(fila, enviar, { usuarioId: A, ignorarEspera: true });
    expect(await fila.doUsuario(A)).toMatchObject([
      { chave: op.chave, estado: 'rejeitada', ultimoErro: 'fuso_invalido' },
    ]);
    await fila.remover(op.chave); // o botão "Dispensar"
    expect(await fila.doUsuario(A)).toEqual([]);
  });
});
