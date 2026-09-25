// Tipos do domínio de identidade e escopo. Espelham o schema (app.papel,
// app.escopo_tipo), mas não dependem dele: o domínio não importa nada de IO.

export const PAPEIS = [
  'admin_grupo',
  'gestor_csc',
  'implantador',
  'gerente_hotel',
  'tecnico',
  'solicitante',
  'proprietario',
] as const;
export type Papel = (typeof PAPEIS)[number];

/** Usuário autenticado e tenant ativo de uma operação. */
export interface Contexto {
  usuarioId: string;
  tenantId: string;
}

export type Escopo =
  | { tipo: 'grupo' }
  | { tipo: 'bandeira'; bandeiraId: string }
  | { tipo: 'hotel'; hotelId: string }
  | { tipo: 'proprietario'; proprietarioId: string };

/** Uma concessão de papel num escopo, como a regra precisa enxergá-la. */
export interface Atribuicao {
  id: string;
  usuarioId: string;
  papel: Papel;
  escopo: Escopo;
  validoAte: Date | null;
  revogadoEm: Date | null;
}

/** O que se pede ao conceder um papel. */
export interface PedidoDeConcessao {
  usuarioId: string;
  papel: Papel;
  escopo: Escopo;
  validoAte?: Date | null;
}
