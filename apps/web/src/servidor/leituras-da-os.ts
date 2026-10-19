// Leitura da OS por id (PV3c), para a rota GET /api/v1/os/{id} e a página
// /os/{id}, que a lê pela API no navegador. Serve à corretiva e à
// preventiva, que não tem chamado: o hotel, o local e o ativo vêm da própria
// OS. Quem não vê a OS recebe NaoEncontrado (404 os_nao_encontrada).
//
// A impressão (1c, item 9) é a mesma leitura, com a OS de osParaImpressao (sem
// o custo para quem só enxerga o hotel como proprietário), a descrição do
// chamado e o aceite no papel.
import type {
  CasosDeUsoDeChamados,
  CasosDeUsoDeConsultas,
  CasosDeUsoDeTriagem,
  OsGravada,
} from '@hubkeep/aplicacao';
import type {
  ESTADOS_DA_OS_API,
  RespostaDaImpressaoDaOs,
  RespostaDeOs,
  z,
} from '@hubkeep/contratos';
import type { Contexto } from '@hubkeep/db';
import { aceiteNaImpressao } from '@hubkeep/dominio';
import { casosDeUsoDeChamados, casosDeUsoDeConsultas, casosDeUsoDeTriagem } from './composicao';

/** De onde vêm os casos de uso; nos testes, falsos. */
export interface FontesDaOs {
  triagem: () => Promise<
    Pick<CasosDeUsoDeTriagem, 'os' | 'osParaImpressao' | 'assinaturaNoAceite'>
  >;
  consultas: () => Promise<Pick<CasosDeUsoDeConsultas, 'nomesDaOs'>>;
  chamados: () => Promise<Pick<CasosDeUsoDeChamados, 'chamado'>>;
}

const FONTES: FontesDaOs = {
  triagem: casosDeUsoDeTriagem,
  consultas: casosDeUsoDeConsultas,
  chamados: casosDeUsoDeChamados,
};

export async function detalheDaOs(
  ctx: Contexto,
  id: string,
  f: FontesDaOs = FONTES,
): Promise<z.input<typeof RespostaDeOs>> {
  return montar(ctx, await (await f.triagem()).os(ctx, id), f);
}

export async function impressaoDaOs(
  ctx: Contexto,
  id: string,
  f: FontesDaOs = FONTES,
): Promise<z.input<typeof RespostaDaImpressaoDaOs>> {
  const { os, custoOculto } = await (await f.triagem()).osParaImpressao(ctx, id);
  const [detalhe, chamado] = await Promise.all([
    montar(ctx, os, f),
    os.chamadoId === null ? null : (await f.chamados()).chamado(ctx, os.chamadoId),
  ]);
  return {
    ...detalhe,
    descricao: chamado?.descricao ?? null,
    custoOculto,
    aceite: aceiteNaImpressao(os),
  };
}

async function montar(
  ctx: Contexto,
  o: OsGravada,
  f: FontesDaOs,
): Promise<z.input<typeof RespostaDeOs>> {
  const id = o.id;
  const triagem = await f.triagem();
  const [nomes, assinaturaNoAceite] = await Promise.all([
    (await f.consultas()).nomesDaOs(ctx, id),
    triagem.assinaturaNoAceite(ctx, o.hotelId),
  ]);
  return {
    os: {
      id: o.id,
      hotelId: o.hotelId,
      chamadoId: o.chamadoId,
      preventiva: o.preventiva,
      estado: o.estado as (typeof ESTADOS_DA_OS_API)[number],
      situacaoId: o.situacaoId,
      responsavel: o.responsavel,
      motivoCancelamento: o.motivoCancelamento,
      motivoReabertura: o.motivoReabertura,
      executadoPor: o.executadoPor,
      fornecedorId: o.fornecedorId,
      custoInformado: o.custoInformado,
      codigos: o.codigos,
      assinaturaAceiteId: o.assinaturaAceiteId,
      responsavelArrendamento: o.responsavelArrendamento,
      locadorAvisadoEm: o.locadorAvisadoEm?.toISOString() ?? null,
      criadoPor: o.criadoPor,
      versao: o.versao,
      criadoEm: o.criadoEm.toISOString(),
    },
    nomes,
    assinaturaNoAceite,
  };
}
