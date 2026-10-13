// Configuração do tenant e do hotel e políticas (fase 1a, A7; ADR-026).
//
// Repete o formato de cada política de @hubkeep/dominio (politicas.ts) porque
// contratos não depende de outros pacotes; tests/contratos-dominio falha se as
// chaves divergirem ou se um valor aceito por um for recusado pelo outro. País,
// subdivisão e moeda são conferidos no caso de uso, com código por campo.
//
// Chave de módulo (extensão do registro de políticas, adendo ao ADR-026) entra
// como texto com prefixo fora dos do núcleo; a chave e o formato do valor são
// conferidos pelo registro, no caso de uso (politica_desconhecida,
// politica_valor_invalido).
import { z } from 'zod';
import { MODELOS_CONTRATUAIS_API } from './api';
import { IDIOMAS_API } from './preferencias';

const AceiteAutomatico = z.strictObject({ ligado: z.boolean(), dias: z.int().min(1).max(60) });
/** Códigos obrigatórios no aceite (I6); desligado por padrão. */
const CodigosObrigatorios = z.strictObject({ ligado: z.boolean() });
/** Foto "depois" obrigatória na conclusão (I8); desligado por padrão. */
const FotoDepoisObrigatoria = z.strictObject({ ligado: z.boolean() });
/** Assinatura no aceite (I8); desligado por padrão. */
const AssinaturaNoAceite = z.strictObject({ ligado: z.boolean() });
/** Checklist completo obrigatório na conclusão (PV1); desligado por padrão. */
const ChecklistCompletoObrigatorio = z.strictObject({ ligado: z.boolean() });
const PrioridadePadraoPorCategoria = z.record(z.guid(), z.guid());

/** Nome de cada nível da criticidade (1 a 5) por idioma, parcial (I1). */
export const NomesDeCriticidadeApi = z
  .partialRecord(
    z.enum(['1', '2', '3', '4', '5']),
    z.partialRecord(z.enum(IDIOMAS_API), z.string().trim().min(1).max(120)),
  )
  .meta({ id: 'NomesDeCriticidadeApi' });

export const FORMATOS_DE_POLITICA_API = {
  'os.aceite_automatico': AceiteAutomatico,
  'os.codigos_obrigatorios': CodigosObrigatorios,
  'os.foto_depois_obrigatoria': FotoDepoisObrigatoria,
  'os.assinatura_no_aceite': AssinaturaNoAceite,
  'os.checklist_completo_obrigatorio': ChecklistCompletoObrigatorio,
  'chamado.prioridade_padrao_por_categoria': PrioridadePadraoPorCategoria,
  'ativo.criticidade': NomesDeCriticidadeApi,
} as const;

export const CHAVES_DE_POLITICA_API = Object.keys(
  FORMATOS_DE_POLITICA_API,
) as (keyof typeof FORMATOS_DE_POLITICA_API)[];

/** Os prefixos das chaves do núcleo, iguais aos do domínio (tests/contratos-dominio). */
export const PREFIXOS_DO_NUCLEO_API = ['os.', 'chamado.', 'ativo.'] as const;

const ChaveDeExtensao = z
  .string()
  .max(64)
  .regex(/^[a-z][a-z_]*\.[a-z][a-z_]*$/)
  .refine((c) => !PREFIXOS_DO_NUCLEO_API.some((p) => c.startsWith(p)));

const EscopoDePolitica = z.discriminatedUnion('tipo', [
  z.object({ tipo: z.literal('grupo') }),
  z.object({ tipo: z.literal('hotel'), hotelId: z.guid() }),
]);

/** Valor null: o escopo volta a herdar (grupo → padrão; hotel → grupo). */
const PedidoDePoliticaDoNucleo = z.discriminatedUnion('chave', [
  z.object({
    chave: z.literal('os.aceite_automatico'),
    escopo: EscopoDePolitica,
    valor: AceiteAutomatico.nullable(),
  }),
  z.object({
    chave: z.literal('os.codigos_obrigatorios'),
    escopo: EscopoDePolitica,
    valor: CodigosObrigatorios.nullable(),
  }),
  z.object({
    chave: z.literal('os.foto_depois_obrigatoria'),
    escopo: EscopoDePolitica,
    valor: FotoDepoisObrigatoria.nullable(),
  }),
  z.object({
    chave: z.literal('os.assinatura_no_aceite'),
    escopo: EscopoDePolitica,
    valor: AssinaturaNoAceite.nullable(),
  }),
  z.object({
    chave: z.literal('os.checklist_completo_obrigatorio'),
    escopo: EscopoDePolitica,
    valor: ChecklistCompletoObrigatorio.nullable(),
  }),
  z.object({
    chave: z.literal('chamado.prioridade_padrao_por_categoria'),
    escopo: EscopoDePolitica,
    valor: PrioridadePadraoPorCategoria.nullable(),
  }),
  z.object({
    chave: z.literal('ativo.criticidade'),
    escopo: EscopoDePolitica,
    valor: NomesDeCriticidadeApi.nullable(),
  }),
]);

export const PedidoDePolitica = z
  .union([
    PedidoDePoliticaDoNucleo,
    z.object({
      chave: ChaveDeExtensao,
      escopo: EscopoDePolitica,
      valor: z.unknown().refine((v) => v !== undefined),
    }),
  ])
  .meta({ id: 'PedidoDePolitica' });

const Origem = z.enum(['hotel', 'grupo', 'padrao']);
const resolvida = <C extends string, V extends z.ZodType>(chave: C, valor: V) =>
  z.object({
    chave: z.literal(chave),
    padrao: valor,
    grupo: valor.nullable(),
    hotel: valor.nullable(),
    efetiva: valor,
    origem: Origem,
  });

const Regiao = {
  /** ISO 3166-1 alfa-2. */
  pais: z.string().max(8),
  /** ISO 3166-2, do mesmo país. */
  subdivisao: z.string().max(8).nullable(),
  /** ISO 4217. */
  moeda: z.string().max(8),
  idiomaPadrao: z.enum(IDIOMAS_API),
};

export const PedidoDeConfiguracaoDoTenant = z
  .object(Regiao)
  .meta({ id: 'PedidoDeConfiguracaoDoTenant' });

const CamposDoHotel = {
  /** Fuso IANA (ex.: America/Sao_Paulo). */
  fuso: z.string().max(64),
  pais: Regiao.pais.nullable(),
  subdivisao: Regiao.subdivisao,
  moeda: Regiao.moeda.nullable(),
  idiomaPadrao: Regiao.idiomaPadrao.nullable(),
};

/** Modelo contratual do hotel (I2): nulo é "não informado". */
const ModeloContratualApi = z.enum(MODELOS_CONTRATUAIS_API).nullable();

/**
 * Nulo em país, subdivisão, moeda e idioma: herda do tenant. O modelo
 * contratual (I2) é opcional no pedido: ausente, mantém o gravado; null, volta
 * a "não informado".
 */
export const PedidoDeConfiguracaoDoHotel = z
  .object({ ...CamposDoHotel, modeloContratual: ModeloContratualApi.optional() })
  .meta({ id: 'PedidoDeConfiguracaoDoHotel' });

export const RespostaDeConfiguracao = z
  .object({
    tenant: z.object({ nome: z.string(), ...Regiao }),
    hotel: z
      .object({
        id: z.guid(),
        nome: z.string(),
        ...CamposDoHotel,
        modeloContratual: ModeloContratualApi,
      })
      .nullable(),
    politicas: z.array(
      z.discriminatedUnion('chave', [
        resolvida('os.aceite_automatico', AceiteAutomatico),
        resolvida('os.codigos_obrigatorios', CodigosObrigatorios),
        resolvida('os.foto_depois_obrigatoria', FotoDepoisObrigatoria),
        resolvida('os.assinatura_no_aceite', AssinaturaNoAceite),
        resolvida('os.checklist_completo_obrigatorio', ChecklistCompletoObrigatorio),
        resolvida('chamado.prioridade_padrao_por_categoria', PrioridadePadraoPorCategoria),
        resolvida('ativo.criticidade', NomesDeCriticidadeApi),
      ]),
    ),
  })
  .meta({ id: 'RespostaDeConfiguracao' });
