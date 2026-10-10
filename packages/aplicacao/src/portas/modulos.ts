// Porta dos módulos contratados (I7, licenca.modulo). Implementada por
// packages/db, com o contexto de quem pede: a RLS só deixa ler quem tem papel
// vigente no tenant, e para os outros a lista vem vazia (falha fechada). Só
// leitura: quem grava é o backoffice, por script de operação.
import type { Contexto, ModuloContratado } from '@hubkeep/dominio';

export interface PortaModulos {
  /** Os módulos do tenant do contexto, com a vigência, vigentes ou não. */
  contratados(ctx: Contexto): Promise<ModuloContratado[]>;
}
