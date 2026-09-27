// Equipes do hotel (fase 1a, A6).
import { z } from 'zod';

export const EquipeApi = z
  .object({
    id: z.guid(),
    nome: z.string(),
    ativa: z.boolean(),
    membros: z.array(z.object({ usuarioId: z.guid(), nome: z.string(), ativo: z.boolean() })),
  })
  .meta({ id: 'EquipeApi' });

export const RespostaDeEquipes = z
  .object({
    equipes: z.array(EquipeApi),
    /** Membros ativos do tenant, para escolher quem entra numa equipe. */
    disponiveis: z.array(z.object({ usuarioId: z.guid(), nome: z.string() })),
  })
  .meta({ id: 'RespostaDeEquipes' });

export const PedidoDeEquipe = z
  .object({ nome: z.string().max(200) })
  .meta({ id: 'PedidoDeEquipe' });

export const RespostaDeEquipeAlterada = z
  .object({ id: z.guid() })
  .meta({ id: 'RespostaDeEquipeAlterada' });

export const PedidoDeMembroDaEquipe = z
  .object({ usuarioId: z.guid() })
  .meta({ id: 'PedidoDeMembroDaEquipe' });

export const RespostaDeMembroDaEquipe = z
  .object({ equipeId: z.guid(), usuarioId: z.guid(), ativo: z.boolean() })
  .meta({ id: 'RespostaDeMembroDaEquipe' });
