// MFA obrigatório (SP1, ADR-049): Admin do grupo, Gestor CSC e Implantador só
// usam o HubKeep com o segundo fator verificado na sessão (aal2). Quem tem um
// desses papéis vigente, mesmo junto de outro, exige em tudo. Os demais podem
// cadastrar o TOTP, sem exigência.
import { PermissaoNegada, RegraViolada } from './erros';
import { vigente } from './permissoes';
import type { Atribuicao, Papel } from './tipos';

/** O nível da sessão no Auth: aal1 só com a senha, aal2 com o TOTP verificado. */
export type NivelDaSessao = 'aal1' | 'aal2';

export const PAPEIS_COM_SEGUNDO_FATOR: readonly Papel[] = [
  'admin_grupo',
  'gestor_csc',
  'implantador',
];

/** Alguma atribuição vigente exige o segundo fator. */
export function exigeSegundoFator(atribuicoes: readonly Atribuicao[], agora: Date): boolean {
  return atribuicoes.some((a) => vigente(a, agora) && PAPEIS_COM_SEGUNDO_FATOR.includes(a.papel));
}

/** Recusa a sessão em aal1 de quem exige o segundo fator (403 segundo_fator_obrigatorio). */
export function exigirNivelDaSessao(
  nivel: NivelDaSessao,
  atribuicoes: readonly Atribuicao[],
  agora: Date,
): void {
  if (nivel === 'aal2' || !exigeSegundoFator(atribuicoes, agora)) return;
  throw new PermissaoNegada(
    'segundo_fator_obrigatorio',
    'Este papel exige o segundo fator na sessão.',
  );
}

/**
 * A pessoa remove um dos próprios fatores (SP1, "Minha conta → Segurança"):
 * quem exige o segundo fator fica sempre com pelo menos um verificado
 * (422 segundo_fator_minimo).
 */
export function exigirFatorRestante(exige: boolean, verificadosDepois: number): void {
  if (exige && verificadosDepois < 1) {
    throw new RegraViolada(
      'segundo_fator_minimo',
      'Seu papel exige o segundo fator: cadastre outro aparelho antes de remover este.',
    );
  }
}
