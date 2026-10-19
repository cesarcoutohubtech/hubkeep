// Push no aparelho (1c, ADR-046, C4). O técnico ativa os avisos na fila do
// dia: o PWA pede a chave pública ao servidor e a permissão ao navegador,
// inscreve-se no serviço de push do navegador e grava a inscrição pela API.
// Desativar revoga na API e cancela no navegador. Sem rede, nada muda. Ao
// sair, a inscrição do aparelho é revogada, para o próximo usuário do
// aparelho não receber os avisos de quem saiu.
//
// O que chega ao aparelho é mostrado pelo service worker (public/push-sw.js),
// com o título e a linha que o servidor montou no idioma de quem recebe; o
// toque abre o caminho do aviso (/os/<id>), que o App lê com osDoCaminho.
import { ConfiguracaoDoPushApi } from '@hubkeep/contratos';
import { type Credenciais, baseDaApi, cabecalhos } from './api';

export type EstadoDoPush =
  'sem_suporte' | 'indisponivel' | 'negado' | 'ativo' | 'inativo' | 'sem_rede';

/** O que o push usa do navegador; os testes trocam por um falso. */
export interface AmbienteDoPush {
  suporta(): boolean;
  permissao(): NotificationPermission;
  pedirPermissao(): Promise<NotificationPermission>;
  inscricaoAtual(): Promise<PushSubscription | null>;
  inscrever(chave: Uint8Array<ArrayBuffer>): Promise<PushSubscription>;
}

export function ambienteDoNavegador(): AmbienteDoPush {
  const registro = () => navigator.serviceWorker.ready;
  return {
    suporta: () =>
      typeof window !== 'undefined' &&
      'serviceWorker' in navigator &&
      'PushManager' in window &&
      'Notification' in window,
    permissao: () => Notification.permission,
    pedirPermissao: () => Notification.requestPermission(),
    inscricaoAtual: async () => (await registro()).pushManager.getSubscription(),
    inscrever: async (chave) =>
      (await registro()).pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: chave,
      }),
  };
}

/** A chave VAPID (base64url) nos bytes que o pushManager pede. */
export function chaveParaBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const cru = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4));
  const bytes = new Uint8Array(new ArrayBuffer(cru.length));
  for (let i = 0; i < cru.length; i++) bytes[i] = cru.charCodeAt(i);
  return bytes;
}

/** O id de /os/<id>, o caminho que o toque no aviso abre; null para outro caminho. */
export function osDoCaminho(caminho: string): string | null {
  return /^\/os\/([0-9a-f-]{36})\/?$/i.exec(caminho)?.[1] ?? null;
}

export interface PushDoAparelho {
  estado(): Promise<EstadoDoPush>;
  ativar(): Promise<EstadoDoPush>;
  desativar(): Promise<EstadoDoPush>;
  /** Na saída: revoga na API se der e cancela no navegador de qualquer jeito. */
  sair(): Promise<void>;
}

export function criarPush(
  c: Credenciais,
  ambiente: AmbienteDoPush = ambienteDoNavegador(),
  requisitar: typeof fetch = fetch,
): PushDoAparelho {
  /** A chave pública; null: o push não está ligado; undefined: sem rede ou sem sessão. */
  async function chavePublica(): Promise<string | null | undefined> {
    const h = await cabecalhos(c);
    if (!h) return undefined;
    try {
      const r = await requisitar(`${baseDaApi()}/api/v1/push/configuracao`, { headers: h });
      if (!r.ok) return undefined;
      return ConfiguracaoDoPushApi.parse(await r.json()).chavePublica;
    } catch {
      return undefined;
    }
  }

  async function postar(caminho: string, corpo: unknown): Promise<boolean> {
    const h = await cabecalhos(c);
    if (!h) return false;
    try {
      const r = await requisitar(`${baseDaApi()}${caminho}`, {
        method: 'POST',
        headers: h,
        body: JSON.stringify(corpo),
      });
      return r.ok;
    } catch {
      return false;
    }
  }

  return {
    async estado() {
      if (!ambiente.suporta()) return 'sem_suporte';
      if (ambiente.permissao() === 'denied') return 'negado';
      if (await ambiente.inscricaoAtual()) return 'ativo';
      return (await chavePublica()) === null ? 'indisponivel' : 'inativo';
    },

    async ativar() {
      if (!ambiente.suporta()) return 'sem_suporte';
      const chave = await chavePublica();
      if (chave === undefined) return 'sem_rede';
      if (chave === null) return 'indisponivel';
      if ((await ambiente.pedirPermissao()) !== 'granted') return 'negado';
      const inscricao = await ambiente.inscrever(chaveParaBytes(chave));
      if (await postar('/api/v1/push/inscricoes', inscricao.toJSON())) return 'ativo';
      // Sem a gravação no servidor, o aparelho não fica inscrito pela metade.
      await inscricao.unsubscribe();
      return 'sem_rede';
    },

    async desativar() {
      const inscricao = await ambiente.inscricaoAtual();
      if (!inscricao) return 'inativo';
      if (!(await postar('/api/v1/push/inscricoes/revogacao', { endpoint: inscricao.endpoint }))) {
        return 'sem_rede';
      }
      await inscricao.unsubscribe();
      return 'inativo';
    },

    async sair() {
      if (!ambiente.suporta()) return;
      const inscricao = await ambiente.inscricaoAtual();
      if (!inscricao) return;
      // Sem rede, o serviço de push recusa a inscrição cancelada (410), e o
      // worker revoga na próxima entrega.
      await postar('/api/v1/push/inscricoes/revogacao', { endpoint: inscricao.endpoint });
      await inscricao.unsubscribe();
    },
  };
}
