// Fornecedores do grupo (fase 1b, I3): lista, cadastro, alteração com a versão
// vista (ADR-029), desativação e reativação. O CNPJ chega com ou sem
// pontuação; a normalização, os dígitos verificadores e o contato são
// conferidos no domínio, com código de erro. Volta só com os 14 dígitos.
import { z } from 'zod';

export const FornecedorApi = z
  .object({
    id: z.guid(),
    nome: z.string(),
    /** Só os 14 dígitos; null quando não informado. */
    cnpj: z
      .string()
      .regex(/^\d{14}$/)
      .nullable(),
    contatoNome: z.string().nullable(),
    contatoTelefone: z.string().nullable(),
    contatoEmail: z.string().nullable(),
    ativo: z.boolean(),
    versao: z.number().int().min(1),
  })
  .meta({ id: 'FornecedorApi' });

export const RespostaDeFornecedores = z
  .object({ fornecedores: z.array(FornecedorApi) })
  .meta({ id: 'RespostaDeFornecedores' });

const gravacao = {
  nome: z.string().max(200),
  cnpj: z.string().max(40).nullable().optional(),
  contatoNome: z.string().max(200).nullable().optional(),
  contatoTelefone: z.string().max(60).nullable().optional(),
  contatoEmail: z.string().max(400).nullable().optional(),
};

export const PedidoDeFornecedor = z.object(gravacao).meta({ id: 'PedidoDeFornecedor' });

export const PedidoDeAlteracaoDeFornecedor = z
  .object({ versao: z.number().int().min(1), ...gravacao })
  .meta({ id: 'PedidoDeAlteracaoDeFornecedor' });

/** Desativação e reativação levam só a versão vista (ADR-029). */
export const PedidoDeVersaoDeFornecedor = z
  .object({ versao: z.number().int().min(1) })
  .meta({ id: 'PedidoDeVersaoDeFornecedor' });

export const RespostaDeFornecedorGravado = z
  .object({ id: z.guid(), versao: z.number().int().min(1) })
  .meta({ id: 'RespostaDeFornecedorGravado' });
