'use client';

// Estrutura das telas do CSC (ADR-038): menu lateral, barra superior, faixa
// de escopo e conteúdo. Abaixo de 820px o menu vira gaveta, aberta pelo botão
// da barra e fechada pelo fundo, pelo Esc ou ao escolher um item.
import {
  type ElementType,
  type MouseEvent,
  type ReactNode,
  useEffect,
  useId,
  useState,
} from 'react';

export interface PropsDaEstrutura {
  /** Logotipo e nome, no alto do menu. */
  marca: ReactNode;
  /** Os grupos e itens do menu (GrupoDeMenu e ItemDeMenu). */
  menu: ReactNode;
  /** Nome acessível do menu e do botão que o abre no celular (do catálogo). */
  rotuloDoMenu: string;
  /** Título da tela, na barra superior. */
  titulo: ReactNode;
  /** Ações da barra superior: troca de tema, idioma, usuário. */
  acoes?: ReactNode;
  /** Faixa de escopo abaixo da barra (grupo, bandeira ou hotel em vista). */
  escopo?: ReactNode;
  /** Rodapé do menu. */
  rodapeDoMenu?: ReactNode;
  /** Texto do atalho "pular para o conteúdo" (do catálogo); sem ele, não há atalho. */
  rotuloPularParaConteudo?: string;
  children: ReactNode;
}

export function Estrutura({
  marca,
  menu,
  rotuloDoMenu,
  titulo,
  acoes,
  escopo,
  rodapeDoMenu,
  rotuloPularParaConteudo,
  children,
}: PropsDaEstrutura) {
  const [aberto, setAberto] = useState(false);
  const idDoMenu = useId();
  const idDoConteudo = useId();

  useEffect(() => {
    if (!aberto) return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAberto(false);
    };
    document.addEventListener('keydown', aoTeclar);
    return () => document.removeEventListener('keydown', aoTeclar);
  }, [aberto]);

  // Escolher um item no celular fecha a gaveta.
  const aoClicarNoMenu = (e: MouseEvent<HTMLElement>) => {
    if (e.target instanceof Element && e.target.closest('a')) setAberto(false);
  };

  return (
    <div className="hk-estrutura" data-menu-aberto={aberto ? '' : undefined}>
      {rotuloPularParaConteudo ? (
        <a className="hk-pular" href={`#${idDoConteudo}`}>
          {rotuloPularParaConteudo}
        </a>
      ) : null}
      <aside className="hk-lateral" id={idDoMenu}>
        <div className="hk-marca">{marca}</div>
        <nav className="hk-menu" aria-label={rotuloDoMenu} onClick={aoClicarNoMenu}>
          {menu}
        </nav>
        {rodapeDoMenu ? <div className="hk-lateral-rodape">{rodapeDoMenu}</div> : null}
      </aside>
      <div className="hk-fundo-do-menu" aria-hidden="true" onClick={() => setAberto(false)} />
      <div className="hk-principal">
        <header className="hk-barra">
          <button
            type="button"
            className="hk-abrir-menu"
            aria-label={rotuloDoMenu}
            aria-controls={idDoMenu}
            aria-expanded={aberto}
            onClick={() => setAberto((a) => !a)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor">
              <path d="M4 7h16M4 12h16M4 17h16" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
          <h1>{titulo}</h1>
          {acoes ? <div className="hk-barra-acoes">{acoes}</div> : null}
        </header>
        {escopo ? <div className="hk-escopo">{escopo}</div> : null}
        <main className="hk-conteudo" id={idDoConteudo} tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  );
}

export function GrupoDeMenu({ rotulo, children }: { rotulo?: ReactNode; children: ReactNode }) {
  const id = useId();
  return (
    <div>
      {rotulo ? (
        <p className="hk-menu-grupo" id={id}>
          {rotulo}
        </p>
      ) : null}
      <ul aria-labelledby={rotulo ? id : undefined}>{children}</ul>
    </div>
  );
}

/** O que o componente de link precisa aceitar (um <a> ou o Link do Next). */
export interface PropsDoLink {
  href: string;
  className: string;
  'aria-current'?: 'page';
  children: ReactNode;
}

export interface PropsDoItemDeMenu {
  href: string;
  /** A tela atual: marca o item e anuncia aria-current="page". */
  ativo?: boolean;
  icone?: ReactNode;
  /** Número ao lado do item (por exemplo, chamados abertos). */
  contagem?: ReactNode;
  /** O link do app; por padrão, um <a>. No web, o Link do Next. */
  componente?: ElementType<PropsDoLink>;
  children: ReactNode;
}

export function ItemDeMenu({
  href,
  ativo = false,
  icone,
  contagem,
  componente: Link = 'a',
  children,
}: PropsDoItemDeMenu) {
  return (
    <li>
      <Link href={href} className="hk-menu-item" {...(ativo ? { 'aria-current': 'page' } : {})}>
        {icone}
        <span>{children}</span>
        {contagem !== undefined ? <span className="hk-menu-contagem">{contagem}</span> : null}
      </Link>
    </li>
  );
}
