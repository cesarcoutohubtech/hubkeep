// Porta dos fornecedores do grupo (fase 1b, I3). Implementada por packages/db,
// com o contexto do usuário: a RLS mostra os fornecedores a quem tem papel de
// escrita em algum hotel do grupo (o proprietário não lê) e só deixa gravar o
// Admin do grupo, o Gestor CSC e o Gerente do hotel.
import type { Contexto, DadosDeFornecedor } from '@hubkeep/dominio';

export interface FornecedorCadastrado extends DadosDeFornecedor {
  id: string;
  ativo: boolean;
  versao: number;
}

/** Alterar o cadastro inteiro, ou só desativar e reativar. */
export type MudancaDeFornecedor = DadosDeFornecedor | { desativado: boolean };

export interface PortaFornecedores {
  /** Ordenados pelo nome. */
  listar(ctx: Contexto): Promise<FornecedorCadastrado[]>;
  /**
   * Na unit of work, com auditoria e evento. CNPJ repetido no grupo: Conflito
   * fornecedor_cnpj_repetido.
   */
  criar(ctx: Contexto, dados: DadosDeFornecedor): Promise<{ id: string; versao: number }>;
  /**
   * Grava só se a versão ainda for a esperada (ADR-029) e incrementa. Versão
   * diferente: Conflito conflito_de_versao; nada visível para alterar (RLS):
   * NaoEncontrado fornecedor_nao_encontrado; CNPJ repetido: Conflito
   * fornecedor_cnpj_repetido.
   */
  alterar(
    ctx: Contexto,
    id: string,
    versaoEsperada: number,
    mudanca: MudancaDeFornecedor,
  ): Promise<{ versao: number }>;
}
