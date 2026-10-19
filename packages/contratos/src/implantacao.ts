// Painel de implantação do hotel (fase 1a, A5). Repete a lista de pendências
// do domínio; tests/contratos-dominio falha se as duas divergirem.
import { z } from 'zod';
import { MODELOS_CONTRATUAIS_API, PAPEIS_API } from './api';

export const PENDENCIAS_DE_IMPLANTACAO_API = [
  'modelo_contratual_nao_informado',
  'sem_locais',
  'uhs_pendentes_de_licenca',
  'locais_sem_ativo',
  'ativos_sem_categoria',
  'sem_gerente',
  'sem_tecnico',
  'pessoas_sem_papel_vigente',
] as const;

export const RespostaDeImplantacao = z
  .object({
    hotel: z.object({
      id: z.guid(),
      nome: z.string(),
      status: z.string(),
      /** I2: nulo é "não informado" (pendência modelo_contratual_nao_informado). */
      modeloContratual: z.enum(MODELOS_CONTRATUAIS_API).nullable(),
    }),
    locais: z.object({
      uhsAtivas: z.int(),
      uhsPendentes: z.int(),
      areasComuns: z.int(),
      inativos: z.int(),
    }),
    ativos: z.object({
      ativos: z.int(),
      semCategoria: z.int(),
      locaisSemAtivo: z.int(),
      /** Com modelo, sem plano que os cubra e sem descarte (M1). */
      comModeloSemPlano: z.int(),
    }),
    papeis: z.array(z.object({ papel: z.enum(PAPEIS_API), pessoas: z.int() })),
    pessoasSemPapelVigente: z.array(z.object({ usuarioId: z.guid(), nome: z.string() })),
    pendencias: z.array(z.enum(PENDENCIAS_DE_IMPLANTACAO_API)),
  })
  .meta({ id: 'RespostaDeImplantacao' });
