// Fornecedores do grupo (fase 1b, I3): listar, cadastrar, alterar, desativar e
// reativar, com a versão vista (ADR-029). Ler é escopo: a RLS mostra os
// fornecedores a quem tem papel de escrita em algum hotel do grupo, e o
// proprietário recebe a lista vazia. Gravar é do Admin do grupo, do Gestor CSC
// e do Gerente do hotel (podeGerirFornecedores); a regra é injetável para o
// teste de aceite provar que a RLS ainda barra. A OS passa a usar o
// fornecedor na I4.
import {
  type Atribuicao,
  type Contexto,
  type Resultado,
  exigir,
  podeGerirFornecedores,
  validarDadosDeFornecedor,
} from '@hubkeep/dominio';
import type { FornecedorCadastrado, PortaFornecedores } from '../portas/fornecedores';
import type { PortaAtribuicoes, Relogio } from '../portas/papeis';

export interface PedidoDeFornecedor {
  nome: string;
  cnpj?: string | null | undefined;
  contatoNome?: string | null | undefined;
  contatoTelefone?: string | null | undefined;
  contatoEmail?: string | null | undefined;
}

export interface CasosDeUsoDeFornecedores {
  listar(ctx: Contexto): Promise<FornecedorCadastrado[]>;
  cadastrar(ctx: Contexto, p: PedidoDeFornecedor): Promise<{ id: string; versao: number }>;
  alterar(
    ctx: Contexto,
    id: string,
    p: PedidoDeFornecedor & { versao: number },
  ): Promise<{ versao: number }>;
  desativar(ctx: Contexto, id: string, versao: number): Promise<{ versao: number }>;
  reativar(ctx: Contexto, id: string, versao: number): Promise<{ versao: number }>;
}

export function criarCasosDeUsoDeFornecedores(deps: {
  fornecedores: PortaFornecedores;
  atribuicoes: PortaAtribuicoes;
  relogio: Relogio;
  /** Padrão: podeGerirFornecedores do domínio. Só o teste de aceite troca. */
  podeGerir?: (minhas: readonly Atribuicao[], agora: Date) => Resultado;
}): CasosDeUsoDeFornecedores {
  const podeGerir = deps.podeGerir ?? podeGerirFornecedores;
  const exigirGestao = async (ctx: Contexto) =>
    exigir(podeGerir(await deps.atribuicoes.doUsuario(ctx), deps.relogio.agora()));

  return {
    listar: (ctx) => deps.fornecedores.listar(ctx),

    async cadastrar(ctx, p) {
      await exigirGestao(ctx);
      return deps.fornecedores.criar(ctx, validarDadosDeFornecedor(p));
    },

    async alterar(ctx, id, p) {
      await exigirGestao(ctx);
      return deps.fornecedores.alterar(ctx, id, p.versao, validarDadosDeFornecedor(p));
    },

    async desativar(ctx, id, versao) {
      await exigirGestao(ctx);
      return deps.fornecedores.alterar(ctx, id, versao, { desativado: true });
    },

    async reativar(ctx, id, versao) {
      await exigirGestao(ctx);
      return deps.fornecedores.alterar(ctx, id, versao, { desativado: false });
    },
  };
}
