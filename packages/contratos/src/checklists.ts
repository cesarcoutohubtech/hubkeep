// Checklist tipado (fase 1b, PV1; ADR-040). Os itens são as definições de
// campo tipado da categoria (ADR-028, DefinicaoDeCampoApi); o formato fino
// (chave, rótulos, opções, até 50 itens) é validado no domínio, que devolve
// definicao_de_campo_invalida com o item e o motivo. As respostas da OS
// chegam pela operação offline os.responder_checklist (sincronizacao.ts).
import { z } from 'zod';
import { DefinicaoDeCampoApi } from './categorias';
import { IDIOMAS_API } from './preferencias';

const Rotulos = z.partialRecord(z.enum(IDIOMAS_API), z.string().max(200));
const ValorDeResposta = z.union([z.string(), z.number(), z.boolean()]);

export const ModeloDeChecklistApi = z
  .object({
    id: z.guid(),
    /** A categoria que o modelo sugere; nulo vale para todas. */
    categoriaId: z.guid().nullable(),
    nomes: Rotulos,
    itens: z.array(DefinicaoDeCampoApi),
    /** Sobe a cada gravação que muda os itens; a OS guarda a versão aplicada. */
    versao: z.int(),
    ativa: z.boolean(),
  })
  .meta({ id: 'ModeloDeChecklistApi' });

export const RespostaDeModelosDeChecklist = z
  .object({ idiomaPadrao: z.enum(IDIOMAS_API), modelos: z.array(ModeloDeChecklistApi) })
  .meta({ id: 'RespostaDeModelosDeChecklist' });

/** Na entrada, unidade, opções e obrigatório podem faltar; o domínio completa. */
export const PedidoDeModeloDeChecklist = z
  .object({
    nomes: Rotulos,
    categoriaId: z.guid().nullable(),
    itens: z
      .array(
        DefinicaoDeCampoApi.extend({
          obrigatorio: z.boolean().optional(),
          unidade: z.string().max(32).nullish(),
          opcoes: DefinicaoDeCampoApi.shape.opcoes.optional(),
        }),
      )
      .max(100),
  })
  .meta({ id: 'PedidoDeModeloDeChecklist' });

export const RespostaDeModeloDeChecklistAlterado = z
  .object({ id: z.guid(), versao: z.int().optional() })
  .meta({ id: 'RespostaDeModeloDeChecklistAlterado' });

/** Aplicar o modelo na OS, ou trocar o que ainda não tem resposta. */
export const PedidoDeChecklistNaOs = z
  .object({ modeloId: z.guid() })
  .meta({ id: 'PedidoDeChecklistNaOs' });

export const RespostaDeChecklistAplicado = z
  .object({ id: z.guid() })
  .meta({ id: 'RespostaDeChecklistAplicado' });

/** Uma resposta gravada: o valor, a hora no aparelho e quem respondeu. */
export const RespostaDoChecklistApi = z
  .object({ valor: ValorDeResposta, feitaEm: z.string(), usuarioId: z.string() })
  .meta({ id: 'RespostaDoChecklistApi' });

/** A cópia na OS (ADR-026), com as respostas que valem para os itens dela. */
export const ChecklistDaOsApi = z
  .object({
    id: z.guid(),
    modeloId: z.guid(),
    modeloVersao: z.int(),
    nomes: Rotulos,
    itens: z.array(DefinicaoDeCampoApi),
    respostas: z.record(z.string(), RespostaDoChecklistApi),
  })
  .meta({ id: 'ChecklistDaOsApi' });

export const RespostaDeChecklistDaOs = z
  .object({ checklist: ChecklistDaOsApi.nullable() })
  .meta({ id: 'RespostaDeChecklistDaOs' });
