'use client';
// Peças comuns das telas de cadastro (ADR-038, U4b): os hotéis de quem vê,
// com o escolhido, e o campo que troca de hotel.
import { Campo, Selecao } from '@hubkeep/ui';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { type ErroDaApi, chamarApi } from './api';

export interface Hotel {
  id: string;
  nome: string;
}

/** Os hotéis do escopo de quem vê; ao abrir, o escolhido é o primeiro. */
export function useHoteis() {
  const [hoteis, setHoteis] = useState<Hotel[]>([]);
  const [hotelId, setHotelId] = useState('');
  const [erro, setErro] = useState<ErroDaApi | null>(null);
  useEffect(() => {
    void chamarApi<{ hoteis: Hotel[] }>('/api/v1/hoteis').then((r) => {
      if (!r.ok) return setErro(r.erro);
      setHoteis(r.dados.hoteis);
      setHotelId((atual) => atual || r.dados.hoteis[0]?.id || '');
    });
  }, []);
  return { hoteis, hotelId, setHotelId, erro };
}

export function SeletorDeHotel({
  rotulo,
  hoteis,
  valor,
  aoEscolher,
}: {
  rotulo: ReactNode;
  hoteis: readonly Hotel[];
  valor: string;
  aoEscolher: (hotelId: string) => void;
}) {
  return (
    <Campo rotulo={rotulo}>
      {(p) => (
        <Selecao {...p} value={valor} onChange={(e) => aoEscolher(e.target.value)}>
          {hoteis.map((h) => (
            <option key={h.id} value={h.id}>
              {h.nome}
            </option>
          ))}
        </Selecao>
      )}
    </Campo>
  );
}
