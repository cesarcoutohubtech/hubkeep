// Foto antes ou depois e assinatura no aceite (fase 1b, I8; desenho aprovado
// pelo Cesar em 08/10/2026, item 4).
//
// Foto: o anexo da OS pode ter um momento, "antes" ou "depois" (nulo: sem
// momento, como as fotos anteriores à I8). O PWA sugere pelo estado da OS
// (momentoSugerido) e o técnico pode trocar. A foto "antes" é tirada com a OS
// ainda não iniciada, então anexar foto vale também na OS atribuída
// (corretiva.ts, ESTADOS_QUE_ACEITAM_FOTO).
//
// Políticas por hotel, desligadas por padrão (politicas.ts):
//   - os.foto_depois_obrigatoria: a conclusão exige ao menos uma foto
//     "depois" registrada na OS. Sem rede, a foto vai pela fila antes da
//     conclusão, que sai depois dela;
//   - os.assinatura_no_aceite: o aceite exige a assinatura desenhada por quem
//     aceita. É evidência do aceite, e não assinatura digital ICP-Brasil.
import type { EstadoDaOs } from './corretiva';
import { RegraViolada } from './erros';

export const MOMENTOS_DA_FOTO = ['antes', 'depois'] as const;
export type MomentoDaFoto = (typeof MOMENTOS_DA_FOTO)[number];

export const ehMomentoDaFoto = (v: unknown): v is MomentoDaFoto =>
  typeof v === 'string' && (MOMENTOS_DA_FOTO as readonly string[]).includes(v);

/** A sugestão do PWA: com a OS ainda não iniciada, "antes"; depois disso, "depois". */
export function momentoSugerido(estado: EstadoDaOs): MomentoDaFoto {
  return estado === 'atribuida' ? 'antes' : 'depois';
}

/** O momento só vale em anexo de OS; nulo ou ausente quer dizer "sem momento". */
export function validarMomentoDoAnexo(entidade: string, momento: unknown): MomentoDaFoto | null {
  if (momento === null || momento === undefined) return null;
  if (!ehMomentoDaFoto(momento)) {
    throw new RegraViolada('momento_da_foto_invalido', 'Momento da foto inválido.');
  }
  if (entidade !== 'os') {
    throw new RegraViolada('momento_so_na_os', 'Só a foto da OS tem momento.', { entidade });
  }
  return momento;
}

/** Com a política ligada, a conclusão precisa de ao menos uma foto "depois" na OS. */
export function exigirFotoDepoisNaConclusao(obrigatoria: boolean, fotosDepois: number): void {
  if (obrigatoria && fotosDepois < 1) {
    throw new RegraViolada(
      'foto_depois_obrigatoria',
      'Tire ao menos uma foto "depois" para concluir a OS.',
    );
  }
}

/** Com a política ligada, o aceite precisa da assinatura de quem aceita. */
export function exigirAssinaturaNoAceite(obrigatoria: boolean, temAssinatura: boolean): void {
  if (obrigatoria && !temAssinatura) {
    throw new RegraViolada('assinatura_obrigatoria_no_aceite', 'Assine para aceitar a OS.');
  }
}
