// Portas dos anexos (F0-10, ADR-024). O arquivo mora no Storage, num bucket
// privado sem policy para o usuário; a URL assinada sai do auth-admin (dono da
// secret key) só depois de o escopo ser conferido pela RLS, no hk_app.
import type { Contexto } from '@hubkeep/dominio';

/** Entidades que recebem anexo na fase 0; OS, chamado e ativo entram na fase 1a. */
export const ENTIDADES_COM_ANEXO = ['hotel', 'local'] as const;
export type EntidadeComAnexo = (typeof ENTIDADES_COM_ANEXO)[number];

/** Emissão de URL assinada (implementada em packages/auth-admin). */
export interface ArmazenamentoDeArquivos {
  /** URL de upload para um caminho novo; o aparelho envia direto para ela. */
  urlDeUpload(caminho: string): Promise<{ url: string; token: string }>;
  /** URL de download de curta duração. */
  urlDeDownload(caminho: string, segundos: number): Promise<string>;
}

/** Escopo do usuário, pela RLS (implementado em packages/db, hk_app). */
export interface PortaEscopoDeAnexo {
  /** Hotel do registro, se o usuário do contexto o enxerga; senão null. */
  hotelDoRegistro(
    ctx: Contexto,
    entidade: EntidadeComAnexo,
    registroId: string,
  ): Promise<string | null>;
  /** O hotel está entre os que o usuário escreve (authz.hoteis_escrita)? */
  escreveNoHotel(ctx: Contexto, hotelId: string): Promise<boolean>;
  /** O hotel está entre os que o usuário lê (authz.hoteis_leitura)? */
  leNoHotel(ctx: Contexto, hotelId: string): Promise<boolean>;
}
