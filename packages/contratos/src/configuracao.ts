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
const AprovacaoDoCadastro = z.strictObject({ ligado: z.boolean() });
const PrioridadePadraoPorCategoria = z.record(z.guid(), z.guid());

/** Nome de cada nível da criticidade (1 a 5) por idioma, parcial (I1). */
export const NomesDeCriticidadeApi = z
  .partialRecord(
    z.enum(['1', '2', '3', '4', '5']),
    z.partialRecord(z.enum(IDIOMAS_API), z.string().trim().min(1).max(120)),
  )
  .meta({ id: 'NomesDeCriticidadeApi' });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** As chaves padrão das prioridades (dominio, PRIORIDADES_PADRAO). */
const CHAVES_PADRAO_DE_PRIORIDADE = ['urgente', 'alta', 'media', 'baixa'];
/** Horas positivas, em quartos de hora, até 90 dias (dominio, horasDeSlaValidas). */
const HorasDeSla = z
  .number()
  .positive()
  .max(2160)
  .refine((h) => Number.isInteger(h * 4));
const RelogioDeSla = z.enum(['24x7', 'atendimento']);
/** Motivos da pausa da OS (dominio, MOTIVOS_DE_PAUSA; ADR-042). */
export const MOTIVOS_DE_PAUSA_API = [
  'aguardando_peca',
  'aguardando_fornecedor',
  'uh_ocupada_sem_acesso',
  'fim_de_turno',
  'outro',
] as const;
const LinhaDeSla = z
  .strictObject({ atendimentoHoras: HorasDeSla, solucaoHoras: HorasDeSla, relogio: RelogioDeSla })
  .refine((l) => l.atendimentoHoras <= l.solucaoHoras);
const SlaDaCategoria = z
  .strictObject({
    atendimentoHoras: HorasDeSla.optional(),
    solucaoHoras: HorasDeSla.optional(),
    relogio: RelogioDeSla.optional(),
    pausa: z.boolean().optional(),
  })
  .refine((c) => Object.keys(c).length > 0)
  .refine(
    (c) =>
      c.atendimentoHoras === undefined ||
      c.solucaoHoras === undefined ||
      c.atendimentoHoras <= c.solucaoHoras,
  );
/** Calendário de SLA (1c, ADR-042), como o dominio (politicaDeSlaValida). */
export const PoliticaDeSlaApi = z
  .strictObject({
    porPrioridade: z
      .record(
        z.string().refine((k) => UUID.test(k) || CHAVES_PADRAO_DE_PRIORIDADE.includes(k)),
        LinhaDeSla,
      )
      .refine((r) => Object.keys(r).length >= 1 && Object.keys(r).length <= 50),
    porCategoria: z.record(z.guid(), SlaDaCategoria).refine((r) => Object.keys(r).length <= 200),
    motivosQuePausam: z
      .array(z.enum(MOTIVOS_DE_PAUSA_API))
      .refine((m) => new Set(m).size === m.length),
    pontoFacultativo: z.boolean(),
    metaPercentual: z.int().min(1).max(100),
  })
  .meta({ id: 'PoliticaDeSlaApi' });

const minutos = (hhmm: string) =>
  hhmm === '24:00' ? 1440 : Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));
const IntervaloDeAtendimento = z
  .strictObject({
    inicio: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    fim: z.string().regex(/^(([01]\d|2[0-3]):[0-5]\d|24:00)$/),
  })
  .refine((i) => minutos(i.inicio) < minutos(i.fim));
const IntervalosDoDia = z
  .array(IntervaloDeAtendimento)
  .max(4)
  .refine((lista) =>
    lista.every((i, n) => n === 0 || minutos(i.inicio) >= minutos(lista[n - 1]?.fim ?? '00:00')),
  );
/** Horário de atendimento do hotel (1c, ADR-042), como o dominio (horarioDeAtendimentoValido). */
export const HorarioDeAtendimentoApi = z
  .strictObject({
    dom: IntervalosDoDia,
    seg: IntervalosDoDia,
    ter: IntervalosDoDia,
    qua: IntervalosDoDia,
    qui: IntervalosDoDia,
    sex: IntervalosDoDia,
    sab: IntervalosDoDia,
  })
  .refine((h) => Object.values(h).some((dia) => dia.length > 0))
  .meta({ id: 'HorarioDeAtendimentoApi' });

/** Destinatários do aviso do monitor de SLA (dominio, DESTINATARIOS_DO_AVISO; ADR-043). */
export const DESTINATARIOS_DO_AVISO_API = [
  'responsavel_da_os',
  'gerente_hotel',
  'gestor_csc',
  'admin_grupo',
] as const;
const DestinatariosDoAviso = z
  .array(z.enum(DESTINATARIOS_DO_AVISO_API))
  .min(1)
  .refine((d) => new Set(d).size === d.length);
/** Escalonamento do monitor de SLA (1c, ADR-043), como o dominio (escalonamentoValido). */
export const EscalonamentoDeSlaApi = z
  .strictObject({
    percentualDoAviso: z.int().min(50).max(95),
    emRisco: DestinatariosDoAviso,
    vencido: DestinatariosDoAviso,
  })
  .meta({ id: 'EscalonamentoDeSlaApi' });

/** Quem responde pela OS no hotel arrendado (dominio, RESPONSAVEIS_DO_ARRENDAMENTO). */
export const RESPONSAVEIS_DO_ARRENDAMENTO_API = ['arrendataria', 'locador'] as const;
/**
 * Matriz do arrendado (1c, decisão 5), como o dominio (matrizDeArrendamentoValida):
 * por categoria, a arrendatária ou o locador. Gravada no grupo ou no hotel; a
 * bandeira recusa (politica_nivel_nao_permitido).
 */
export const MatrizDeArrendamentoApi = z
  .record(z.guid(), z.enum(RESPONSAVEIS_DO_ARRENDAMENTO_API))
  .refine((r) => Object.keys(r).length <= 200)
  .meta({ id: 'MatrizDeArrendamentoApi' });

export const FORMATOS_DE_POLITICA_API = {
  'os.aceite_automatico': AceiteAutomatico,
  'os.codigos_obrigatorios': CodigosObrigatorios,
  'os.foto_depois_obrigatoria': FotoDepoisObrigatoria,
  'os.assinatura_no_aceite': AssinaturaNoAceite,
  'os.checklist_completo_obrigatorio': ChecklistCompletoObrigatorio,
  'chamado.prioridade_padrao_por_categoria': PrioridadePadraoPorCategoria,
  'ativo.criticidade': NomesDeCriticidadeApi,
  'ativo.aprovacao_do_cadastro': AprovacaoDoCadastro,
  'chamado.sla': PoliticaDeSlaApi,
  'hotel.horario_atendimento': HorarioDeAtendimentoApi,
  'chamado.escalonamento': EscalonamentoDeSlaApi,
  'hotel.matriz_arrendamento': MatrizDeArrendamentoApi,
} as const;

export const CHAVES_DE_POLITICA_API = Object.keys(
  FORMATOS_DE_POLITICA_API,
) as (keyof typeof FORMATOS_DE_POLITICA_API)[];

/** Os prefixos das chaves do núcleo, iguais aos do domínio (tests/contratos-dominio). */
export const PREFIXOS_DO_NUCLEO_API = ['os.', 'chamado.', 'ativo.', 'hotel.'] as const;

const ChaveDeExtensao = z
  .string()
  .max(64)
  .regex(/^[a-z][a-z_]*\.[a-z][a-z_]*$/)
  .refine((c) => !PREFIXOS_DO_NUCLEO_API.some((p) => c.startsWith(p)));

const EscopoDePolitica = z.discriminatedUnion('tipo', [
  z.object({ tipo: z.literal('grupo') }),
  /** A bandeira (1c): vale para os hotéis dela, abaixo do hotel e acima do grupo. */
  z.object({ tipo: z.literal('bandeira'), bandeiraId: z.guid() }),
  z.object({ tipo: z.literal('hotel'), hotelId: z.guid() }),
]);

/** Valor null: o escopo volta a herdar (grupo → padrão; bandeira → grupo; hotel → bandeira do hotel ou grupo). */
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
    chave: z.literal('ativo.aprovacao_do_cadastro'),
    escopo: EscopoDePolitica,
    valor: AprovacaoDoCadastro.nullable(),
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
  z.object({
    chave: z.literal('chamado.sla'),
    escopo: EscopoDePolitica,
    valor: PoliticaDeSlaApi.nullable(),
  }),
  z.object({
    chave: z.literal('hotel.horario_atendimento'),
    escopo: EscopoDePolitica,
    valor: HorarioDeAtendimentoApi.nullable(),
  }),
  z.object({
    chave: z.literal('chamado.escalonamento'),
    escopo: EscopoDePolitica,
    valor: EscalonamentoDeSlaApi.nullable(),
  }),
  z.object({
    chave: z.literal('hotel.matriz_arrendamento'),
    escopo: EscopoDePolitica,
    valor: MatrizDeArrendamentoApi.nullable(),
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

const Origem = z.enum(['hotel', 'bandeira', 'grupo', 'padrao']);
const resolvida = <C extends string, V extends z.ZodType>(chave: C, valor: V) =>
  z.object({
    chave: z.literal(chave),
    padrao: valor,
    grupo: valor.nullable(),
    /** O valor da bandeira do hotel; nulo sem hotel, sem bandeira ou sem valor. */
    bandeira: valor.nullable(),
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
        /** A bandeira do hotel (1c), cujo nível de política vale para ele. */
        bandeira: z.object({ id: z.guid(), nome: z.string() }).nullable(),
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
        resolvida('ativo.aprovacao_do_cadastro', AprovacaoDoCadastro),
        resolvida('chamado.sla', PoliticaDeSlaApi),
        resolvida('hotel.horario_atendimento', HorarioDeAtendimentoApi),
        resolvida('chamado.escalonamento', EscalonamentoDeSlaApi),
        resolvida('hotel.matriz_arrendamento', MatrizDeArrendamentoApi),
      ]),
    ),
  })
  .meta({ id: 'RespostaDeConfiguracao' });
