// O instante do relógio do roteiro nas datas gravadas (pedido do Intelligence,
// atividade 3; aprovado pelo Cesar em 13/10/2026). Só a montagem com o relógio
// do roteiro (apps/web/test/demonstracao) liga a opção; no web em
// funcionamento a unidade não tem instante e o SQL é o de sempre, com o now()
// do banco ou o default da coluna.
//
// A lista é fechada: o criado_em e o atualizado_em do chamado, da OS, do ativo,
// da parada e da UH indisponível, o desativado_em do ativo e a hora da
// transição sem a hora do aparelho. A auditoria e o outbox ficam sempre com o
// banco: dizem quando o dado entrou de fato.
import { type RawBuilder, sql } from 'kysely';
import { type UnidadeDeTrabalho, instanteDoRoteiro } from '../unidade-de-trabalho';

/** O instante do roteiro, ou o now() da transação. */
export function agoraNaGravacao(uow: UnidadeDeTrabalho): Date | RawBuilder<Date> {
  return instanteDoRoteiro(uow) ?? sql<Date>`now()`;
}

/** Na criação: o criado_em e o atualizado_em do roteiro; sem ele, nada (o default da coluna). */
export function datasDaCriacao(uow: UnidadeDeTrabalho): { criado_em?: Date; atualizado_em?: Date } {
  const instante = instanteDoRoteiro(uow);
  return instante ? { criado_em: instante, atualizado_em: instante } : {};
}
