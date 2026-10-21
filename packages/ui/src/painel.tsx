// Painel e indicador (ADR-038): o bloco de conteúdo das telas e o número em
// destaque, com a cor da borda dizendo se está normal, em atenção ou crítico.
import { type ReactNode, useId } from 'react';

export interface PropsDoPainel {
  titulo?: ReactNode;
  /** Texto curto ao lado do título. */
  dica?: ReactNode;
  /** Botões ou links à direita do título. */
  acoes?: ReactNode;
  /** Nível do título; 2 por padrão (o 1 é o da barra superior). */
  nivel?: 2 | 3;
  className?: string;
  children: ReactNode;
}

export function Painel({ titulo, dica, acoes, nivel = 2, className, children }: PropsDoPainel) {
  const id = useId();
  const Titulo = nivel === 3 ? 'h3' : 'h2';
  const temCabecalho = titulo !== undefined || dica !== undefined || acoes !== undefined;
  return (
    <section
      className={className ? `hk-painel ${className}` : 'hk-painel'}
      aria-labelledby={titulo !== undefined ? id : undefined}
    >
      {temCabecalho ? (
        <div className="hk-painel-cabecalho">
          {titulo !== undefined ? <Titulo id={id}>{titulo}</Titulo> : null}
          {dica !== undefined ? <span className="hk-painel-dica">{dica}</span> : null}
          {acoes !== undefined ? <div className="hk-painel-acoes">{acoes}</div> : null}
        </div>
      ) : null}
      <div className="hk-painel-corpo">{children}</div>
    </section>
  );
}

export const TONS_DE_INDICADOR = ['neutro', 'bom', 'atencao', 'critico'] as const;
export type TomDeIndicador = (typeof TONS_DE_INDICADOR)[number];

export interface PropsDoIndicador {
  rotulo: ReactNode;
  /** O número, já formatado pelo app (Intl, no idioma do usuário). */
  valor: ReactNode;
  unidade?: ReactNode;
  detalhe?: ReactNode;
  /** A cor da borda; o significado também precisa estar no texto (WCAG 1.4.1). */
  tom?: TomDeIndicador;
  /** A linha dos últimos dias (MiniLinha), embaixo do detalhe. */
  tendencia?: ReactNode;
}

export interface PropsDosIndicadores {
  /** Nome do grupo para o leitor de tela. */
  rotulo?: string;
  children: ReactNode;
}

/** A fileira de indicadores: colunas que se ajustam à largura da tela. */
export function Indicadores({ rotulo, children }: PropsDosIndicadores) {
  return (
    <div className="hk-indicadores" role={rotulo ? 'group' : undefined} aria-label={rotulo}>
      {children}
    </div>
  );
}

export interface ParDeDados {
  rotulo: ReactNode;
  valor: ReactNode;
}

export interface PropsDosDados {
  itens: readonly ParDeDados[];
}

/** Pares de rótulo e valor (`dl`), como o bloco "como este resultado foi gravado". */
export function Dados({ itens }: PropsDosDados) {
  return (
    <dl className="hk-dados">
      {itens.map((item, i) => (
        <div key={i} className="hk-dados-par">
          <dt>{item.rotulo}</dt>
          <dd>{item.valor}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Indicador({
  rotulo,
  valor,
  unidade,
  detalhe,
  tom = 'neutro',
  tendencia,
}: PropsDoIndicador) {
  return (
    <div className="hk-indicador" data-tom={tom}>
      <span className="hk-indicador-valor">
        {valor}
        {unidade !== undefined ? <small>{unidade}</small> : null}
      </span>
      <span className="hk-indicador-rotulo">{rotulo}</span>
      {detalhe !== undefined ? <span className="hk-indicador-detalhe">{detalhe}</span> : null}
      {tendencia !== undefined ? <span className="hk-indicador-tendencia">{tendencia}</span> : null}
    </div>
  );
}
