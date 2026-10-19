// Push no aparelho (1c, ADR-046, C4): o estado, ativar, desativar e a saída,
// com o navegador e a API falsos.
import { describe, expect, it, vi } from 'vitest';
import type { Credenciais } from '../src/api';
import { type AmbienteDoPush, chaveParaBytes, criarPush, osDoCaminho } from '../src/push';

const credenciais: Credenciais = {
  usuarioId: () => 'u1',
  token: async () => 'token',
  tenant: () => 't1',
};

function inscricaoFalsa(endpoint = 'https://push.test/1') {
  return {
    endpoint,
    unsubscribe: vi.fn(async () => true),
    toJSON: () => ({ endpoint, keys: { p256dh: 'p', auth: 'a' } }),
  } as unknown as PushSubscription & { unsubscribe: ReturnType<typeof vi.fn> };
}

function montar(p: {
  suporta?: boolean;
  permissao?: NotificationPermission;
  resposta?: NotificationPermission;
  atual?: PushSubscription | null;
  chave?: string | null;
  rede?: boolean;
  gravacaoOk?: boolean;
}) {
  const nova = inscricaoFalsa();
  let atual = p.atual ?? null;
  const ambiente: AmbienteDoPush = {
    suporta: () => p.suporta ?? true,
    permissao: () => p.permissao ?? 'default',
    pedirPermissao: vi.fn(async () => p.resposta ?? 'granted'),
    inscricaoAtual: async () => atual,
    inscrever: vi.fn(async () => {
      atual = nova;
      return nova;
    }),
  };
  const pedidos: { url: string; corpo: unknown }[] = [];
  const requisitar = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    if (p.rede === false) throw new TypeError('sem rede');
    const u = String(url);
    pedidos.push({ url: u, corpo: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (u.endsWith('/push/configuracao')) {
      return new Response(
        JSON.stringify({ chavePublica: p.chave === undefined ? 'AQID' : p.chave }),
      );
    }
    return new Response('{}', { status: p.gravacaoOk === false ? 500 : 201 });
  }) as unknown as typeof fetch;
  return { push: criarPush(credenciais, ambiente, requisitar), ambiente, pedidos, nova };
}

describe('push no aparelho', () => {
  it('o estado: sem suporte, negado, ativo, indisponível ou inativo', async () => {
    expect(await montar({ suporta: false }).push.estado()).toBe('sem_suporte');
    expect(await montar({ permissao: 'denied' }).push.estado()).toBe('negado');
    expect(await montar({ atual: inscricaoFalsa() }).push.estado()).toBe('ativo');
    expect(await montar({ chave: null }).push.estado()).toBe('indisponivel');
    expect(await montar({}).push.estado()).toBe('inativo');
    // Sem rede, o botão aparece; a falta de rede só se diz ao tocar.
    expect(await montar({ rede: false }).push.estado()).toBe('inativo');
  });

  it('ativar: a permissão, a inscrição com a chave do servidor e a gravação na API', async () => {
    const { push, ambiente, pedidos } = montar({});
    expect(await push.ativar()).toBe('ativo');
    expect(ambiente.inscrever).toHaveBeenCalledWith(new Uint8Array([1, 2, 3]));
    expect(pedidos.at(-1)).toEqual({
      url: '/api/v1/push/inscricoes',
      corpo: { endpoint: 'https://push.test/1', keys: { p256dh: 'p', auth: 'a' } },
    });
  });

  it('ativar sem rede, sem push no servidor ou com a permissão negada não inscreve', async () => {
    for (const [p, esperado] of [
      [{ rede: false }, 'sem_rede'],
      [{ chave: null }, 'indisponivel'],
      [{ resposta: 'denied' as const }, 'negado'],
    ] as const) {
      const { push, ambiente } = montar(p);
      expect(await push.ativar()).toBe(esperado);
      expect(ambiente.inscrever).not.toHaveBeenCalled();
    }
  });

  it('a gravação que falha cancela a inscrição no navegador', async () => {
    const { push, nova } = montar({ gravacaoOk: false });
    expect(await push.ativar()).toBe('sem_rede');
    expect(nova.unsubscribe).toHaveBeenCalled();
  });

  it('desativar revoga na API e cancela; sem rede, fica como estava', async () => {
    const atual = inscricaoFalsa('https://push.test/9');
    const { push, pedidos } = montar({ atual });
    expect(await push.desativar()).toBe('inativo');
    expect(pedidos).toEqual([
      { url: '/api/v1/push/inscricoes/revogacao', corpo: { endpoint: 'https://push.test/9' } },
    ]);
    expect(atual.unsubscribe).toHaveBeenCalled();

    const offline = inscricaoFalsa();
    expect(await montar({ atual: offline, rede: false }).push.desativar()).toBe('sem_rede');
    expect(offline.unsubscribe).not.toHaveBeenCalled();
  });

  it('ao sair, cancela no navegador mesmo sem rede', async () => {
    const atual = inscricaoFalsa();
    await montar({ atual, rede: false }).push.sair();
    expect(atual.unsubscribe).toHaveBeenCalled();
  });

  it('a chave base64url e o caminho do aviso', () => {
    expect([...chaveParaBytes('AQID')]).toEqual([1, 2, 3]);
    expect([...chaveParaBytes('-_8')]).toEqual([251, 255]);
    const id = '0192a5e4-7c1b-7d2e-9f00-1234567890ab';
    expect(osDoCaminho(`/os/${id}`)).toBe(id);
    expect(osDoCaminho(`/os/${id}/`)).toBe(id);
    expect(osDoCaminho('/os/x')).toBeNull();
    expect(osDoCaminho('/')).toBeNull();
  });
});
