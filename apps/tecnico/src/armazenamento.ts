// Espaço do aparelho (adendo ao ADR-025, C4b; condições da aprovação de
// 29/09/2026). A fila guarda operações e fotos que ainda não subiram, e o
// navegador pode descartar o armazenamento do site (o iOS descarta sob
// pressão de espaço, ou depois de dias sem uso):
//   (a) ao entrar, o app pede armazenamento persistente
//       (navigator.storage.persist()); com operação pendente há mais de
//       PENDENCIA_ANTIGA_MS, a fila do dia avisa para conectar e enviar;
//   (b) a foto já chega comprimida (@hubkeep/imagem: 1600 px, JPEG 0,8, e a
//       miniatura de 320 px) e só entra na fila abaixo de um teto: o das fotos
//       do usuário na fila e o espaço livre que o navegador informa;
//   (c) sair com operação pendente pede confirmação (saida.ts).
// Sem a API de armazenamento (navegador antigo, teste), nada é bloqueado:
// vale o teto das fotos e o erro de cota do IndexedDB, se vier.
import { RegraViolada } from '@hubkeep/dominio';
import type { FotoNaFila, OperacaoNaFila } from './fila/banco';

/** Pendência mais velha que isto gera o aviso na fila do dia. */
export const PENDENCIA_ANTIGA_MS = 24 * 60 * 60 * 1000;
/** Soma das fotos (e miniaturas) do usuário ainda na fila. */
export const TETO_DAS_FOTOS_NA_FILA = 50 * 1024 * 1024;
/** Espaço que fica livre depois de guardar a foto. */
export const FOLGA_DO_ARMAZENAMENTO = 20 * 1024 * 1024;

type Gerenciador = Partial<Pick<StorageManager, 'persist' | 'persisted' | 'estimate'>>;

const doNavegador = (): Gerenciador | null => globalThis.navigator?.storage ?? null;

/** Pede ao navegador para não descartar os dados do app; true se ficaram persistentes. */
export async function pedirPersistencia(g: Gerenciador | null = doNavegador()): Promise<boolean> {
  try {
    if (await g?.persisted?.()) return true;
    return (await g?.persist?.()) ?? false;
  } catch {
    return false;
  }
}

/** Quando foi criada a pendente mais velha, se passou de PENDENCIA_ANTIGA_MS; senão null. */
export function pendenteAntigaDesde(
  ops: readonly Pick<OperacaoNaFila, 'estado' | 'criadaEm'>[],
  agora: number,
): number | null {
  const pendentes = ops.filter((o) => o.estado === 'pendente').map((o) => o.criadaEm);
  if (pendentes.length === 0) return null;
  const maisVelha = Math.min(...pendentes);
  return agora - maisVelha >= PENDENCIA_ANTIGA_MS ? maisVelha : null;
}

export const tamanhoDaFoto = (f: FotoNaFila): number => f.foto.byteLength + f.miniatura.byteLength;

/** Bytes das fotos na fila, pendentes e recusadas: as duas ocupam o aparelho. */
export const bytesDasFotos = (ops: readonly Pick<OperacaoNaFila, 'tipo' | 'dados'>[]): number =>
  ops
    .filter((o) => o.tipo === 'anexo.foto')
    .reduce((soma, o) => soma + tamanhoDaFoto(o.dados as FotoNaFila), 0);

/** Recusa a foto que passaria do teto da fila ou do espaço livre do aparelho. */
export async function conferirEspacoParaFoto(
  ops: readonly Pick<OperacaoNaFila, 'tipo' | 'dados'>[],
  tamanho: number,
  g: Gerenciador | null = doNavegador(),
): Promise<void> {
  if (bytesDasFotos(ops) + tamanho > TETO_DAS_FOTOS_NA_FILA) {
    throw new RegraViolada('fotos_na_fila_no_limite', 'Fotos demais aguardando envio.');
  }
  let estimativa: StorageEstimate | undefined;
  try {
    estimativa = await g?.estimate?.();
  } catch {
    return;
  }
  const { quota, usage } = estimativa ?? {};
  if (
    quota !== undefined &&
    usage !== undefined &&
    quota - usage < tamanho + FOLGA_DO_ARMAZENAMENTO
  ) {
    throw new RegraViolada('espaco_insuficiente', 'Sem espaço no aparelho.');
  }
}

/** O IndexedDB recusou a gravação por falta de espaço. */
export const faltouEspaco = (erro: unknown): boolean =>
  erro instanceof DOMException && erro.name === 'QuotaExceededError';
