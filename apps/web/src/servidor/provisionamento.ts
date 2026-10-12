// Provisionamento de cliente (docs/13, "Preparação do piloto"): a identidade
// do primeiro Admin do grupo, que ninguém convida pela tela, porque o grupo
// ainda não tem Admin. É a mesma identidade do convite (ADR-018): cria o
// usuário no Auth sem senha, sem confirmação e sem e-mail, e o convite sai
// depois, pelo worker, com o evento membro.convidado. Nenhuma rota usa isto:
// só o script de operação `pnpm ops:provisionar`, na máquina de quem opera.
import { criarAdministracaoDoAuth } from '@hubkeep/auth-admin';
import type { ProvedorDeIdentidade } from '@hubkeep/aplicacao';
import { urlSupabase } from './composicao';

export function identidadeDoPrimeiroAdmin(): ProvedorDeIdentidade {
  return criarAdministracaoDoAuth({ url: urlSupabase() }).identidade;
}
