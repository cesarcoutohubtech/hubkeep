// Permissões de ação sobre papéis e escopo.
//
// São as MESMAS regras que o banco já garante (policies de app.atribuicao_escopo
// e constraints da migração de fundação — docs/02, "Regras de escalada"), aqui
// para a aplicação recusar com mensagem clara antes de o banco recusar com um
// 42501 genérico. O banco continua sendo a garantia: o teste de paridade da CI
// (packages/db/test/paridade-concessao.test.ts) prova que tudo o que o domínio
// permite o banco aceita, e que toda escalada que o domínio nega o banco também
// nega — mesmo se esta checagem for removida.
//
// Há UMA regra só daqui, de negócio e não de autorização: validade no passado.
// O banco aceita (a constraint só exige que exista); a aplicação recusa.
import { PermissaoNegada, RegraViolada, type ErroDeDominio } from './erros';
import type { Atribuicao, Papel, PedidoDeConcessao } from './tipos';

export type Resultado = { permitido: true } | { permitido: false; erro: ErroDeDominio };

const PERMITIDO: Resultado = { permitido: true };
const negar = (erro: ErroDeDominio): Resultado => ({ permitido: false, erro });

/** Papéis que o Implantador nunca concede nem revoga (docs/02). */
const FORA_DO_ALCANCE_DO_IMPLANTADOR: readonly Papel[] = [
  'admin_grupo',
  'implantador',
  'proprietario',
];

export function vigente(a: Atribuicao, agora: Date): boolean {
  return a.revogadoEm === null && (a.validoAte === null || a.validoAte > agora);
}

export function ehAdminGrupo(atribuicoes: readonly Atribuicao[], agora: Date): boolean {
  return atribuicoes.some(
    (a) => vigente(a, agora) && a.papel === 'admin_grupo' && a.escopo.tipo === 'grupo',
  );
}

export function hoteisComoImplantador(
  atribuicoes: readonly Atribuicao[],
  agora: Date,
): Set<string> {
  const hoteis = new Set<string>();
  for (const a of atribuicoes) {
    if (vigente(a, agora) && a.papel === 'implantador' && a.escopo.tipo === 'hotel') {
      hoteis.add(a.escopo.hotelId);
    }
  }
  return hoteis;
}

/** Invariantes do pedido — as constraints da fundação, mais a validade futura. */
function validarPedido(pedido: PedidoDeConcessao, agora: Date): Resultado {
  const { papel, escopo } = pedido;
  const validoAte = pedido.validoAte ?? null;
  if (papel === 'proprietario' && escopo.tipo !== 'proprietario' && escopo.tipo !== 'hotel') {
    return negar(
      new RegraViolada(
        'proprietario_escopo_invalido',
        'O papel Proprietário só vale para UHs de um proprietário ou para um hotel inteiro.',
        { escopo: escopo.tipo },
      ),
    );
  }
  if (escopo.tipo === 'proprietario' && papel !== 'proprietario') {
    return negar(
      new RegraViolada(
        'escopo_proprietario_so_para_proprietario',
        'O escopo de proprietário só serve ao papel Proprietário.',
        { papel },
      ),
    );
  }
  if (papel === 'implantador' && (escopo.tipo !== 'hotel' || validoAte === null)) {
    return negar(
      new RegraViolada(
        'implantador_exige_hotel_e_validade',
        'O Implantador é concedido por hotel e sempre com data de validade.',
      ),
    );
  }
  if (validoAte !== null && validoAte <= agora) {
    return negar(
      new RegraViolada('validade_no_passado', 'A validade precisa ser uma data futura.'),
    );
  }
  return PERMITIDO;
}

/**
 * Quem concede pode conceder este papel neste escopo?
 * @param atribuicoes as atribuições de QUEM CONCEDE (não as do alvo).
 */
export function podeConcederPapel(
  atribuicoes: readonly Atribuicao[],
  pedido: PedidoDeConcessao,
  agora: Date,
): Resultado {
  if (!ehAdminGrupo(atribuicoes, agora)) {
    const hoteis = hoteisComoImplantador(atribuicoes, agora);
    if (hoteis.size === 0) {
      return negar(
        new PermissaoNegada(
          'concessao_so_admin_ou_implantador',
          'Só o Admin do grupo e o Implantador concedem papéis.',
        ),
      );
    }
    if (FORA_DO_ALCANCE_DO_IMPLANTADOR.includes(pedido.papel)) {
      return negar(
        new PermissaoNegada(
          'implantador_nao_concede_papel',
          `O Implantador não concede o papel ${rotulo(pedido.papel)}.`,
          { papel: pedido.papel },
        ),
      );
    }
    if (pedido.escopo.tipo !== 'hotel') {
      return negar(
        new PermissaoNegada(
          'implantador_so_concede_em_hotel',
          'O Implantador só concede papéis no escopo de um hotel.',
          { escopo: pedido.escopo.tipo },
        ),
      );
    }
    if (!hoteis.has(pedido.escopo.hotelId)) {
      return negar(
        new PermissaoNegada('nao_e_implantador_no_hotel', 'Você não é Implantador neste hotel.', {
          hotelId: pedido.escopo.hotelId,
        }),
      );
    }
  }
  return validarPedido(pedido, agora);
}

/**
 * Quem revoga pode revogar esta atribuição? Papel e escopo de uma atribuição são
 * imutáveis (ADR-011): mudar é revogar e conceder de novo.
 */
export function podeRevogarPapel(
  atribuicoes: readonly Atribuicao[],
  alvo: Atribuicao,
  agora: Date,
): Resultado {
  if (alvo.revogadoEm !== null) {
    return negar(new RegraViolada('ja_revogada', 'Esta atribuição já foi revogada.'));
  }
  if (ehAdminGrupo(atribuicoes, agora)) return PERMITIDO;

  const hoteis = hoteisComoImplantador(atribuicoes, agora);
  if (hoteis.size === 0) {
    return negar(
      new PermissaoNegada(
        'revogacao_so_admin_ou_implantador',
        'Só o Admin do grupo e o Implantador revogam papéis.',
      ),
    );
  }
  if (FORA_DO_ALCANCE_DO_IMPLANTADOR.includes(alvo.papel)) {
    return negar(
      new PermissaoNegada(
        'implantador_nao_revoga_papel',
        `O Implantador não revoga o papel ${rotulo(alvo.papel)}.`,
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
  return PERMITIDO;
}

/** Ativar hotel consome licença: só o Admin do grupo (docs/00). */
export function podeAtivarHotel(atribuicoes: readonly Atribuicao[], agora: Date): Resultado {
  return ehAdminGrupo(atribuicoes, agora)
    ? PERMITIDO
    : negar(new PermissaoNegada('ativacao_so_admin', 'Só o Admin do grupo ativa hotéis.'));
}

/** Lança o erro de um resultado negado. */
export function exigir(resultado: Resultado): void {
  if (!resultado.permitido) throw resultado.erro;
}

const ROTULOS: Record<Papel, string> = {
  admin_grupo: 'Admin do grupo',
  gestor_csc: 'Gestor CSC',
  implantador: 'Implantador',
  gerente_hotel: 'Gerente do hotel',
  tecnico: 'Técnico',
  solicitante: 'Solicitante',
  proprietario: 'Proprietário',
};
export const rotulo = (p: Papel): string => ROTULOS[p];
