// Atribuições de escopo como o domínio as enxerga (Atribuicao), lidas pelo
// hk_app (papéis, triagem) e pelo hk_worker (o responsável do plano na
// geração da preventiva, PV3).
import type { Atribuicao, Escopo } from '@hubkeep/dominio';
import type { Tx } from './conexao';

export interface LinhaAtribuicao {
  id: string;
  usuario_id: string;
  papel: Atribuicao['papel'];
  escopo_tipo: Escopo['tipo'];
  bandeira_id: string | null;
  hotel_id: string | null;
  proprietario_id: string | null;
  valido_ate: Date | null;
  revogado_em: Date | null;
}

function escopoDe(l: LinhaAtribuicao): Escopo {
  // A constraint escopo_coerente garante que a coluna do tipo está preenchida.
  switch (l.escopo_tipo) {
    case 'grupo':
      return { tipo: 'grupo' };
    case 'bandeira':
      return { tipo: 'bandeira', bandeiraId: l.bandeira_id ?? '' };
    case 'hotel':
      return { tipo: 'hotel', hotelId: l.hotel_id ?? '' };
    case 'proprietario':
      return { tipo: 'proprietario', proprietarioId: l.proprietario_id ?? '' };
  }
}

export const paraAtribuicao = (l: LinhaAtribuicao): Atribuicao => ({
  id: l.id,
  usuarioId: l.usuario_id,
  papel: l.papel,
  escopo: escopoDe(l),
  validoAte: l.valido_ate,
  revogadoEm: l.revogado_em,
});

const COLUNAS = [
  'id',
  'usuario_id',
  'papel',
  'escopo_tipo',
  'bandeira_id',
  'hotel_id',
  'proprietario_id',
  'valido_ate',
  'revogado_em',
] as const;

/** As atribuições, com as colunas que paraAtribuicao lê. */
export const selecionarAtribuicoes = (tx: Tx) =>
  tx.selectFrom('app.atribuicao_escopo').select(COLUNAS);
