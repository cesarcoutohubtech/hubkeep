// Convite dos dados de demonstração do kit de teste (docs/05, "Kit de teste"):
// o caso de uso de convite de sempre (regra do domínio, membro, atribuição,
// auditoria e evento na unit of work), com a identidade que cria a conta já
// confirmada e com a senha de teste, sem e-mail. Nenhuma rota usa isto: só o
// script de demonstração (pnpm demo:dados, só no dev) e o teste dele na CI.
import { criarIdentidadeDeDemonstracao } from '@hubkeep/auth-admin';
import {
  type CasoDeUsoDeConvites,
  type ProvedorDeIdentidade,
  criarCasoDeUsoDeConvites,
} from '@hubkeep/aplicacao';
import { criarPortasDeAplicacao } from '@hubkeep/db';
import { acessoBanco, casosDeUsoDePapeis, urlSupabase } from './composicao';

/** A conta de demonstração, sem convite: só a do primeiro Admin, que ninguém convida. */
export function identidadeDeDemonstracao(senha: string): ProvedorDeIdentidade {
  // Na Vercel (preview ou produção) nunca: lá o convite é o de verdade.
  if (process.env.VERCEL_ENV) {
    throw new Error('Os dados de demonstração não rodam na Vercel.');
  }
  return criarIdentidadeDeDemonstracao({ url: urlSupabase(), senha });
}

export async function convitesDeDemonstracao(senha: string): Promise<CasoDeUsoDeConvites> {
  return criarCasoDeUsoDeConvites({
    papeis: await casosDeUsoDePapeis(),
    convites: criarPortasDeAplicacao(await acessoBanco()).convites,
    identidade: identidadeDeDemonstracao(senha),
  });
}
