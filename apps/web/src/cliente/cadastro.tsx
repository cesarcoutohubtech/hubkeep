'use client';
// Peças comuns das telas de cadastro (ADR-038, U4b): os hotéis de quem vê,
// com o escolhido, e o campo que troca de hotel; as bandeiras e o campo que
// escolhe a bandeira de um item do pacote (PB1b).
import { Campo, Selecao } from '@hubkeep/ui';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { useT } from '../i18n/cliente';
import { type ErroDaApi, chamarApi } from './api';

export interface Hotel {
  id: string;
  nome: string;
  /** PB1b: os modelos e checklists de outra bandeira não valem para o hotel. */
  bandeiraId?: string | null;
}

export interface Bandeira {
  id: string;
  nome: string;
}

/** O item (modelo ou checklist) vale para o hotel: é do grupo ou da bandeira dele. */
export const valeParaOHotel = (
  item: { bandeiraId?: string | null },
  hotel: { bandeiraId?: string | null } | undefined,
) => (item.bandeiraId ?? null) === null || item.bandeiraId === (hotel?.bandeiraId ?? null);

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

/** As bandeiras do grupo; vazia enquanto carrega ou se a leitura falhar. */
export function useBandeiras() {
  const [bandeiras, setBandeiras] = useState<Bandeira[]>([]);
  useEffect(() => {
    void chamarApi<{ bandeiras: Bandeira[] }>('/api/v1/bandeiras').then((r) => {
      if (r.ok) setBandeiras(r.dados.bandeiras);
    });
  }, []);
  return bandeiras;
}

/** O nome da bandeira do item, ou "todo o grupo" quando ele não tem bandeira. */
export function useNomeDaBandeira(bandeiras: readonly Bandeira[]) {
  const t = useT();
  return (id: string | null | undefined) =>
    (id ?? null) === null
      ? t('admin.pacote.todo_o_grupo')
      : (bandeiras.find((b) => b.id === id)?.nome ?? String(id));
}

/** Escolhe a bandeira na criação do item; vazio é "todo o grupo". */
export function CampoDaBandeira({
  bandeiras,
  valor,
  aoEscolher,
}: {
  bandeiras: readonly Bandeira[];
  valor: string;
  aoEscolher: (bandeiraId: string) => void;
}) {
  const t = useT();
  return (
    <Campo rotulo={t('admin.pacote.campo.bandeira')}>
      {(p) => (
        <Selecao {...p} name="bandeira" value={valor} onChange={(e) => aoEscolher(e.target.value)}>
          <option value="">{t('admin.pacote.todo_o_grupo')}</option>
          {bandeiras.map((b) => (
            <option key={b.id} value={b.id}>
              {b.nome}
            </option>
          ))}
        </Selecao>
      )}
    </Campo>
  );
}
