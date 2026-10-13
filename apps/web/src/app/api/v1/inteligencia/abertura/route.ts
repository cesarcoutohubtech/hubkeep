// GET /api/v1/inteligencia/abertura — quando as telas do Intelligence abrem no
// grupo (inteligencia.visibilidade_telas; adendo ao ADR-035 de 12/10/2026).
// Só o Admin do grupo, com o módulo vigente, também antes da abertura; para os
// outros, 404 inteligencia_indisponivel.
import { PAPEIS_QUE_VEEM_AS_TELAS_API, RespostaDaAberturaDoIntelligence } from '@hubkeep/contratos';
import { casosDeUsoDoPainelDoIntelligence } from '../../../../../servidor/composicao';
import { rota } from '../../../../../servidor/http';
import { dataNaApi } from '../serializar';

// O motor só aceita na política os papéis que decidem insight; o filtro é o tipo.
const ehPapelQueVe = (p: string): p is (typeof PAPEIS_QUE_VEEM_AS_TELAS_API)[number] =>
  (PAPEIS_QUE_VEEM_AS_TELAS_API as readonly string[]).includes(p);

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = rota('inteligencia.abertura', async (r) => {
  const ctx = await r.contexto();
  const { config, abertura, abertas } = await (
    await casosDeUsoDoPainelDoIntelligence()
  ).abertura(ctx);
  return r.responder(200, RespostaDaAberturaDoIntelligence, {
    config: { ...config, papeis: config.papeis.filter(ehPapelQueVe) },
    abertura: abertura && {
      ...abertura,
      em: dataNaApi(abertura.em),
      primeiraAtivacao: abertura.primeiraAtivacao && dataNaApi(abertura.primeiraAtivacao),
    },
    abertas,
  });
});
