// Aprovação do cadastro do ativo (fase 1b, M4; migração 0058; decisões do
// Cesar de 19/10/2026, 15 a 17 do desenho):
//
//   - a política ativo.aprovacao_do_cadastro, por hotel, nasce desligada;
//     ligada, o ativo que chega pela operação ativo.cadastrar do PWA nasce
//     pendente; o cadastro no web e a importação nascem aprovados;
//   - aprovam ou recusam o Admin do grupo, o Gestor CSC e o Gerente do hotel,
//     no escopo deles; o Implantador não;
//   - a recusa exige motivo e desativa o ativo (exclusão lógica);
//   - o ativo pendente já recebe chamado, mas fica fora da geração preventiva
//     e das sugestões de plano até a aprovação.
//
// A situação efetiva é a do cadastro com a decisão: o banco guarda a
// situação inicial (pendente ou aprovado), que não muda, e a decisão, só de
// inserção.
import { escopoCobreHotel } from './equipes';
import { PermissaoNegada, RegraViolada } from './erros';
import { normalizarMotivo } from './corretiva';
import { type Resultado, vigente } from './permissoes';
import type { Atribuicao, Papel } from './tipos';

export const SITUACOES_DO_CADASTRO = ['pendente', 'aprovado', 'recusado'] as const;
export type SituacaoDoCadastro = (typeof SITUACOES_DO_CADASTRO)[number];

export const DECISOES_DO_CADASTRO = ['aprovado', 'recusado'] as const;
export type DecisaoDoCadastro = (typeof DECISOES_DO_CADASTRO)[number];

export const ehDecisaoDoCadastro = (v: unknown): v is DecisaoDoCadastro =>
  typeof v === 'string' && (DECISOES_DO_CADASTRO as readonly string[]).includes(v);

/** A situação efetiva: a decisão, quando há; senão, a situação com que o ativo nasceu. */
export function situacaoDoCadastro(
  inicial: 'pendente' | 'aprovado',
  decisao: DecisaoDoCadastro | null,
): SituacaoDoCadastro {
  return decisao ?? inicial;
}

/** Com que situação nasce o ativo do PWA, pela política do hotel. */
export function situacaoInicialNoPwa(politica: { ligado: boolean }): 'pendente' | 'aprovado' {
  return politica.ligado ? 'pendente' : 'aprovado';
}

/** Quem aprova ou recusa o cadastro no hotel (decisão 16). */
export const PAPEIS_QUE_DECIDEM_O_CADASTRO: readonly Papel[] = [
  'admin_grupo',
  'gestor_csc',
  'gerente_hotel',
];

export function podeDecidirCadastro(
  minhas: readonly Atribuicao[],
  hotel: { id: string; bandeiraId: string | null },
  agora: Date,
): Resultado {
  const pode = minhas.some(
    (a) =>
      vigente(a, agora) &&
      PAPEIS_QUE_DECIDEM_O_CADASTRO.includes(a.papel) &&
      escopoCobreHotel(a, hotel),
  );
  return pode
    ? { permitido: true }
    : {
        permitido: false,
        erro: new PermissaoNegada(
          'cadastro_fora_do_escopo',
          'Você não aprova os cadastros de ativo deste hotel.',
          { hotelId: hotel.id },
        ),
      };
}

/**
 * Confere a decisão sobre o cadastro: só o pendente é decidido, e a recusa
 * leva o motivo (normalizarMotivo, até 500). Devolve o motivo gravado (null
 * na aprovação).
 */
export function validarDecisaoDoCadastro(
  situacao: SituacaoDoCadastro,
  decisao: unknown,
  motivo: string | null | undefined,
): { decisao: DecisaoDoCadastro; motivo: string | null } {
  if (!ehDecisaoDoCadastro(decisao)) {
    throw new RegraViolada('decisao_do_cadastro_invalida', 'Decisão inválida.');
  }
  if (situacao !== 'pendente') {
    throw new RegraViolada('cadastro_ja_decidido', 'O cadastro deste ativo já foi decidido.', {
      situacao,
    });
  }
  return { decisao, motivo: decisao === 'recusado' ? normalizarMotivo(motivo) : null };
}
