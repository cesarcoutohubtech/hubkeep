// POST /auth/segundo-fator/remocao — remove um dos próprios fatores (SP1,
// ADR-049). Quem tem papel que exige o segundo fator fica sempre com pelo
// menos um (422 segundo_fator_minimo). O Auth só remove fator verificado numa
// sessão em aal2.
import { PedidoDeRemocaoDeFator } from '@hubkeep/contratos';
import { exigirFatorRestante } from '@hubkeep/dominio';
import { exigeSegundoFatorNoUsuario } from '../../../../servidor/contexto';
import { ErroHttp, rota } from '../../../../servidor/http';
import { comCookies } from '../../../../servidor/sessao-supabase';
import { authDaSessao, erroDoAuth } from '../fatores';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = rota('auth.segundo_fator.remover', async (r) => {
  const usuario = await r.usuario();
  const { fatorId } = await r.corpo(PedidoDeRemocaoDeFator, { limiteBytes: 1024 });
  const { mfa, gravados } = authDaSessao(r.req);
  const lista = await mfa.listFactors();
  if (lista.error) throw erroDoAuth(lista.error, 'segundo_fator_indisponivel', 503);
  if (!lista.data.all.some((f) => f.id === fatorId)) {
    throw new ErroHttp(404, 'segundo_fator_nao_encontrado');
  }
  const restantes = lista.data.totp.filter((f) => f.id !== fatorId).length;
  exigirFatorRestante(await exigeSegundoFatorNoUsuario(usuario), restantes);
  const { error } = await mfa.unenroll({ factorId: fatorId });
  if (error) throw erroDoAuth(error, 'segundo_fator_obrigatorio', 403);
  return comCookies(new Response(null, { status: 204 }), gravados);
});
