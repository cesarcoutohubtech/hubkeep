// Gestão de membros (fase 1a, A3): quem vê a lista, quem desativa ou reativa
// um membro e quem muda a validade de uma atribuição.
//
// Como nas regras de concessão, o banco é a garantia: a policy de UPDATE de
// app.membro deixa o Admin do grupo e o Implantador (nunca sobre membro com
// papel Admin ou Implantador), e a de app.atribuicao_escopo só deixa o
// Implantador mexer em papéis abaixo dele, nos hotéis dele. Aqui a aplicação
// recusa antes, com código claro, e é mais estrita: só o Admin do grupo
// desativa ou reativa membro.
import { PermissaoNegada, RegraViolada } from './erros';
import { type Resultado, ehAdminGrupo, hoteisComoImplantador } from './permissoes';
import type { Atribuicao, Papel } from './tipos';

const PERMITIDO: Resultado = { permitido: true };
const negar = (erro: PermissaoNegada | RegraViolada): Resultado => ({ permitido: false, erro });

const FORA_DO_ALCANCE_DO_IMPLANTADOR: readonly Papel[] = [
  'admin_grupo',
  'implantador',
  'proprietario',
];

/** Ver a lista de membros e as atribuições: Admin do grupo ou Implantador vigente. */
export function podeGerirMembros(minhas: readonly Atribuicao[], agora: Date): Resultado {
  if (ehAdminGrupo(minhas, agora) || hoteisComoImplantador(minhas, agora).size > 0)
    return PERMITIDO;
  return negar(
    new PermissaoNegada(
      'gestao_de_membros_so_admin_ou_implantador',
      'Só o Admin do grupo e o Implantador gerenciam membros.',
    ),
  );
}

/**
 * Desativar (ou reativar) um membro: só o Admin do grupo. Desativado, o membro
 * perde o acesso ao tenant inteiro na transação seguinte (authz.tenant_id() só
 * aceita membro ativo). O Implantador, que tem escopo de hotel, tira o acesso
 * revogando os papéis no hotel dele, e não desativando. Ele não enxerga as
 * atribuições do membro em outros hotéis (RLS), então não teria como saber se
 * a desativação passaria do próprio escopo.
 */
export function podeAlterarAtivoDoMembro(
  minhas: readonly Atribuicao[],
  eu: string,
  alvo: { usuarioId: string },
  agora: Date,
): Resultado {
  if (alvo.usuarioId === eu) {
    return negar(
      new RegraViolada('nao_altera_o_proprio_acesso', 'Você não altera o próprio acesso.'),
    );
  }
  if (ehAdminGrupo(minhas, agora)) return PERMITIDO;
  return negar(
    new PermissaoNegada(
      'ativacao_de_membro_so_admin',
      'Só o Admin do grupo desativa ou reativa membros.',
    ),
  );
}

/**
 * Mudar a validade de uma atribuição (ex.: prorrogar o Implantador). O Admin do
 * grupo muda qualquer uma; o Implantador, só as de papéis abaixo dele, nos
 * hotéis dele. O Implantador continua sempre com validade.
 */
export function podeAlterarValidade(
  minhas: readonly Atribuicao[],
  alvo: Atribuicao,
  novaValidade: Date | null,
  agora: Date,
): Resultado {
  if (alvo.revogadoEm !== null) {
    return negar(new RegraViolada('ja_revogada', 'Esta atribuição já foi revogada.'));
  }
  if (!ehAdminGrupo(minhas, agora)) {
    const hoteis = hoteisComoImplantador(minhas, agora);
    if (hoteis.size === 0) {
      return negar(
        new PermissaoNegada(
          'validade_so_admin_ou_implantador',
          'Só o Admin do grupo e o Implantador alteram validade.',
        ),
      );
    }
    if (FORA_DO_ALCANCE_DO_IMPLANTADOR.includes(alvo.papel)) {
      return negar(
        new PermissaoNegada(
          'implantador_nao_altera_validade_do_papel',
          'O Implantador não altera a validade deste papel.',
          { papel: alvo.papel },
        ),
      );
    }
    if (alvo.escopo.tipo !== 'hotel' || !hoteis.has(alvo.escopo.hotelId)) {
      return negar(
        new PermissaoNegada(
          'nao_e_implantador_no_hotel_da_atribuicao',
          'Você não é Implantador no hotel desta atribuição.',
        ),
      );
    }
  }
  if (novaValidade === null && alvo.papel === 'implantador') {
    return negar(
      new RegraViolada(
        'implantador_exige_hotel_e_validade',
        'O Implantador é concedido por hotel e sempre com data de validade.',
      ),
    );
  }
  if (novaValidade !== null && novaValidade <= agora) {
    return negar(
      new RegraViolada('validade_no_passado', 'A validade precisa ser uma data futura.'),
    );
  }
  return PERMITIDO;
}

/**
 * Remover o segundo fator de um membro que perdeu o aparelho (SP1, ADR-049 e
 * adendo ao ADR-024): só o Admin do grupo, e nunca o próprio (quem ainda entra
 * troca o aparelho pela própria conta). O único Admin que perde tudo volta pelo
 * backoffice.
 */
export function podeRemoverSegundoFator(
  minhas: readonly Atribuicao[],
  eu: string,
  alvo: { usuarioId: string },
  agora: Date,
): Resultado {
  if (alvo.usuarioId === eu) {
    return negar(
      new RegraViolada(
        'nao_remove_o_proprio_segundo_fator',
        'Você não remove o próprio segundo fator.',
      ),
    );
  }
  if (ehAdminGrupo(minhas, agora)) return PERMITIDO;
  return negar(
    new PermissaoNegada(
      'segundo_fator_so_admin',
      'Só o Admin do grupo remove o segundo fator de um membro.',
    ),
  );
}
