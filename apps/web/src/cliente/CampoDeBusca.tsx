'use client';
// Campo de busca das listas (fase 1a, B6; ADR-030): o termo vai para a API em
// ?busca=, que acha por trecho e sem acento. Termo curto volta com o código
// busca_curta, mostrado pela tela como qualquer erro da API.
import { type FormEvent, useState } from 'react';
import { useT } from '../i18n/cliente';

/** Caminho da lista com o termo, quando houver. */
export const comBusca = (caminho: string, termo: string): string =>
  termo === '' ? caminho : `${caminho}?busca=${encodeURIComponent(termo)}`;

export function CampoDeBusca({ aoBuscar }: { aoBuscar: (termo: string) => void }) {
  const t = useT();
  const [digitado, setDigitado] = useState('');

  function enviar(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    aoBuscar(digitado.trim());
  }

  return (
    <form role="search" onSubmit={enviar} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      <input
        type="search"
        value={digitado}
        onChange={(e) => setDigitado(e.target.value)}
        aria-label={t('comum.busca.rotulo')}
        placeholder={t('comum.busca.rotulo')}
      />
      <button type="submit">{t('comum.busca.buscar')}</button>
      {digitado !== '' && (
        <button
          type="button"
          onClick={() => {
            setDigitado('');
            aoBuscar('');
          }}
        >
          {t('comum.busca.limpar')}
        </button>
      )}
    </form>
  );
}
