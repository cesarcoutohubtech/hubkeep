// Moldura das telas do PWA (ADR-038, U5), como o celular do mock: cabeçalho
// em petróleo com o título e a ação (sair ou voltar), a faixa da rede e o
// corpo. Os textos chegam prontos, do catálogo.
import type { ReactNode } from 'react';

export function TelaDoTecnico(props: {
  titulo: ReactNode;
  /** Linha menor abaixo do título (o local da OS, por exemplo). */
  subtitulo?: ReactNode;
  /** Botão à direita do cabeçalho. */
  acao?: ReactNode;
  /** Faixa abaixo do cabeçalho (FaixaDaRede). */
  faixa?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="tc-tela">
      <header className="tc-cabecalho">
        <div>
          <h1 className="tc-titulo">{props.titulo}</h1>
          {props.subtitulo !== undefined && <p className="tc-subtitulo">{props.subtitulo}</p>}
        </div>
        {props.acao}
      </header>
      {props.faixa}
      <main className="tc-corpo">{props.children}</main>
    </div>
  );
}

/** Faixa da rede: verde com rede, âmbar sem; o texto diz o estado (WCAG 1.4.1). */
export function FaixaDaRede(props: { online: boolean; children: ReactNode }) {
  return (
    <div className="tc-rede" data-rede={props.online ? 'online' : 'offline'}>
      {props.children}
    </div>
  );
}
