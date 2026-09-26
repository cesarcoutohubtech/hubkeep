// Envio da fila offline (F0-11, ADR-025). Uma passada manda as operações
// pendentes na ordem em que foram feitas, uma por vez:
//
//   aceita (201) ou repetida (200)   sai da fila. "Repetida" é o caso da
//                                    resposta perdida: o servidor já tinha
//                                    aplicado e não aplica de novo;
//   recusada (4xx de regra)          fica como rejeitada, para a tela mostrar;
//                                    não se reenvia (a chave não foi guardada);
//   sem rede, 5xx, 401, 408, 429     continua pendente, com espera que dobra.
//
// A ordem é mantida: a passada para na primeira operação que não sai (sem rede
// ou ainda esperando), e uma mais nova nunca passa na frente de uma mais velha.
// Quem chama é o app: ao abrir, depois de enfileirar, quando a rede volta e no
// botão "Enviar agora" (esses dois últimos ignoram a espera). Duas passadas ao
// mesmo tempo viram uma (a segunda espera a primeira).
import type { FilaDeOperacoes, OperacaoNaFila } from './banco';

export type ResultadoDoEnvio =
  | { tipo: 'aceita' }
  | { tipo: 'recusada'; codigo: string }
  | { tipo: 'tentar_depois'; motivo: string };

/** Manda uma operação à API; nunca lança (falha de rede vira tentar_depois). */
export type Envio = (op: OperacaoNaFila) => Promise<ResultadoDoEnvio>;

export const ESPERA_INICIAL_MS = 5_000;
export const ESPERA_MAXIMA_MS = 5 * 60_000;

const esperaDepoisDe = (tentativas: number) =>
  Math.min(ESPERA_INICIAL_MS * 2 ** (tentativas - 1), ESPERA_MAXIMA_MS);

export interface ResumoDaPassada {
  enviadas: number;
  recusadas: number;
  adiadas: number;
}

let emAndamento: Promise<ResumoDaPassada> | null = null;

export interface OpcoesDaPassada {
  agora?: () => number;
  /** A rede acabou de voltar, ou o técnico pediu: não espera o backoff. */
  ignorarEspera?: boolean;
}

export function sincronizar(
  fila: FilaDeOperacoes,
  enviar: Envio,
  opcoes: OpcoesDaPassada = {},
): Promise<ResumoDaPassada> {
  emAndamento ??= passada(
    fila,
    enviar,
    opcoes.agora ?? Date.now,
    opcoes.ignorarEspera ?? false,
  ).finally(() => {
    emAndamento = null;
  });
  return emAndamento;
}

async function passada(
  fila: FilaDeOperacoes,
  enviar: Envio,
  agora: () => number,
  ignorarEspera: boolean,
): Promise<ResumoDaPassada> {
  const resumo: ResumoDaPassada = { enviadas: 0, recusadas: 0, adiadas: 0 };
  const pendentes = (await fila.todas()).filter((op) => op.estado === 'pendente');
  for (const [i, op] of pendentes.entries()) {
    if (!ignorarEspera && op.proximaTentativaEm > agora()) {
      resumo.adiadas += pendentes.length - i;
      break;
    }
    const r = await enviar(op);
    if (r.tipo === 'aceita') {
      await fila.remover(op.chave);
      resumo.enviadas++;
    } else if (r.tipo === 'recusada') {
      await fila.atualizar({ ...op, estado: 'rejeitada', ultimoErro: r.codigo });
      resumo.recusadas++;
    } else {
      const tentativas = op.tentativas + 1;
      await fila.atualizar({
        ...op,
        tentativas,
        proximaTentativaEm: agora() + esperaDepoisDe(tentativas),
        ultimoErro: r.motivo,
      });
      resumo.adiadas += pendentes.length - i;
      // Sem rede, as próximas também falhariam; e nenhuma passa na frente.
      break;
    }
  }
  return resumo;
}

/** Status HTTP que valem nova tentativa (o resto de 4xx é recusa definitiva). */
export const vaiTentarDeNovo = (status: number) =>
  status >= 500 || status === 401 || status === 408 || status === 429;
