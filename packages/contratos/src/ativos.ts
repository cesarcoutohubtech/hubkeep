// Ativos do hotel (fase 1a, B3; ADR-028 e ADR-029): local, categoria, campos
// estendidos, fabricante, modelo, número de série e a versão que o cliente
// devolve na alteração. A validação dos campos contra a categoria é do domínio.
// Compra, garantia e criticidade (fase 1b, I1): opcionais na gravação, para a
// operação guardada no aparelho antes da I1 continuar valendo; na alteração,
// ausente mantém o valor gravado e null apaga.
import { z } from 'zod';
import { NomesDeCriticidadeApi } from './configuracao';

/** As situações do cadastro (M4), iguais às do domínio (tests/contratos-dominio). */
export const SITUACOES_DO_CADASTRO_API = ['pendente', 'aprovado', 'recusado'] as const;
export const DECISOES_DO_CADASTRO_API = ['aprovado', 'recusado'] as const;

/** Data de calendário aaaa-mm-dd; a existência da data é conferida no domínio. */
const DataDoAtivo = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const CriticidadeApi = z.int().min(1).max(5);

export const ValoresDeCampoApi = z
  .record(z.string().max(40), z.union([z.string().max(500), z.number(), z.boolean(), z.null()]))
  .meta({ id: 'ValoresDeCampoApi' });

export const AtivoApi = z
  .object({
    id: z.guid(),
    localId: z.guid(),
    categoriaId: z.guid().nullable(),
    /**
     * O modelo de que o ativo nasceu (M1); os dados copiados ficam no ativo.
     * Opcional na leitura, para o PWA novo aceitar a resposta do servidor de
     * antes da M1 durante a publicação.
     */
    modeloId: z.guid().nullable().optional(),
    nome: z.string(),
    fabricante: z.string().nullable(),
    modelo: z.string().nullable(),
    numeroSerie: z.string().nullable(),
    dataCompra: DataDoAtivo.nullable(),
    garantiaAte: DataDoAtivo.nullable(),
    /** De 1 (menor) a 5 (maior); o nome do nível vem de nomesDeCriticidade ou do catálogo. */
    criticidade: CriticidadeApi.nullable(),
    /** Lidos com a definição atual da categoria. */
    campos: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
    versao: z.number().int().min(1),
    ativo: z.boolean(),
    /** Código do QR individual (B5): 10 caracteres, imutável. */
    codigoQr: z.string().regex(/^[0-9A-HJKMNP-TV-Z]{10}$/),
    /** Início da parada aberta (C5); null se não está parado. */
    paradoDesde: z.iso.datetime().nullable(),
    /**
     * A situação do cadastro (M4): pendente de aprovação, aprovado ou
     * recusado. Opcional na leitura, como o modeloId, para o PWA aceitar o
     * servidor de antes da M4 durante a publicação.
     */
    situacaoCadastro: z.enum(SITUACOES_DO_CADASTRO_API).optional(),
    /** O motivo da recusa do cadastro (M4); null sem recusa. */
    motivoDaRecusa: z.string().nullable().optional(),
  })
  .meta({ id: 'AtivoApi' });

/** O ativo aberto pelo QR (B5), com o hotel, para o aparelho saber onde ele está. */
export const RespostaDeAtivoDoQr = z
  .object({ hotelId: z.guid(), ativo: AtivoApi })
  .meta({ id: 'RespostaDeAtivoDoQr' });

export const RespostaDeAtivosDoHotel = z
  .object({
    ativos: z.array(AtivoApi),
    /** A política ativo.criticidade resolvida para o hotel; o nível sem nome usa o catálogo. */
    nomesDeCriticidade: NomesDeCriticidadeApi,
  })
  .meta({ id: 'RespostaDeAtivosDoHotel' });

const gravacao = {
  categoriaId: z.guid().nullable(),
  nome: z.string().max(200),
  fabricante: z.string().max(200).nullable(),
  modelo: z.string().max(200).nullable(),
  numeroSerie: z.string().max(200).nullable(),
  campos: ValoresDeCampoApi.optional(),
  dataCompra: DataDoAtivo.nullable().optional(),
  garantiaAte: DataDoAtivo.nullable().optional(),
  criticidade: z.number().nullable().optional(),
  /** O modelo escolhido (M1); ausente mantém o gravado (alteração) ou fica nulo (cadastro). */
  modeloId: z.guid().nullable().optional(),
};

export const PedidoDeCadastroDeAtivo = z
  .object({
    localId: z.guid(),
    ...gravacao,
    /** O código da etiqueta reservada (M3); ausente ou null: o código é gerado. */
    codigoQr: z.string().max(40).nullable().optional(),
  })
  .meta({ id: 'PedidoDeCadastroDeAtivo' });

export const PedidoDeAlteracaoDeAtivo = z
  .object({ versao: z.number().int().min(1), ...gravacao })
  .meta({ id: 'PedidoDeAlteracaoDeAtivo' });

/** Desativação e reativação levam só a versão vista (ADR-029). */
export const PedidoDeVersaoDeAtivo = z
  .object({ versao: z.number().int().min(1) })
  .meta({ id: 'PedidoDeVersaoDeAtivo' });

export const RespostaDeAtivoGravado = z
  .object({ id: z.guid(), versao: z.number().int().min(1) })
  .meta({ id: 'RespostaDeAtivoGravado' });

/** Mover o ativo para outro local do mesmo hotel (B3c), com a versão vista. */
export const PedidoDeMovimentacaoDeAtivo = z
  .object({ localDestinoId: z.guid(), versao: z.number().int().min(1) })
  .meta({ id: 'PedidoDeMovimentacaoDeAtivo' });

export const MovimentacaoDeAtivoApi = z
  .object({
    id: z.guid(),
    localOrigemId: z.guid(),
    localDestinoId: z.guid(),
    usuarioId: z.guid(),
    nomeUsuario: z.string().nullable(),
    movidoEm: z.iso.datetime({ offset: true }),
  })
  .meta({ id: 'MovimentacaoDeAtivoApi' });

export const RespostaDeMovimentacoesDoAtivo = z
  .object({ movimentacoes: z.array(MovimentacaoDeAtivoApi) })
  .meta({ id: 'RespostaDeMovimentacoesDoAtivo' });

/** Um cadastro que espera a aprovação (M4), na fila do hotel, do mais antigo. */
export const CadastroPendenteApi = z
  .object({
    id: z.guid(),
    localId: z.guid(),
    localNome: z.string(),
    categoriaId: z.guid().nullable(),
    nome: z.string(),
    fabricante: z.string().nullable(),
    modelo: z.string().nullable(),
    numeroSerie: z.string().nullable(),
    /** A versão do ativo, que a decisão leva (ADR-029). */
    versao: z.int(),
    criadoEm: z.iso.datetime(),
  })
  .meta({ id: 'CadastroPendenteApi' });

export const RespostaDeCadastrosPendentes = z
  .object({ cadastros: z.array(CadastroPendenteApi) })
  .meta({ id: 'RespostaDeCadastrosPendentes' });

export const PedidoDeDecisaoDoCadastro = z
  .object({
    decisao: z.enum(DECISOES_DO_CADASTRO_API),
    /** Obrigatório na recusa (motivo_obrigatorio); ignorado na aprovação. */
    motivo: z.string().max(1000).nullable(),
    versao: z.int(),
  })
  .meta({ id: 'PedidoDeDecisaoDoCadastro' });

export const RespostaDeDecisaoDoCadastro = z
  .object({ versao: z.int() })
  .meta({ id: 'RespostaDeDecisaoDoCadastro' });

/** O limite da planilha (M2), igual ao do domínio (tests/contratos-dominio). */
export const LIMITES_DA_IMPORTACAO_API = { linhas: 2000, bytes: 2 * 1024 * 1024 } as const;
/**
 * O corpo do pedido leva o CSV dentro do JSON, e o escape (aspas e quebras de
 * linha) pode dobrar o tamanho; o limite do texto em si é do domínio.
 */
export const LIMITE_DO_CORPO_DA_IMPORTACAO = 2 * LIMITES_DA_IMPORTACAO_API.bytes + 1024;

export const SITUACOES_DA_LINHA_API = ['nova', 'ja_importada', 'invalida'] as const;
export const SITUACOES_DA_LINHA_GRAVADA_API = ['criada', 'ja_importada', 'invalida'] as const;

export const PedidoDeImportacaoDeAtivos = z
  .object({ csv: z.string() })
  .meta({ id: 'PedidoDeImportacaoDeAtivos' });

/** Um problema da linha: código, coluna (null: a linha toda) e parâmetros da mensagem. */
export const ErroDaLinhaApi = z
  .object({
    codigo: z.string(),
    coluna: z.string().nullable(),
    parametros: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
  })
  .meta({ id: 'ErroDaLinhaApi' });

export const LinhaDaPreviaApi = z
  .object({
    /** A linha do arquivo (o cabeçalho é a 1). */
    numero: z.int(),
    situacao: z.enum(SITUACOES_DA_LINHA_API),
    nome: z.string().nullable(),
    erros: z.array(ErroDaLinhaApi),
  })
  .meta({ id: 'LinhaDaPreviaApi' });

export const RespostaDaPreviaDaImportacao = z
  .object({
    linhas: z.array(LinhaDaPreviaApi),
    novas: z.int(),
    jaImportadas: z.int(),
    invalidas: z.int(),
  })
  .meta({ id: 'RespostaDaPreviaDaImportacao' });

export const LinhaImportadaApi = z
  .object({
    numero: z.int(),
    situacao: z.enum(SITUACOES_DA_LINHA_GRAVADA_API),
    nome: z.string().nullable(),
    erros: z.array(ErroDaLinhaApi),
    ativoId: z.guid().nullable(),
  })
  .meta({ id: 'LinhaImportadaApi' });

export const RespostaDaImportacao = z
  .object({
    linhas: z.array(LinhaImportadaApi),
    criadas: z.int(),
    jaImportadas: z.int(),
    invalidas: z.int(),
  })
  .meta({ id: 'RespostaDaImportacao' });
