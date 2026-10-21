// GET /auth/segundo-fator — os fatores verificados do próprio usuário e se
// algum papel dele exige o segundo fator (SP1, ADR-049).
// POST /auth/segundo-fator — começa o cadastro de um aparelho novo: tira os
// cadastros que ficaram sem verificar e devolve o QR e o segredo. O fator só
// vale depois do código (/auth/segundo-fator/verificacao).
import {
  PedidoDeCadastroDeFator,
  RespostaDeCadastroDeFator,
  RespostaDeFatores,
} from '@hubkeep/contratos';
import { exigeSegundoFatorNoUsuario } from '../../../servidor/contexto';
import { rota } from '../../../servidor/http';
import { comCookies } from '../../../servidor/sessao-supabase';
import { authDaSessao, erroDoAuth } from './fatores';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = rota('auth.segundo_fator.listar', async (r) => {
  const usuario = await r.usuario();
  const { mfa, gravados } = authDaSessao(r.req);
  const { data, error } = await mfa.listFactors();
  if (error) throw erroDoAuth(error, 'segundo_fator_indisponivel', 503);
  const resposta = r.responder(200, RespostaDeFatores, {
    exigido: await exigeSegundoFatorNoUsuario(usuario),
    fatores: data.totp.map((f) => ({
      id: f.id,
      nome: f.friendly_name ?? null,
      criadoEm: new Date(f.created_at).toISOString(),
    })),
  });
  return comCookies(resposta, gravados);
});

export const POST = rota('auth.segundo_fator.cadastrar', async (r) => {
  await r.usuario();
  const { nome } = await r.corpo(PedidoDeCadastroDeFator, { limiteBytes: 1024 });
  const { mfa, gravados } = authDaSessao(r.req);
  const lista = await mfa.listFactors();
  if (lista.error) throw erroDoAuth(lista.error, 'segundo_fator_indisponivel', 503);
  for (const f of lista.data.all) {
    if (f.factor_type === 'totp' && f.status === 'unverified')
      await mfa.unenroll({ factorId: f.id });
  }
  const { data, error } = await mfa.enroll({
    factorType: 'totp',
    ...(nome ? { friendlyName: nome } : {}),
  });
  // Com fator verificado, o Auth só cadastra outro numa sessão em aal2.
  if (error || !data) throw erroDoAuth(error ?? {}, 'segundo_fator_obrigatorio', 403);
  const resposta = r.responder(201, RespostaDeCadastroDeFator, {
    fatorId: data.id,
    qr: data.totp.qr_code,
    segredo: data.totp.secret,
  });
  return comCookies(resposta, gravados);
});
