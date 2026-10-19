// A nova tentativa da gravação do histórico quando a conexão com o banco cai
// (decisão do Kaio, 15/10/2026): só no script da gravação, nunca no pool do
// packages/db; tentativas limitadas, com espera crescente; e, se todas
// falharem, a gravação para com uma mensagem que diz como continuar.
//
// Só serve a operações que podem ser repetidas sem duplicar: as do roteiro
// têm chave fixa ou conferem o estado antes de gravar (gravacao-historico.ts).

/** Esperas entre as tentativas, em ms: 2, 4, 8, 16 e 32 s (cinco novas tentativas). */
export const ESPERAS_DA_NOVA_TENTATIVA_MS: readonly number[] = [
  2_000, 4_000, 8_000, 16_000, 32_000,
];

const CODIGOS_DE_QUEDA = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'ECONNABORTED',
  'EPIPE',
  'ETIMEDOUT',
  'EAI_AGAIN',
  'ENOTFOUND',
  'ENETUNREACH',
  'EHOSTUNREACH',
  // Classe 08 do Postgres (conexão) e o encerramento pelo servidor.
  '08000',
  '08001',
  '08003',
  '08006',
  '57P01',
  '57P02',
  '57P03',
]);

const MENSAGENS_DE_QUEDA =
  /connection terminated|connection ended|socket hang up|timeout exceeded when trying to connect|client has encountered a connection error|server closed the connection/i;

/** A conexão caiu (rede, pooler ou servidor), e não um erro do dado ou da regra. */
export function ehQuedaDeConexao(e: unknown): boolean {
  for (let atual: unknown = e, i = 0; atual && i < 5; i += 1) {
    if (typeof atual !== 'object') return false;
    const { code, message, cause } = atual as {
      code?: unknown;
      message?: unknown;
      cause?: unknown;
    };
    if (typeof code === 'string' && CODIGOS_DE_QUEDA.has(code)) return true;
    if (typeof message === 'string' && MENSAGENS_DE_QUEDA.test(message)) return true;
    atual = cause;
  }
  return false;
}

export class ConexaoPerdida extends Error {
  override readonly name = 'ConexaoPerdida';
}

export interface OpcoesDaNovaTentativa {
  /** O que estava sendo feito, para a mensagem final. */
  descricao: string;
  /** O que fazer para continuar, para a mensagem final. */
  comoContinuar: string;
  log?: (linha: string) => void;
  esperasMs?: readonly number[];
  esperar?: (ms: number) => Promise<void>;
}

const esperarDeVerdade = (ms: number) => new Promise<void>((ok) => setTimeout(ok, ms));

/**
 * Roda `fazer`; se a conexão cair, tenta de novo depois de cada espera. Outro
 * erro sobe na hora. Se a última tentativa também cair, lança ConexaoPerdida.
 */
export async function comNovaTentativa<T>(
  fazer: () => Promise<T>,
  o: OpcoesDaNovaTentativa,
): Promise<T> {
  const esperas = o.esperasMs ?? ESPERAS_DA_NOVA_TENTATIVA_MS;
  const esperar = o.esperar ?? esperarDeVerdade;
  for (let tentativa = 0; ; tentativa += 1) {
    try {
      return await fazer();
    } catch (e) {
      if (!ehQuedaDeConexao(e)) throw e;
      const espera = esperas[tentativa];
      const motivo = e instanceof Error ? e.message : String(e);
      if (espera === undefined) {
        throw new ConexaoPerdida(
          `A conexão com o banco caiu ${tentativa + 1} vezes seguidas em ${o.descricao} ` +
            `(último erro: ${motivo}). A gravação parou; o que já foi gravado fica. ` +
            o.comoContinuar,
          { cause: e },
        );
      }
      o.log?.(
        `A conexão caiu em ${o.descricao} (${motivo}). Nova tentativa ` +
          `${tentativa + 1} de ${esperas.length} em ${Math.round(espera / 1000)} s.`,
      );
      await esperar(espera);
    }
  }
}
