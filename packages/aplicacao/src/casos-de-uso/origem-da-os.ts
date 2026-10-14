// A OS lida com a origem da regra (PV3c; ADR-041): o chamado, na corretiva,
// ou só o hotel da OS, na preventiva, que não tem chamado. As ações da
// triagem, da execução, do checklist e dos códigos partem daqui.
import { type Contexto, NaoEncontrado, type OrigemDaOs } from '@hubkeep/dominio';
import type { ChamadoParaTriagem, OsGravada, PortaTriagem } from '../portas/triagem';

export interface OsComOrigem {
  os: OsGravada;
  /** O chamado da corretiva; null na preventiva. */
  chamado: ChamadoParaTriagem | null;
  /** O que a regra de papel olha (decidirNaOs, decidirRegistroNaOs). */
  origem: OrigemDaOs;
  /** O ativo: o do chamado, na corretiva, ou o da ocorrência, na preventiva. */
  ativoId: string | null;
}

/** A OS e a origem; 404 se a OS (ou o chamado dela) não está visível a quem pede. */
export async function lerOsComOrigem(
  triagem: Pick<PortaTriagem, 'os' | 'chamado'>,
  ctx: Contexto,
  osId: string,
): Promise<OsComOrigem> {
  const os = await triagem.os(ctx, osId);
  if (!os) throw new NaoEncontrado('os_nao_encontrada', 'Ordem de serviço não encontrada.');
  if (os.chamadoId === null) {
    return {
      os,
      chamado: null,
      origem: { chamado: null, hotel: { id: os.hotelId, bandeiraId: os.bandeiraId } },
      ativoId: os.preventiva?.ativoId ?? null,
    };
  }
  const chamado = await triagem.chamado(ctx, os.chamadoId);
  if (!chamado) throw new NaoEncontrado('os_nao_encontrada', 'Ordem de serviço não encontrada.');
  return { os, chamado, origem: { chamado }, ativoId: chamado.ativoId };
}
