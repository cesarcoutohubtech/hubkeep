// O responsável padrão dos planos preventivos como a regra o enxerga
// (ResponsavelDoPlano): o técnico, com o membro ativo e as atribuições, ou a
// equipe, com o hotel e se está ativa. Lido em lote, pelo hk_worker na geração
// da OS (PV3) e pelo hk_app nas pendências da tela do plano (PV3c), cada um
// com a RLS do próprio papel.
import type { ResponsavelDoPlano } from '@hubkeep/dominio';
import { paraAtribuicao, selecionarAtribuicoes } from './atribuicoes';
import type { Tx } from './conexao';

export async function responsaveisDosPlanos(
  tx: Tx,
  planos: readonly { id: string; tecnico_id: string | null; equipe_id: string | null }[],
): Promise<Map<string, ResponsavelDoPlano | null>> {
  const tecnicos = [...new Set(planos.flatMap((p) => (p.tecnico_id ? [p.tecnico_id] : [])))];
  const equipes = [...new Set(planos.flatMap((p) => (p.equipe_id ? [p.equipe_id] : [])))];
  const membros =
    tecnicos.length === 0
      ? []
      : await tx
          .selectFrom('app.membro')
          .select(['usuario_id', 'ativo'])
          .where('usuario_id', 'in', tecnicos)
          .execute();
  const atribuicoes =
    tecnicos.length === 0
      ? []
      : (await selecionarAtribuicoes(tx).where('usuario_id', 'in', tecnicos).execute()).map(
          paraAtribuicao,
        );
  const equipesLidas =
    equipes.length === 0
      ? []
      : await tx
          .selectFrom('app.equipe')
          .select(['id', 'hotel_id', 'ativa'])
          .where('id', 'in', equipes)
          .execute();
  const responsavel = (p: (typeof planos)[number]): ResponsavelDoPlano | null => {
    if (p.tecnico_id !== null) {
      const usuarioId = p.tecnico_id;
      return {
        tipo: 'tecnico',
        usuarioId,
        membroAtivo: membros.some((m) => m.usuario_id === usuarioId && m.ativo),
        atribuicoes: atribuicoes.filter((a) => a.usuarioId === usuarioId),
      };
    }
    const e = equipesLidas.find((x) => x.id === p.equipe_id);
    return e ? { tipo: 'equipe', equipeId: e.id, hotelId: e.hotel_id, ativa: e.ativa } : null;
  };
  return new Map(planos.map((p) => [p.id, responsavel(p)]));
}
