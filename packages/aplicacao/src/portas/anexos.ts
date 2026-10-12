// Portas dos anexos (F0-10 e B4, ADR-024). O arquivo mora no Storage, num
// bucket privado sem policy para o usuário; a URL assinada sai do auth-admin
// (dono da secret key) só depois de o escopo ser conferido pela RLS, no hk_app.
// O registro do arquivo (app.anexo, B4) é gravado na unit of work.
import type { Contexto, MomentoDaFoto } from '@hubkeep/dominio';

/** Entidades que recebem anexo; o chamado entrou na C2, e a OS (fotos da execução) na C4. */
export const ENTIDADES_COM_ANEXO = ['hotel', 'local', 'ativo', 'chamado', 'os'] as const;
export type EntidadeComAnexo = (typeof ENTIDADES_COM_ANEXO)[number];

/** Emissão de URL assinada (implementada em packages/auth-admin). */
export interface ArmazenamentoDeArquivos {
  /**
   * URL de upload para um caminho novo; o aparelho envia direto para ela.
   * null: o caminho já tem arquivo (o reenvio da foto offline, com o mesmo
   * arquivoId; C4).
   */
  urlDeUpload(caminho: string): Promise<{ url: string; token: string } | null>;
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

/** Anexo registrado, como a RLS o mostra ao usuário. */
export interface AnexoGravado {
  id: string;
  hotelId: string;
  entidade: EntidadeComAnexo;
  registroId: string;
  caminho: string;
  miniaturaCaminho: string | null;
  tipo: string;
  nome: string | null;
  /** Foto da OS antes ou depois (I8); null: sem momento. */
  momento: MomentoDaFoto | null;
  /** A assinatura do aceite (I8): imutável, ninguém a remove. */
  assinatura: boolean;
  usuarioId: string;
  /** Nome do membro que enviou; null se a RLS não mostra o membro. */
  nomeUsuario: string | null;
  criadoEm: Date;
  removidoEm: Date | null;
}

/** O que o registro grava, já conferido pelo caso de uso. */
export interface DadosDeAnexo {
  hotelId: string;
  entidade: EntidadeComAnexo;
  registroId: string;
  caminho: string;
  miniaturaCaminho: string | null;
  tipo: string;
  nome: string | null;
  /** Só na OS (I8); null: sem momento. */
  momento: MomentoDaFoto | null;
}

/** Registro dos anexos (implementado em packages/db, hk_app). */
export interface PortaAnexos {
  /** Hotel visível ao usuário, com a bandeira (para a regra de escopo); senão null. */
  hotel(ctx: Contexto, hotelId: string): Promise<{ id: string; bandeiraId: string | null } | null>;
  /** Anexos não removidos do registro, do mais novo para o mais antigo. */
  anexos(ctx: Contexto, entidade: EntidadeComAnexo, registroId: string): Promise<AnexoGravado[]>;
  anexo(ctx: Contexto, anexoId: string): Promise<AnexoGravado | null>;
  /** Na unit of work, com auditoria e evento. Arquivo já registrado: Conflito anexo_ja_registrado. */
  registrar(ctx: Contexto, dados: DadosDeAnexo): Promise<{ id: string }>;
  /** Remoção lógica na unit of work. Nada visível para remover: NaoEncontrado anexo_nao_encontrado. */
  remover(ctx: Contexto, anexoId: string): Promise<void>;
}
