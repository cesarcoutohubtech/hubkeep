// Ativos do hotel (fase 1a, B3; ADR-028 e ADR-029).
//
// O ativo fica num local do hotel e, opcionalmente, numa categoria do tenant;
// a categoria define os campos estendidos (campos-tipados.ts). O local só
// muda pela ação de mover, dentro do mesmo hotel (B3c, adendo ao ADR-011): ele
// decide o que o proprietário vê. Entre hotéis, desativar e cadastrar de novo.
// Quem cadastra e altera: os papéis que gerem locais e o técnico, que cadastra
// pelo celular (operação offline, ADR-025), no escopo do hotel. A RLS de
// app.ativo deixa gravar quem tem escrita no hotel; a restrição por papel é
// regra de ação, daqui (regra 2).
// Concorrência (ADR-029): a alteração leva a versão que o usuário viu; se a
// linha mudou nesse meio-tempo, o repositório recusa com conflito_de_versao.
import { type DefinicaoDeCampo, type ValorDeCampo, validarValores } from './campos-tipados';
import { escopoCobreHotel } from './equipes';
import { Conflito, PermissaoNegada, RegraViolada } from './erros';
import { PAPEIS_QUE_GERENCIAM_LOCAIS } from './locais';
import { type Resultado, vigente } from './permissoes';
import type { StatusDeLocal } from './licenca';
import type { Atribuicao, Papel } from './tipos';

export const PAPEIS_QUE_GERENCIAM_ATIVOS: readonly Papel[] = [
  ...PAPEIS_QUE_GERENCIAM_LOCAIS,
  'tecnico',
];

export const LIMITES_DE_ATIVO = { nome: 120, texto: 120 } as const;

export function podeGerirAtivos(
  minhas: readonly Atribuicao[],
  hotel: { id: string; bandeiraId: string | null },
  agora: Date,
): Resultado {
  const pode = minhas.some(
    (a) =>
      vigente(a, agora) &&
      PAPEIS_QUE_GERENCIAM_ATIVOS.includes(a.papel) &&
      escopoCobreHotel(a, hotel),
  );
  return pode
    ? { permitido: true }
    : {
        permitido: false,
        erro: new PermissaoNegada('ativos_fora_do_escopo', 'Você não gere os ativos deste hotel.', {
          hotelId: hotel.id,
        }),
      };
}

/** Nome do ativo: sem espaços sobrando, de 1 a 120 caracteres. */
export function normalizarNomeDeAtivo(nome: string): string {
  const limpo = nome.trim().replace(/\s+/g, ' ');
  if (limpo.length === 0 || limpo.length > LIMITES_DE_ATIVO.nome) {
    throw new RegraViolada('ativo_nome_invalido', 'Nome de ativo inválido.', {
      maximo: LIMITES_DE_ATIVO.nome,
    });
  }
  return limpo;
}

export type CampoDeTextoDoAtivo = 'fabricante' | 'modelo' | 'numero_serie';

/** Fabricante, modelo e número de série: opcionais; vazio vira nulo; até 120 caracteres. */
export function normalizarTextoDoAtivo(
  campo: CampoDeTextoDoAtivo,
  valor: string | null,
): string | null {
  const limpo = valor?.trim().replace(/\s+/g, ' ') ?? '';
  if (limpo.length > LIMITES_DE_ATIVO.texto) {
    throw new RegraViolada('ativo_texto_invalido', 'Texto do ativo longo demais.', {
      campo,
      maximo: LIMITES_DE_ATIVO.texto,
    });
  }
  return limpo === '' ? null : limpo;
}

/** O ativo novo não entra em local inativo. */
export function exigirLocalParaAtivo(local: { status: StatusDeLocal }): void {
  if (local.status === 'inativo') {
    throw new RegraViolada('ativo_local_inativo', 'O local está desativado.');
  }
}

export interface CategoriaParaAtivo {
  id: string;
  ativa: boolean;
  definicoes: readonly DefinicaoDeCampo[];
}

/**
 * Campos estendidos de uma gravação: validados contra a categoria (ADR-028).
 * Sem categoria, nenhum campo estendido é aceito. Categoria desativada não
 * entra em ativo novo nem em troca de categoria; o ativo que já estava nela
 * continua podendo ser alterado.
 */
export function validarCamposDoAtivo(
  categoria: CategoriaParaAtivo | null,
  categoriaAnterior: string | null,
  valores: unknown,
): Record<string, ValorDeCampo> {
  if (categoria && !categoria.ativa && categoria.id !== categoriaAnterior) {
    throw new RegraViolada('ativo_categoria_inativa', 'A categoria está desativada.');
  }
  return validarValores(categoria?.definicoes ?? [], valores ?? {});
}

/** Recusa da alteração quando a linha mudou depois que o usuário a leu (ADR-029). */
export const conflitoDeVersao = (versaoAtual: number): Conflito =>
  new Conflito('conflito_de_versao', 'O registro foi alterado por outra pessoa.', { versaoAtual });

/**
 * Mover o ativo de local (B3c, adendo ao ADR-011): só quem gere o hotel, que
 * são os papéis que gerem locais. O técnico cadastra e altera, mas não move.
 */
export function podeMoverAtivo(
  minhas: readonly Atribuicao[],
  hotel: { id: string; bandeiraId: string | null },
  agora: Date,
): Resultado {
  const pode = minhas.some(
    (a) =>
      vigente(a, agora) &&
      PAPEIS_QUE_GERENCIAM_LOCAIS.includes(a.papel) &&
      escopoCobreHotel(a, hotel),
  );
  return pode
    ? { permitido: true }
    : {
        permitido: false,
        erro: new PermissaoNegada(
          'mover_ativo_fora_do_escopo',
          'Você não move os ativos deste hotel.',
          {
            hotelId: hotel.id,
          },
        ),
      };
}

/**
 * O destino de uma movimentação: outro local do mesmo hotel, ativo (ou UH
 * pendente de licença, como no cadastro). O ativo desativado não se move.
 * Entre hotéis, a recusa tem código próprio; a FK (hotel_id, local_id) do
 * banco recusa de novo, se esta checagem faltar.
 */
export function validarMovimentacao(
  ativo: { hotelId: string; localId: string; desativado: boolean },
  destino: { id: string; hotelId: string; status: StatusDeLocal },
): void {
  if (ativo.desativado) {
    throw new RegraViolada('ativo_desativado', 'O ativo está desativado.');
  }
  if (destino.hotelId !== ativo.hotelId) {
    throw new RegraViolada('mover_ativo_entre_hoteis', 'O ativo só muda de local dentro do hotel.');
  }
  if (destino.id === ativo.localId) {
    throw new RegraViolada('mover_ativo_mesmo_local', 'O ativo já está neste local.');
  }
  if (destino.status === 'inativo') {
    throw new RegraViolada('mover_ativo_local_inativo', 'O local de destino está desativado.');
  }
}
