// Selos de estado e de prioridade (ADR-038). O texto vem sempre junto da cor:
// a cor reforça, não carrega sozinha o significado (WCAG 1.4.1).
import type { ReactNode } from 'react';

export const TONS_DE_SELO = ['cinza', 'azul', 'ambar', 'vermelho', 'verde'] as const;
export type TomDeSelo = (typeof TONS_DE_SELO)[number];

export function Selo({ tom = 'cinza', children }: { tom?: TomDeSelo; children: ReactNode }) {
  return (
    <span className="hk-selo" data-tom={tom}>
      {children}
    </span>
  );
}

/**
 * Os quatro níveis visuais de prioridade. A prioridade do tenant tem nome,
 * ordem e peso (ADR-027); quem escolhe o nível de cada uma é o app.
 */
export const NIVEIS_DE_PRIORIDADE = ['critica', 'alta', 'media', 'baixa'] as const;
export type NivelDePrioridade = (typeof NIVEIS_DE_PRIORIDADE)[number];

export function SeloDePrioridade({
  nivel,
  children,
}: {
  nivel: NivelDePrioridade;
  children: ReactNode;
}) {
  return (
    <span className="hk-prioridade" data-nivel={nivel}>
      {children}
    </span>
  );
}
