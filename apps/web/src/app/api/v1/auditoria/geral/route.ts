// GET /api/v1/auditoria/geral?de=&ate=[&hotelId=&entidade=&acao=&pessoa=&cursor=&exportacao=1]
// — a auditoria geral (fase 1c): o que a gestão enxerga, da mais nova para a
// mais antiga, em páginas por cursor. A exportação pede 1.000 linhas por
// página, e a tela junta o CSV. Só o Admin do grupo, o Gestor CSC e o Gerente
// do hotel (403 auditoria_sem_permissao); o escopo é o da RLS (ADR-021).
import { ConsultaDaAuditoriaGeral, RespostaDaAuditoriaGeral } from '@hubkeep/contratos';
import { casosDeUsoDeAuditoriaGeral } from '../../../../../servidor/composicao';
import { rota } from '../../../../../servidor/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = rota('auditoria.geral', async (r) => {
  const ctx = await r.contexto();
  const c = r.consulta(ConsultaDaAuditoriaGeral);
  const p = await (
    await casosDeUsoDeAuditoriaGeral()
  ).pagina(
    ctx,
    {
      de: new Date(c.de),
      ate: new Date(c.ate),
      hotelId: c.hotelId ?? null,
      entidade: c.entidade ?? null,
      acao: c.acao ?? null,
      pessoa: c.pessoa ?? null,
    },
    { cursor: c.cursor ?? null, exportacao: c.exportacao === '1' },
  );
  return r.responder(200, RespostaDaAuditoriaGeral, {
    ...p,
    linhas: p.linhas.map((l) => ({ ...l, em: l.em.toISOString() })),
  });
});
