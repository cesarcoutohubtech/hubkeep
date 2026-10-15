// Leitura da OS por id (PV3c), para a rota GET /api/v1/os/{id} e a página
// /os/{id}, que a lê pela API no navegador. Serve à corretiva e à
// preventiva, que não tem chamado: o hotel, o local e o ativo vêm da própria
// OS. Quem não vê a OS recebe NaoEncontrado (404 os_nao_encontrada).
import type { CasosDeUsoDeConsultas, CasosDeUsoDeTriagem } from '@hubkeep/aplicacao';
import type { ESTADOS_DA_OS_API, RespostaDeOs, z } from '@hubkeep/contratos';
import type { Contexto } from '@hubkeep/db';
import { casosDeUsoDeConsultas, casosDeUsoDeTriagem } from './composicao';

/** De onde vêm os casos de uso; nos testes, falsos. */
export interface FontesDaOs {
  triagem: () => Promise<Pick<CasosDeUsoDeTriagem, 'os' | 'assinaturaNoAceite'>>;
  consultas: () => Promise<Pick<CasosDeUsoDeConsultas, 'nomesDaOs'>>;
}

const FONTES: FontesDaOs = { triagem: casosDeUsoDeTriagem, consultas: casosDeUsoDeConsultas };

export async function detalheDaOs(
  ctx: Contexto,
  id: string,
  f: FontesDaOs = FONTES,
): Promise<z.input<typeof RespostaDeOs>> {
  const triagem = await f.triagem();
  const o = await triagem.os(ctx, id);
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
