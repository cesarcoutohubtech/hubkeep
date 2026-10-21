// POST /auth/segundo-fator/verificacao — confirma o código do aparelho que
// está sendo cadastrado (SP1, ADR-049). A sessão sobe a aal2, e o cookie é
// regravado.
import { PedidoDeVerificacaoDeFator } from '@hubkeep/contratos';
import { rota } from '../../../../servidor/http';
import { comCookies } from '../../../../servidor/sessao-supabase';
import { authDaSessao, erroDoAuth } from '../fatores';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = rota('auth.segundo_fator.verificar', async (r) => {
  await r.usuario();
  const { fatorId, codigo } = await r.corpo(PedidoDeVerificacaoDeFator, { limiteBytes: 1024 });
  const { mfa, gravados } = authDaSessao(r.req);
  const { error } = await mfa.challengeAndVerify({ factorId: fatorId, code: codigo });
  if (error) throw erroDoAuth(error, 'codigo_invalido');
  return comCookies(new Response(null, { status: 204 }), gravados);
});
