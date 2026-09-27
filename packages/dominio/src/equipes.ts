// Equipes do hotel (fase 1a, A6): quem gerencia e o nome. O banco garante o
// mesmo "quem" pela policy (authz.hoteis_com_papel com os mesmos papéis); aqui
// a aplicação recusa antes, com código claro.
import { PermissaoNegada, RegraViolada } from './erros';
import { type Resultado, vigente } from './permissoes';
import type { Atribuicao, Papel } from './tipos';

/** Papéis que gerenciam equipes do hotel, no escopo deles. */
export const PAPEIS_QUE_GERENCIAM_EQUIPES: readonly Papel[] = [
  'admin_grupo',
  'gestor_csc',
  'implantador',
  'gerente_hotel',
];

/** O escopo da atribuição cobre o hotel? (grupo, bandeira do hotel ou o próprio hotel) */
export function escopoCobreHotel(
  a: Atribuicao,
  hotel: { id: string; bandeiraId: string | null },
): boolean {
  switch (a.escopo.tipo) {
    case 'grupo':
      return true;
    case 'bandeira':
      return hotel.bandeiraId !== null && a.escopo.bandeiraId === hotel.bandeiraId;
    case 'hotel':
      return a.escopo.hotelId === hotel.id;
    case 'proprietario':
      return false;
  }
}

export function podeGerirEquipes(
  minhas: readonly Atribuicao[],
  hotel: { id: string; bandeiraId: string | null },
  agora: Date,
): Resultado {
  const pode = minhas.some(
    (a) =>
      vigente(a, agora) &&
      PAPEIS_QUE_GERENCIAM_EQUIPES.includes(a.papel) &&
      escopoCobreHotel(a, hotel),
  );
  return pode
    ? { permitido: true }
    : {
        permitido: false,
        erro: new PermissaoNegada(
          'equipes_fora_do_escopo',
          'Você não gerencia equipes neste hotel.',
          { hotelId: hotel.id },
        ),
      };
}

/** Nome de equipe: sem espaços nas pontas, de 1 a 120 caracteres. */
export function normalizarNomeDeEquipe(nome: string): string {
  const limpo = nome.trim().replace(/\s+/g, ' ');
  if (limpo.length === 0 || limpo.length > 120) {
    throw new RegraViolada('equipe_nome_invalido', 'Nome de equipe inválido.', { maximo: 120 });
  }
  return limpo;
}
