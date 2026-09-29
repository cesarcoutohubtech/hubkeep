'use client';
// QR individual do ativo (fase 1a, B5): a imagem é gerada no navegador (uqr
// calcula a matriz; o SVG sai daqui), com o endereço do PWA do técnico e o
// caminho /q/<codigo>. O código não revela o id do ativo. Tela funcional, sem
// acabamento: a etiqueta de impressão e o QR em lote ficam para a 1b.
import { caminhoDoQr } from '@hubkeep/dominio';
import { useState } from 'react';
import { encode } from 'uqr';
import { useT } from '../i18n/cliente';

/** Endereço público do PWA (ex.: https://tecnico.hubkeep.com.br); no dev, o Vite. */
const URL_DO_TECNICO = process.env.NEXT_PUBLIC_URL_DO_TECNICO;

export function enderecoDoQr(base: string, codigo: string): string {
  return `${base.replace(/\/+$/, '')}${caminhoDoQr(codigo)}`;
}

/** Os módulos escuros do QR como um único caminho SVG, um quadrado por módulo. */
export function caminhoSvgDoQr(texto: string): { lado: number; d: string } {
  const qr = encode(texto, { ecc: 'M', border: 2 });
  let d = '';
  qr.data.forEach((linha, y) =>
    linha.forEach((escuro, x) => {
      if (escuro) d += `M${x} ${y}h1v1h-1z`;
    }),
  );
  return { lado: qr.size, d };
}

export function QrDoAtivo({ ativo }: { ativo: { nome: string; codigoQr: string } }) {
  const t = useT();
  const [aberto, setAberto] = useState(false);
  if (!aberto) {
    return (
      <button type="button" onClick={() => setAberto(true)}>
        {t('admin.ativos.qr.ver')}
      </button>
    );
  }
  const endereco = URL_DO_TECNICO ? enderecoDoQr(URL_DO_TECNICO, ativo.codigoQr) : null;
  const svg = endereco ? caminhoSvgDoQr(endereco) : null;
  return (
    <figure style={{ display: 'grid', gap: 4, margin: 0, justifyItems: 'start' }}>
      {svg ? (
        <svg
          role="img"
          aria-label={t('admin.ativos.qr.imagem', { ativo: ativo.nome })}
          viewBox={`0 0 ${svg.lado} ${svg.lado}`}
          width={160}
          height={160}
          shapeRendering="crispEdges"
        >
          <rect width={svg.lado} height={svg.lado} fill="#ffffff" />
          <path d={svg.d} fill="#000000" />
        </svg>
      ) : (
        <small role="alert">{t('admin.ativos.qr.sem_endereco')}</small>
      )}
      <figcaption>
        <small>{t('admin.ativos.qr.codigo', { codigo: ativo.codigoQr })}</small>
      </figcaption>
      <button type="button" onClick={() => setAberto(false)}>
        {t('admin.ativos.qr.ocultar')}
      </button>
    </figure>
  );
}
