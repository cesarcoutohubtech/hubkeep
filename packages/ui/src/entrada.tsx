// Tela de entrada (ADR-038): o cartão centralizado do login e da definição de
// senha, no web e no PWA, com a marca, o título e o formulário.
import type { ReactNode } from 'react';

export interface PropsDaTelaDeEntrada {
  /** A marca (Marca, com o nome do catálogo). */
  marca: ReactNode;
  titulo: ReactNode;
  /** Acima do cartão à direita, como o seletor de idioma. */
  acoes?: ReactNode;
  /** Texto de apoio abaixo do formulário. */
  rodape?: ReactNode;
  children: ReactNode;
}

export function TelaDeEntrada({ marca, titulo, acoes, rodape, children }: PropsDaTelaDeEntrada) {
  return (
    <main className="hk-entrada">
      <div className="hk-entrada-cartao">
        <div className="hk-entrada-marca">{marca}</div>
        {acoes !== undefined ? <div className="hk-entrada-acoes">{acoes}</div> : null}
        <h1>{titulo}</h1>
        {children}
        {rodape !== undefined ? <div className="hk-entrada-rodape">{rodape}</div> : null}
      </div>
    </main>
  );
}
