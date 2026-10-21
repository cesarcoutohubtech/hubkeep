// GET /api/v1/inteligencia/sinais/acesso — se quem pede usa a tela de
// reclamações de hóspedes (adendo de 20/10/2026 ao ADR-035): desde o contrato
// do módulo, antes da data de abertura das telas. O menu e a tela leem daqui
// se as outras telas do módulo já abriram.
import { RespostaDoAcessoAsReclamacoes } from '@hubkeep/contratos';
import { casosDeUsoDoPainelDoIntelligence } from '../../../../../../servidor/composicao';
import { rota } from '../../../../../../servidor/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = rota('inteligencia.sinais.acesso', async (r) => {
  const ctx = await r.contexto();
  const acesso = await (await casosDeUsoDoPainelDoIntelligence()).acessoAsReclamacoes(ctx);
  return r.responder(200, RespostaDoAcessoAsReclamacoes, acesso);
});
