// Porta dos feriados do hotel (fase 1c; ADR-042). Implementada por
// packages/db, com o contexto do usuário: a RLS de app.feriado_hotel mostra
// os feriados dos hotéis que ele lê e só deixa gravar a gestão do hotel e o
// Implantador, em nome deles mesmos (migração 0043).
import type { Contexto } from '@hubkeep/dominio';

export interface FeriadoDoHotelGravado {
  id: string;
  hotelId: string;
  /** 'AAAA-MM-DD', sem fuso. */
  data: string;
  nome: string;
  anual: boolean;
  ativo: boolean;
}

export interface PortaFeriadosDoHotel {
  /** Hotel visível ao usuário, com a bandeira (para a regra de escopo); senão null. */
  hotel(ctx: Contexto, hotelId: string): Promise<{ id: string; bandeiraId: string | null } | null>;
  /** O feriado e a bandeira do hotel dele, se o usuário o enxerga; senão null. */
  feriado(
    ctx: Contexto,
    feriadoId: string,
  ): Promise<{ feriado: FeriadoDoHotelGravado; bandeiraId: string | null } | null>;
  /** Todos os feriados do hotel, ativos e desativados, por data. */
  listar(ctx: Contexto, hotelId: string): Promise<FeriadoDoHotelGravado[]>;
  /** Na unit of work. Outro feriado ativo na data: Conflito feriado_data_repetida. */
  criar(
    ctx: Contexto,
    hotelId: string,
    f: { data: string; nome: string; anual: boolean },
  ): Promise<{ id: string }>;
  /** O nome, a marca "repete todo ano" e o ativo; a data não muda. */
  alterar(
    ctx: Contexto,
    feriadoId: string,
    mudanca: { nome?: string; anual?: boolean; ativo?: boolean },
  ): Promise<void>;
}
