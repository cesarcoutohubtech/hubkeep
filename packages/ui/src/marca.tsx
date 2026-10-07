// Marca do HubKeep (ADR-038): o símbolo do mock (arco e ponteiro de
// manômetro) e o nome, que vem do catálogo de quem usa.
import type { ReactNode } from 'react';

/** Só o símbolo; decorativo, porque o nome sempre aparece ao lado. */
export function SimboloDaMarca() {
  return (
    <svg className="hk-marca-simbolo" viewBox="0 0 34 34" aria-hidden="true">
      <rect width="34" height="34" rx="9" />
      <path
        className="hk-marca-arco"
        d="M8 22a9 9 0 0 1 18 0"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path className="hk-marca-ponteiro" d="M17 22l5-7" strokeWidth="3" strokeLinecap="round" />
      <circle cx="17" cy="22" r="2.4" />
    </svg>
  );
}

/** Símbolo e nome, para o alto do menu e a tela de entrada. */
export function Marca({ nome }: { nome: ReactNode }) {
  return (
    <>
      <SimboloDaMarca />
      <span>{nome}</span>
    </>
  );
}
