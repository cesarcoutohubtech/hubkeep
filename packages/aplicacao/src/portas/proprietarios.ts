// Porta de proprietários e vínculos (fase 1a, A4; ADR-031). Implementada por
// packages/db, com o contexto do usuário: proprietário e vínculo com hotel só
// o Admin do grupo lê e grava (RLS); o vínculo com UH o proprietário também lê.
import type { Contexto, Vigencia } from '@hubkeep/dominio';

export interface Proprietario {
  id: string;
  nome: string;
  documento: string | null;
}

export type TipoDeVinculo = 'uh' | 'hotel';

export interface VinculoDeProprietario {
  id: string;
  tipo: TipoDeVinculo;
  proprietarioId: string;
  hotelId: string;
  hotelNome: string;
  /** Só no vínculo com UH. */
  localId: string | null;
  localNome: string | null;
  vigencia: Vigencia;
}

export interface LocalDoHotel {
  id: string;
  hotelId: string;
  nome: string;
  tipo: 'uh' | 'area_comum';
  status: string;
}

export interface PortaProprietarios {
  listar(
    ctx: Contexto,
  ): Promise<{ proprietarios: Proprietario[]; vinculos: VinculoDeProprietario[] }>;
  /** Hotel visível a quem pede; senão null. */
  hotel(ctx: Contexto, hotelId: string): Promise<{ id: string; nome: string } | null>;
  local(ctx: Contexto, localId: string): Promise<LocalDoHotel | null>;
  /** Na unit of work, com auditoria (sem o documento: dado pessoal). */
  criar(ctx: Contexto, dados: Omit<Proprietario, 'id'>): Promise<{ id: string }>;
  alterar(ctx: Contexto, id: string, dados: Omit<Proprietario, 'id'>): Promise<void>;
  vincular(
    ctx: Contexto,
    v: {
      tipo: TipoDeVinculo;
      proprietarioId: string;
      hotelId: string;
      localId: string | null;
      vigencia: Vigencia;
    },
  ): Promise<{ id: string }>;
  alterarVigencia(
    ctx: Contexto,
    tipo: TipoDeVinculo,
    vinculoId: string,
    vigencia: Vigencia,
  ): Promise<void>;
}
