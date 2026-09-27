// Bandeiras (fase 1a, A2): quem cria, renomeia e desativa, e a regra de não
// ligar hotel a bandeira desativada. O banco garante o "quem" (policy do Admin
// do grupo); a regra da bandeira desativada é só da aplicação (regra 2).
import { PermissaoNegada, RegraViolada } from './erros';
import { type Resultado, ehAdminGrupo } from './permissoes';
import type { Atribuicao } from './tipos';

const PERMITIDO: Resultado = { permitido: true };

/** Criar, renomear, desativar bandeira e trocar a bandeira do hotel: só o Admin do grupo. */
export function podeGerirBandeiras(minhas: readonly Atribuicao[], agora: Date): Resultado {
  return ehAdminGrupo(minhas, agora)
    ? PERMITIDO
    : {
        permitido: false,
        erro: new PermissaoNegada('bandeiras_so_admin', 'Só o Admin do grupo gerencia bandeiras.'),
      };
}

/** Hotel só vai para bandeira ativa; sem bandeira (null) é sempre possível. */
export function podeLigarHotelABandeira(bandeira: { ativa: boolean } | null): Resultado {
  if (bandeira && !bandeira.ativa) {
    return {
      permitido: false,
      erro: new RegraViolada('bandeira_desativada', 'Esta bandeira está desativada.'),
    };
  }
  return PERMITIDO;
}

/** Nome de bandeira: sem espaços nas pontas, de 1 a 120 caracteres. */
export function normalizarNomeDeBandeira(nome: string): string {
  const limpo = nome.trim().replace(/\s+/g, ' ');
  if (limpo.length === 0 || limpo.length > 120) {
    throw new RegraViolada('bandeira_nome_invalido', 'Nome de bandeira inválido.', { maximo: 120 });
  }
  return limpo;
}
