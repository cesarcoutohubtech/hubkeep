'use client';
// QR individual do ativo (fase 1a, B5): a imagem é gerada no navegador (uqr
// calcula a matriz; o SVG sai daqui), com o endereço do PWA do técnico e o
// caminho /q/<codigo>. O código não revela o id do ativo. A folha de
// etiquetas do QR em lote (M3) está em etiquetas.tsx. O quadro fica branco com módulos
// pretos nos dois temas, para a leitura pela câmera.
import { caminhoDoQr } from '@hubkeep/dominio';
import { Botao, MensagemDeErro } from '@hubkeep/ui';
import { useState } from 'react';
import { encode } from 'uqr';
import { useT } from '../i18n/cliente';

/** Endereço público do PWA (ex.: https://tecnico.hubkeep.com.br); no dev, o Vite. */
export const URL_DO_TECNICO = process.env.NEXT_PUBLIC_URL_DO_TECNICO;

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
      <div>
        <Botao tamanho="pequeno" onClick={() => setAberto(true)}>
          {t('admin.ativos.qr.ver')}
        </Botao>
      </div>
    );
  }
  const endereco = URL_DO_TECNICO ? enderecoDoQr(URL_DO_TECNICO, ativo.codigoQr) : null;
  const svg = endereco ? caminhoSvgDoQr(endereco) : null;
  return (
    <figure className="hk-qr">
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
        <MensagemDeErro>{t('admin.ativos.qr.sem_endereco')}</MensagemDeErro>
      )}
      <figcaption className="hk-suave">
        {t('admin.ativos.qr.codigo', { codigo: ativo.codigoQr })}
      </figcaption>
      <Botao tamanho="pequeno" onClick={() => setAberto(false)}>
        {t('admin.ativos.qr.ocultar')}
      </Botao>
    </figure>
  );
}
