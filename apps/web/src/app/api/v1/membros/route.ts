// GET /api/v1/membros — membros do tenant com as atribuições visíveis (A3).
// O Admin do grupo vê todas; o Implantador, as dos hotéis dele (RLS).
import { vigente } from '@hubkeep/dominio';
import { RespostaDeMembros } from '@hubkeep/contratos';
import { casosDeUsoDeMembros } from '../../../../servidor/composicao';
import { rota } from '../../../../servidor/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = rota('membros.listar', async (r) => {
  const ctx = await r.contexto();
  const agora = new Date();
  const membros = await (await casosDeUsoDeMembros()).listarMembros(ctx);
  return r.responder(200, RespostaDeMembros, {
    membros: membros.map((m) => ({
      usuarioId: m.usuarioId,
      nome: m.nome,
      email: m.email,
      ativo: m.ativo,
      atribuicoes: m.atribuicoes.map((a) => ({
        id: a.id,
        papel: a.papel,
        escopo: a.escopo,
        validoAte: a.validoAte?.toISOString() ?? null,
        revogadoEm: a.revogadoEm?.toISOString() ?? null,
        vigente: vigente(a, agora),
      })),
    })),
  });
});
