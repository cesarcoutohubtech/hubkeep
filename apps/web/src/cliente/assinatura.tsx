'use client';
// Assinatura do aceite (fase 1b, I8): quem aceita desenha no quadro, com o
// dedo, a caneta ou o mouse. Aparece só com a política os.assinatura_no_aceite
// ligada no hotel. Na tela, o traço usa a cor do texto do tema; o PNG enviado
// é desenhado à parte, em preto sobre branco, para ser legível em qualquer
// tema. O PNG vai direto ao Storage pela URL da assinatura (POST
// /api/v1/os/{id}/assinatura/url-de-upload, depois PUT), e o caminho segue no
// aceite. É evidência do aceite, e não assinatura digital ICP-Brasil.
import { Botao } from '@hubkeep/ui';
import { type PointerEvent, useRef } from 'react';
import { useT } from '../i18n/cliente';
import { type ErroDaApi, chamarApi } from './api';

/** Um traço: os pontos, nas coordenadas do quadro (LARGURA × ALTURA). */
export type Traco = { x: number; y: number }[];

const LARGURA = 600;
const ALTURA = 200;

function desenhar(ctx: CanvasRenderingContext2D, tracos: readonly Traco[], cor: string) {
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = cor;
  for (const t of tracos) {
    const [inicio, ...resto] = t;
    if (!inicio) continue;
    ctx.beginPath();
    ctx.moveTo(inicio.x, inicio.y);
    for (const p of resto) ctx.lineTo(p.x, p.y);
    if (resto.length === 0) ctx.lineTo(inicio.x + 0.1, inicio.y);
    ctx.stroke();
  }
}

export function QuadroDeAssinatura(props: { aoMudar: (tracos: Traco[]) => void }) {
  const t = useT();
  const ref = useRef<HTMLCanvasElement>(null);
  const tracos = useRef<Traco[]>([]);
  const atual = useRef<Traco | null>(null);

  const ponto = (e: PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) * LARGURA) / r.width,
      y: ((e.clientY - r.top) * ALTURA) / r.height,
    };
  };
  const redesenhar = () => {
    const c = ref.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    ctx.clearRect(0, 0, LARGURA, ALTURA);
    desenhar(
      ctx,
      [...tracos.current, ...(atual.current ? [atual.current] : [])],
      getComputedStyle(c).color,
    );
  };

  return (
    <div className="hk-pilha" data-assinatura>
      <canvas
        ref={ref}
        width={LARGURA}
        height={ALTURA}
        className="hk-assinatura"
        role="img"
        aria-label={t('corretiva.aceite.assinatura.quadro')}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          atual.current = [ponto(e)];
          redesenhar();
        }}
        onPointerMove={(e) => {
          if (!atual.current) return;
          atual.current.push(ponto(e));
          redesenhar();
        }}
        onPointerUp={() => {
          if (!atual.current) return;
          tracos.current = [...tracos.current, atual.current];
          atual.current = null;
          props.aoMudar(tracos.current);
        }}
        onPointerCancel={() => {
          atual.current = null;
          redesenhar();
        }}
      />
      <div className="hk-linha-de-botoes">
        <Botao
          tamanho="pequeno"
          onClick={() => {
            tracos.current = [];
            atual.current = null;
            redesenhar();
            props.aoMudar([]);
          }}
        >
          {t('corretiva.aceite.assinatura.limpar')}
        </Botao>
      </div>
    </div>
  );
}

/** O PNG da assinatura: preto sobre branco, no tamanho do quadro; null se o navegador não gera. */
export function pngDaAssinatura(tracos: readonly Traco[]): Promise<Blob | null> {
  const c = document.createElement('canvas');
  c.width = LARGURA;
  c.height = ALTURA;
  const ctx = c.getContext('2d');
  if (!ctx) return Promise.resolve(null);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, LARGURA, ALTURA);
  desenhar(ctx, tracos, '#000000');
  return new Promise((ok) => c.toBlob(ok, 'image/png'));
}

export interface DepsDaAssinatura {
  chamar?: typeof chamarApi;
  requisitar?: typeof fetch;
}

/** Envia o PNG pela URL da assinatura; devolve o caminho para o aceite, ou o erro para exibir. */
export async function enviarAssinatura(
  osId: string,
  png: Blob,
  deps: DepsDaAssinatura = {},
): Promise<{ ok: true; caminho: string } | { ok: false; erro: ErroDaApi }> {
  const chamar = deps.chamar ?? chamarApi;
  const requisitar = deps.requisitar ?? fetch;
  const u = await chamar<{ caminho: string; url: string }>(
    `/api/v1/os/${osId}/assinatura/url-de-upload`,
    { method: 'POST' },
  );
  if (!u.ok) return { ok: false, erro: u.erro };
  const envio = await requisitar(u.dados.url, {
    method: 'PUT',
    headers: { 'content-type': 'image/png' },
    body: png,
  }).catch(() => null);
  if (!envio?.ok) return { ok: false, erro: { codigo: 'envio_de_arquivo_falhou', parametros: {} } };
  return { ok: true, caminho: u.dados.caminho };
}

/** O aceite com assinatura, na OS (I8): abre o PNG por uma URL de 5 minutos. */
export function AssinaturaDoAceite(props: { anexoId: string; aoErro?: (erro: ErroDaApi) => void }) {
  const t = useT();
  async function abrir() {
    const r = await chamarApi<{ url: string }>(`/api/v1/anexos/${props.anexoId}/url-de-download`, {
      method: 'POST',
      body: JSON.stringify({ miniatura: false }),
    });
    if (r.ok) window.open(r.dados.url, '_blank', 'noopener');
    else props.aoErro?.(r.erro);
  }
  return (
    <div className="hk-linha-de-botoes" data-assinatura-do-aceite={props.anexoId}>
      <span className="hk-suave">{t('corretiva.os.assinada')}</span>
      <Botao tamanho="pequeno" onClick={() => void abrir()}>
        {t('corretiva.os.ver_assinatura')}
      </Botao>
    </div>
  );
}
