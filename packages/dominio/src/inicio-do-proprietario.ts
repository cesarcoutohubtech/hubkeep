// O cartão "UHs acompanhadas" da tela inicial (1c, seção 4 da paridade): as
// UHs de cada hotel a que o proprietário está ligado por UHs (condo-hotel). Os
// vínculos vêm do banco (authz.hoteis_proprietario e
// authz.locais_proprietario), porque a RLS não os mostra ao proprietário.
// O cartão "Categorias sob o locador" espera decisão: o proprietário não lê
// políticas (migração 0013), e a matriz do arrendamento é uma política.
import { PermissaoNegada } from './erros';
import { type Resultado, vigente } from './permissoes';
import type { Atribuicao } from './tipos';

/** Um hotel de que quem pede é proprietário: do hotel inteiro, ou de UHs dele. */
export interface VinculoDoProprietario {
  hotelId: string;
  hotelNome: string;
  /** O vínculo é com o hotel inteiro (o locador, se o hotel é arrendado; decisão 6). */
  hotelInteiro: boolean;
  /** As UHs ativas no escopo dele; no hotel inteiro, todas. */
  uhs: number;
}

/**
 * Os hotéis do cartão "UHs acompanhadas": os ligados só por UHs, com alguma UH
 * ativa. O vínculo com o hotel inteiro vale mais que o das UHs do mesmo hotel.
 */
export const hoteisDasUhsAcompanhadas = (
  vinculos: readonly VinculoDoProprietario[],
): VinculoDoProprietario[] => vinculos.filter((v) => !v.hotelInteiro && v.uhs > 0);

/** Quem abre o cartão: o proprietário, com o papel vigente. */
export function podeVerOInicioDoProprietario(
  minhas: readonly Atribuicao[],
  agora: Date,
): Resultado {
  return minhas.some(
    (a) => vigente(a, agora) && a.papel === 'proprietario' && a.escopo.tipo === 'proprietario',
  )
    ? { permitido: true }
    : {
        permitido: false,
        erro: new PermissaoNegada(
          'inicio_do_proprietario_sem_permissao',
          'Só o proprietário vê o cartão das unidades acompanhadas.',
        ),
      };
}
