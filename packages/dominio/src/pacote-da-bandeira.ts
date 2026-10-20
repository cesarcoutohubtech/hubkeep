// Pacote da bandeira (fase 1b, PB1; desenho aprovado em 08/10/2026, decisão
// 20 de 12/10/2026; migração 0059). Sem tabela de pacote: o pacote é o que o
// grupo e a bandeira têm de modelos de ativo, modelos de checklist e planos
// por categoria (app.plano_padrao).
//
//   - o item sem bandeira vale para o grupo inteiro; o da bandeira, só para os
//     hotéis dela (vaiParaOHotel). O plano do pacote só usa checklist que vá
//     para os mesmos hotéis que ele;
//   - quem mantém o pacote: o Admin do grupo (a RLS garante o mesmo);
//   - aplicar o pacote ao hotel copia os planos do pacote que valem para ele,
//     pausados e sem responsável, com início no dia da aplicação; reaplicar só
//     acrescenta o que ainda não foi copiado (o banco tem a origem única por
//     hotel). Mudar o pacote não muda o hotel já implantado (ADR-026);
//   - quem aplica: o Admin do grupo e o Implantador vigente do hotel, pelo
//     painel de implantação.
// A bandeira do item não muda depois de criado (campo de escopo, ADR-011).
import { escopoCobreHotel } from './equipes';
import { PermissaoNegada, RegraViolada } from './erros';
import {
  type Periodicidade,
  normalizarNomeDoPlano,
  validarPeriodicidade,
} from './plano-preventivo';
import { type Resultado, ehAdminGrupo, vigente } from './permissoes';
import type { Atribuicao } from './tipos';

/** O item do pacote (modelo ou plano) vale para o hotel: é do grupo ou da bandeira dele. */
export function vaiParaOHotel(
  item: { bandeiraId: string | null },
  hotel: { bandeiraId: string | null },
): boolean {
  return item.bandeiraId === null || item.bandeiraId === hotel.bandeiraId;
}

/** Quem mantém o pacote (planos do pacote e a bandeira dos modelos): só o Admin do grupo. */
export function podeGerirPacote(minhas: readonly Atribuicao[], agora: Date): Resultado {
  return ehAdminGrupo(minhas, agora)
    ? { permitido: true }
    : {
        permitido: false,
        erro: new PermissaoNegada('pacote_so_do_admin', 'Só o Admin do grupo mantém o pacote.'),
      };
}

/** Quem aplica o pacote ao hotel: o Admin do grupo e o Implantador vigente do hotel. */
export function podeAplicarPacote(
  minhas: readonly Atribuicao[],
  hotel: { id: string; bandeiraId: string | null },
  agora: Date,
): Resultado {
  const pode =
    ehAdminGrupo(minhas, agora) ||
    minhas.some(
      (a) => vigente(a, agora) && a.papel === 'implantador' && escopoCobreHotel(a, hotel),
    );
  return pode
    ? { permitido: true }
    : {
        permitido: false,
        erro: new PermissaoNegada(
          'pacote_fora_do_escopo',
          'Você não aplica o pacote neste hotel.',
          { hotelId: hotel.id },
        ),
      };
}

export interface PlanoPadrao {
  id: string;
  bandeiraId: string | null;
  categoriaId: string;
  nome: string;
  intervalo: number;
  unidade: Periodicidade['unidade'];
  checklistModeloId: string | null;
  ativa: boolean;
}

/** O checklist escolhido para o plano do pacote, como a aplicação o lê. */
export interface ChecklistParaPlanoPadrao {
  ativa: boolean;
  categoriaId: string | null;
  bandeiraId: string | null;
}

/**
 * Os dados do plano do pacote: nome e periodicidade como no plano do hotel; o
 * checklist, quando há, ativo, da categoria do plano (ou de nenhuma) e que vá
 * para os mesmos hotéis (do grupo, ou da mesma bandeira do plano).
 */
export function validarPlanoPadrao(
  p: {
    nome: unknown;
    intervalo: unknown;
    unidade: unknown;
    bandeiraId: string | null;
    categoriaId: string;
  },
  checklist: ChecklistParaPlanoPadrao | null,
): { nome: string } & Periodicidade {
  const nome = normalizarNomeDoPlano(p.nome);
  const periodicidade = validarPeriodicidade(p);
  if (
    checklist !== null &&
    (!checklist.ativa ||
      (checklist.categoriaId !== null && checklist.categoriaId !== p.categoriaId) ||
      (checklist.bandeiraId !== null && checklist.bandeiraId !== p.bandeiraId))
  ) {
    throw new RegraViolada('plano_checklist_invalido', 'Checklist indisponível para o plano.');
  }
  return { nome, ...periodicidade };
}

/** A cópia do plano do pacote no hotel: pausada, sem responsável, com a origem. */
export interface CopiaDoPlanoPadrao {
  planoPadraoId: string;
  categoriaId: string;
  nome: string;
  intervalo: number;
  unidade: Periodicidade['unidade'];
  checklistModeloId: string | null;
  inicio: string;
  situacao: 'pausado';
  tecnicoId: null;
  equipeId: null;
}

/**
 * O que aplicar o pacote copia para o hotel: os planos ativos do pacote que
 * valem para ele e ainda não foram copiados, em ordem de nome.
 */
export function copiasDoPacote(
  padroes: readonly PlanoPadrao[],
  hotel: { bandeiraId: string | null },
  jaCopiados: ReadonlySet<string>,
  hoje: string,
): CopiaDoPlanoPadrao[] {
  return padroes
    .filter((p) => p.ativa && vaiParaOHotel(p, hotel) && !jaCopiados.has(p.id))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR') || a.id.localeCompare(b.id))
    .map((p) => ({
      planoPadraoId: p.id,
      categoriaId: p.categoriaId,
      nome: p.nome,
      intervalo: p.intervalo,
      unidade: p.unidade,
      checklistModeloId: p.checklistModeloId,
      inicio: hoje,
      situacao: 'pausado',
      tecnicoId: null,
      equipeId: null,
    }));
}
