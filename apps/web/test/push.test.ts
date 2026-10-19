// O adaptador do push (1c, ADR-046, C4): sem as chaves VAPID ou sem o site em
// https, não há enviador (C1); a resposta 404 ou 410 do serviço de push vira
// "expirada", e outro erro lança. A biblioteca web-push é substituída.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const enviar = vi.fn();
vi.mock('web-push', () => ({ default: { sendNotification: enviar } }));

const { criarEnviadorDePush, enviadorDePushDoAmbiente } = await import('../src/servidor/push');

const destino = { endpoint: 'https://push.test/1', chaves: { p256dh: 'p', auth: 'a' } };
const mensagem = { titulo: 'T', corpo: 'C', caminho: '/os/1' };
const enviador = () =>
  criarEnviadorDePush({ chavePublica: 'pub', chavePrivada: 'priv', assunto: 'https://hk.test' });

describe('push pelo web-push', () => {
  beforeEach(() => enviar.mockReset());

  it('sem as duas chaves ou sem o site em https, o push fica desligado', () => {
    const site = 'https://hk.test';
    expect(enviadorDePushDoAmbiente({ publica: undefined, privada: 'x', site })).toBeNull();
    expect(enviadorDePushDoAmbiente({ publica: 'x', privada: undefined, site })).toBeNull();
    expect(enviadorDePushDoAmbiente({ publica: 'x', privada: 'y', site: '' })).toBeNull();
    expect(
      enviadorDePushDoAmbiente({ publica: 'x', privada: 'y', site: 'http://hk.test' }),
    ).toBeNull();
    expect(enviadorDePushDoAmbiente({ publica: 'x', privada: 'y', site })).not.toBeNull();
  });

  it('manda a mensagem cifrada ao endpoint, com as chaves VAPID e validade de 1 h', async () => {
    enviar.mockResolvedValue({ statusCode: 201 });
    expect(await enviador().enviar(destino, mensagem)).toBe('entregue');
    expect(enviar).toHaveBeenCalledWith(
      { endpoint: destino.endpoint, keys: destino.chaves },
      JSON.stringify(mensagem),
      {
        vapidDetails: { subject: 'https://hk.test', publicKey: 'pub', privateKey: 'priv' },
        TTL: 3600,
        urgency: 'high',
      },
    );
  });

  it('404 e 410 são a inscrição expirada; outro erro lança', async () => {
    enviar.mockRejectedValueOnce(Object.assign(new Error('gone'), { statusCode: 410 }));
    expect(await enviador().enviar(destino, mensagem)).toBe('expirada');
    enviar.mockRejectedValueOnce(Object.assign(new Error('nf'), { statusCode: 404 }));
    expect(await enviador().enviar(destino, mensagem)).toBe('expirada');
    enviar.mockRejectedValueOnce(Object.assign(new Error('x'), { statusCode: 429 }));
    await expect(enviador().enviar(destino, mensagem)).rejects.toThrow(/respondeu 429/);
    enviar.mockRejectedValueOnce(new Error('rede'));
    await expect(enviador().enviar(destino, mensagem)).rejects.toThrow(/sem status/);
  });
});
