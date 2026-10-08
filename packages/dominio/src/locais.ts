// Locais do hotel (fase 1a, B1): UHs e áreas comuns.
//
//   UH       vem do sistema hoteleiro (TOTVS CM) pelo conector; nome, andar e
//            código são do sistema de origem e só leitura aqui (a próxima carga
//            sobrescreveria). O status (ativo ou pendente de licença) é da
//            licença (A1 e promoção do worker), não se edita à mão. A
//            edificação (I2) é a exceção: o CM não a tem, então ela se edita
//            aqui, e o conector não a sobrescreve.
//   área     comum (piscina, cozinha, casa de máquinas) é cadastrada à mão, não
//            conta licença (contaComoUh) e se desativa logicamente.
// Quem gere áreas comuns: os mesmos papéis que gerem equipes, no escopo do
// hotel (o Implantador inclusive, A5). A RLS de app.local deixa gravar quem tem
// escrita no hotel; a restrição por papel é regra de ação, daqui (regra 2).
import { PAPEIS_QUE_GERENCIAM_EQUIPES, escopoCobreHotel } from './equipes';
import { PermissaoNegada, RegraViolada } from './erros';
import { type Resultado, vigente } from './permissoes';
import type { TipoDeLocal } from './licenca';
import type { Atribuicao, Papel } from './tipos';

export const PAPEIS_QUE_GERENCIAM_LOCAIS: readonly Papel[] = PAPEIS_QUE_GERENCIAM_EQUIPES;

export type OrigemDoLocal = 'sistema_hoteleiro' | 'manual';

export interface LocalParaRegra {
  tipo: TipoDeLocal;
  codExterno: string | null;
}

/** De onde o local vem: com código externo, do sistema hoteleiro. */
export const origemDoLocal = (l: LocalParaRegra): OrigemDoLocal =>
  l.codExterno !== null ? 'sistema_hoteleiro' : 'manual';

/** Só a área comum cadastrada à mão se edita; o que vem do CM é só leitura. */
export const localEditavel = (l: LocalParaRegra): boolean =>
  l.tipo === 'area_comum' && origemDoLocal(l) === 'manual';

export function exigirLocalEditavel(l: LocalParaRegra): void {
  if (!localEditavel(l)) {
    throw new RegraViolada('local_so_leitura', 'UH e local do sistema hoteleiro são só leitura.', {
      tipo: l.tipo,
      origem: origemDoLocal(l),
    });
  }
}

export function podeGerirLocais(
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
        erro: new PermissaoNegada('locais_fora_do_escopo', 'Você não gere os locais deste hotel.', {
          hotelId: hotel.id,
        }),
      };
}

/** Nome de local: sem espaços nas pontas, de 1 a 120 caracteres. */
export function normalizarNomeDeLocal(nome: string): string {
  const limpo = nome.trim().replace(/\s+/g, ' ');
  if (limpo.length === 0 || limpo.length > 120) {
    throw new RegraViolada('local_nome_invalido', 'Nome de local inválido.', { maximo: 120 });
  }
  return limpo;
}

/** Andar é opcional; vazio vira nulo; até 20 caracteres. */
export function normalizarAndar(andar: string | null): string | null {
  const limpo = andar?.trim() ?? '';
  if (limpo.length > 20) {
    throw new RegraViolada('local_andar_invalido', 'Andar inválido.', { maximo: 20 });
  }
  return limpo === '' ? null : limpo;
}

/**
 * Edificação (I2): torre, bloco. Opcional, para UH e área comum; vazio vira
 * nulo; espaços repetidos viram um; até 60 caracteres.
 */
export const LIMITE_EDIFICACAO = 60;

export function normalizarEdificacao(edificacao: string | null): string | null {
  const limpo = edificacao?.trim().replace(/\s+/g, ' ') ?? '';
  if (limpo.length > LIMITE_EDIFICACAO) {
    throw new RegraViolada('local_edificacao_invalida', 'Edificação inválida.', {
      maximo: LIMITE_EDIFICACAO,
    });
  }
  return limpo === '' ? null : limpo;
}

/**
 * As edificações que já existem no hotel, para a tela sugerir e evitar
 * "Torre A" e "torre a": uma por grafia sem diferença de caixa (a primeira na
 * ordem alfabética), em ordem alfabética.
 */
export function edificacoesDoHotel(locais: readonly { edificacao: string | null }[]): string[] {
  const unicas: string[] = [];
  const todas = locais
    .map((l) => l.edificacao)
    .filter((e): e is string => e !== null)
    .sort((a, b) => a.localeCompare(b));
  for (const e of todas) {
    if (!unicas.some((u) => mesmoNomeDeLocal(u, e))) unicas.push(e);
  }
  return unicas;
}

/** Duas áreas comuns ativas não têm o mesmo nome no hotel (sem diferença de caixa). */
export const mesmoNomeDeLocal = (a: string, b: string): boolean =>
  a.localeCompare(b, undefined, { sensitivity: 'accent' }) === 0;
