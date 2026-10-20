'use client';
// O papel sai com as cores do tema claro: ligado no beforeprint e desfeito no
// afterprint (a OS impressa, 1c item 9, e a folha de etiquetas, M3).
import { useEffect } from 'react';

export function useTemaClaroNaImpressao() {
  useEffect(() => {
    const raiz = document.documentElement;
    let anterior: string | undefined;
    const antes = () => {
      anterior = raiz.dataset.tema;
      raiz.dataset.tema = 'claro';
    };
    const depois = () => {
      if (anterior === undefined) delete raiz.dataset.tema;
      else raiz.dataset.tema = anterior;
    };
    window.addEventListener('beforeprint', antes);
    window.addEventListener('afterprint', depois);
    return () => {
      window.removeEventListener('beforeprint', antes);
      window.removeEventListener('afterprint', depois);
    };
  }, []);
}
