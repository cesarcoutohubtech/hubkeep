// Tema das telas do web (ADR-038): escuro por padrão, claro por escolha. A
// escolha fica no cookie hk_tema, que o layout lê no servidor para a página
// já chegar no tema certo, sem piscar. O cookie só escolhe a aparência.
import { type Tema, ehTema } from '@hubkeep/ui';

export const COOKIE_TEMA = 'hk_tema';
export const TEMA_PADRAO: Tema = 'escuro';

export const temaDoCookie = (valor: string | undefined): Tema =>
  ehTema(valor) ? valor : TEMA_PADRAO;
