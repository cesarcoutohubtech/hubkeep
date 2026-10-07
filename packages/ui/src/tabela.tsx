// Tabela (ADR-038): a rolagem horizontal no celular e a legenda, que dá nome
// à tabela para o leitor de tela. O app escreve thead e tbody; as classes
// hk-num (coluna numérica), hk-id (código do chamado ou da OS) e
// hk-linha-clicavel completam o estilo.
import type { ReactNode } from 'react';

export interface PropsDaTabela {
  /** Nome da tabela (do catálogo), anunciado pelo leitor de tela. */
  legenda: ReactNode;
  /** Mostra a legenda acima da tabela; por padrão ela fica só para o leitor. */
  legendaVisivel?: boolean;
  className?: string;
  children: ReactNode;
}

export function Tabela({ legenda, legendaVisivel = false, className, children }: PropsDaTabela) {
  return (
    <div className="hk-tabela-rolagem">
      <table className={className ? `hk-tabela ${className}` : 'hk-tabela'}>
        <caption className={legendaVisivel ? undefined : 'hk-so-leitor'}>{legenda}</caption>
        {children}
      </table>
    </div>
  );
}
