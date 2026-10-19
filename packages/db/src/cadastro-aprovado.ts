// A situação efetiva do cadastro do ativo (M4; migração 0058) nas consultas
// que precisam dela no SQL: aprovado é o que nasceu aprovado ou recebeu a
// decisão de aprovar. O ativo recusado também é desativado, então o filtro de
// desativado já o tira. Pede o ativo com o apelido `a`.
import { sql } from 'kysely';

const aprovado = sql<boolean>`(a.situacao_cadastro = 'aprovado' or exists (
  select 1 from app.ativo_decisao_cadastro d
  where d.hotel_id = a.hotel_id and d.ativo_id = a.id and d.decisao = 'aprovado'))`;

/** Filtro: só o ativo com o cadastro aprovado. */
export const cadastroAprovado = aprovado;

/** Coluna: o ativo ainda espera a aprovação do cadastro (sem decisão de aprovar). */
export const cadastroPendente = sql<boolean>`not ${aprovado}`.as('cadastro_pendente');
