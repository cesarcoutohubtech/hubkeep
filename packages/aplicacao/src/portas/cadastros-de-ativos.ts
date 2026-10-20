// Porta da aprovação do cadastro dos ativos (fase 1b, M4; migração 0058).
// Implementada por packages/db, com o contexto do usuário: a RLS mostra os
// ativos e as decisões dos hotéis que ele lê, e só deixa gravar a decisão à
// gestão do hotel (Admin, Gestor CSC e Gerente), em nome de quem decide.
import type { Contexto, DecisaoDoCadastro, SituacaoDoCadastro } from '@hubkeep/dominio';

export interface CadastroPendente {
  id: string;
  hotelId: string;
  localId: string;
  /** O nome do local, para a fila (as UHs e áreas do hotel). */
  localNome: string;
  categoriaId: string | null;
  nome: string;
  fabricante: string | null;
  modelo: string | null;
  numeroSerie: string | null;
  versao: number;
  criadoEm: Date;
}

export interface CadastroDoAtivo {
  id: string;
  hotelId: string;
  versao: number;
  situacao: SituacaoDoCadastro;
  /** false: desativado. */
  ativo: boolean;
}

export interface PortaCadastrosDeAtivos {
  /** Hotel visível ao usuário, com a bandeira (para a regra de escopo); senão null. */
  hotel(ctx: Contexto, hotelId: string): Promise<{ id: string; bandeiraId: string | null } | null>;
  /** Os ativos ativos do hotel que nasceram pendentes e ainda não têm decisão, do mais antigo. */
  pendentes(ctx: Contexto, hotelId: string): Promise<CadastroPendente[]>;
  ativo(ctx: Contexto, ativoId: string): Promise<CadastroDoAtivo | null>;
  /**
   * Na unit of work, pela versão do ativo (ADR-029): grava a decisão e, na
   * recusa, desativa o ativo, com auditoria e evento. Outra versão: Conflito
   * conflito_de_versao; sem linha gravável: NaoEncontrado ativo_nao_encontrado.
   */
  decidir(
    ctx: Contexto,
    d: {
      ativoId: string;
      hotelId: string;
      versaoEsperada: number;
      decisao: DecisaoDoCadastro;
      motivo: string | null;
    },
  ): Promise<{ versao: number }>;
}
