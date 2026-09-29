// Ativos do hotel (fase 1a, B3; ADR-028 e ADR-029): local, categoria, campos
// estendidos, fabricante, modelo, número de série e a versão que o cliente
// devolve na alteração. A validação dos campos contra a categoria é do domínio.
import { z } from 'zod';

export const ValoresDeCampoApi = z
  .record(z.string().max(40), z.union([z.string().max(500), z.number(), z.boolean(), z.null()]))
  .meta({ id: 'ValoresDeCampoApi' });

export const AtivoApi = z
  .object({
    id: z.guid(),
    localId: z.guid(),
    categoriaId: z.guid().nullable(),
    nome: z.string(),
    fabricante: z.string().nullable(),
    modelo: z.string().nullable(),
    numeroSerie: z.string().nullable(),
    /** Lidos com a definição atual da categoria. */
    campos: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
    versao: z.number().int().min(1),
    ativo: z.boolean(),
  })
  .meta({ id: 'AtivoApi' });

export const RespostaDeAtivosDoHotel = z
  .object({ ativos: z.array(AtivoApi) })
  .meta({ id: 'RespostaDeAtivosDoHotel' });

const gravacao = {
  categoriaId: z.guid().nullable(),
  nome: z.string().max(200),
  fabricante: z.string().max(200).nullable(),
  modelo: z.string().max(200).nullable(),
  numeroSerie: z.string().max(200).nullable(),
  campos: ValoresDeCampoApi.optional(),
};

export const PedidoDeCadastroDeAtivo = z
  .object({ localId: z.guid(), ...gravacao })
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
