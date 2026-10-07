// Mensagens de lista vazia e de erro (ADR-038). O erro usa role="alert",
// para o leitor de tela anunciar assim que ele aparece.
import type { ReactNode } from 'react';

export interface PropsDaMensagem {
  titulo?: ReactNode;
  /** Botão ou link para a próxima ação (tentar de novo, criar o primeiro). */
  acao?: ReactNode;
  children?: ReactNode;
}

export function MensagemVazia({ titulo, acao, children }: PropsDaMensagem) {
  return (
    <div className="hk-vazio">
      {titulo !== undefined ? <strong className="hk-vazio-titulo">{titulo}</strong> : null}
      {children}
      {acao !== undefined ? <div className="hk-mensagem-acao">{acao}</div> : null}
    </div>
  );
}

export function MensagemDeErro({ titulo, acao, children }: PropsDaMensagem) {
  return (
    <div className="hk-erro" role="alert">
      {titulo !== undefined ? <strong className="hk-erro-titulo">{titulo}</strong> : null}
      {children !== undefined ? <span>{children}</span> : null}
      {acao !== undefined ? <div className="hk-mensagem-acao">{acao}</div> : null}
    </div>
  );
}

export const TONS_DE_NOTA = ['info', 'ok', 'atencao'] as const;
export type TomDeNota = (typeof TONS_DE_NOTA)[number];

/**
 * Aviso que não é erro: informação, confirmação ("feito") ou atenção. A
 * confirmação e a atenção são anunciadas (role="status"); a informação, não.
 */
export function Nota({ tom = 'info', children }: { tom?: TomDeNota; children: ReactNode }) {
  return (
    <p className="hk-nota" data-tom={tom} {...(tom === 'info' ? {} : { role: 'status' })}>
      {children}
    </p>
  );
}
