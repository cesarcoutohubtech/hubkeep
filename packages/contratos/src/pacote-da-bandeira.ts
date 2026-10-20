// Pacote da bandeira (fase 1b, PB1; migração 0059): os planos por categoria
// do pacote, da bandeira ou do grupo (bandeiraId nulo), e a aplicação do
// pacote ao hotel, que copia os planos pausados e sem responsável. A
// validação é do domínio.
import { z } from 'zod';
import { UNIDADES_DE_PERIODICIDADE_API } from './planos-preventivos';

export const PlanoPadraoApi = z
  .object({
    id: z.guid(),
    /** Nulo: o grupo inteiro. Não muda depois de criado. */
    bandeiraId: z.guid().nullable(),
    categoriaId: z.guid(),
    nome: z.string(),
    intervalo: z.int(),
    unidade: z.enum(UNIDADES_DE_PERIODICIDADE_API),
    checklistModeloId: z.guid().nullable(),
    ativa: z.boolean(),
    versao: z.int(),
  })
  .meta({ id: 'PlanoPadraoApi' });

export const RespostaDePlanosPadrao = z
  .object({ planos: z.array(PlanoPadraoApi) })
  .meta({ id: 'RespostaDePlanosPadrao' });

const dadosDoPlanoPadrao = {
  categoriaId: z.guid(),
  nome: z.string().max(200),
  intervalo: z.int(),
  unidade: z.string().max(16),
  checklistModeloId: z.guid().nullable(),
};

export const PedidoDePlanoPadrao = z
  .object({ bandeiraId: z.guid().nullable(), ...dadosDoPlanoPadrao })
  .meta({ id: 'PedidoDePlanoPadrao' });

export const PedidoDeAlteracaoDePlanoPadrao = z
  .object({ ...dadosDoPlanoPadrao, versao: z.int() })
  .meta({ id: 'PedidoDeAlteracaoDePlanoPadrao' });

export const PedidoDeVersaoDePlanoPadrao = z
  .object({ versao: z.int() })
  .meta({ id: 'PedidoDeVersaoDePlanoPadrao' });

export const RespostaDePlanoPadraoGravado = z
  .object({ id: z.guid(), versao: z.int() })
  .meta({ id: 'RespostaDePlanoPadraoGravado' });

/** O plano que aplicar o pacote copia (ou copiou) para o hotel. */
export const CopiaDoPacoteApi = z
  .object({
    planoPadraoId: z.guid(),
    categoriaId: z.guid(),
    nome: z.string(),
    intervalo: z.int(),
    unidade: z.enum(UNIDADES_DE_PERIODICIDADE_API),
    checklistModeloId: z.guid().nullable(),
    /** aaaa-mm-dd, o dia da aplicação no fuso do hotel. */
    inicio: z.string(),
  })
  .meta({ id: 'CopiaDoPacoteApi' });

export const RespostaDaPreviaDoPacote = z
  .object({ copias: z.array(CopiaDoPacoteApi) })
  .meta({ id: 'RespostaDaPreviaDoPacote' });

export const RespostaDaAplicacaoDoPacote = z
  .object({
    copiados: z.array(CopiaDoPacoteApi.extend({ planoId: z.guid() })),
    /** Os que outro envio copiou nesse meio-tempo. */
    jaCopiados: z.int(),
  })
  .meta({ id: 'RespostaDaAplicacaoDoPacote' });
