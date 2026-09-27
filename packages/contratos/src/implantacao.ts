// Painel de implantação do hotel (fase 1a, A5). Repete a lista de pendências
// do domínio; tests/contratos-dominio falha se as duas divergirem.
import { z } from 'zod';
import { PAPEIS_API } from './api';

export const PENDENCIAS_DE_IMPLANTACAO_API = [
  'sem_locais',
  'uhs_pendentes_de_licenca',
  'sem_gerente',
  'sem_tecnico',
  'pessoas_sem_papel_vigente',
] as const;

export const RespostaDeImplantacao = z
  .object({
    hotel: z.object({ id: z.guid(), nome: z.string(), status: z.string() }),
    locais: z.object({
      uhsAtivas: z.int(),
      uhsPendentes: z.int(),
      areasComuns: z.int(),
      inativos: z.int(),
    }),
    papeis: z.array(z.object({ papel: z.enum(PAPEIS_API), pessoas: z.int() })),
    pessoasSemPapelVigente: z.array(z.object({ usuarioId: z.guid(), nome: z.string() })),
    pendencias: z.array(z.enum(PENDENCIAS_DE_IMPLANTACAO_API)),
  })
  .meta({ id: 'RespostaDeImplantacao' });
