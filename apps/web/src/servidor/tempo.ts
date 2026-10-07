// Server-Timing (P1a): quanto cada etapa do pedido levou no servidor, para ver
// no DevTools (aba Rede, "Timing") e no log sem instrumentar a máquina. Só
// nomes fixos e milissegundos; nenhum dado do pedido.
//
// Sem import da composição: o proxy.ts usa este módulo e não pode puxar o banco.

export const CABECALHO_SERVER_TIMING = 'server-timing';

/**
 * Duração do proxy, que ele passa adiante para a rota da API juntar ao próprio
 * Server-Timing. O proxy sempre regrava este cabeçalho, então o valor que o
 * navegador mandar nunca chega à rota.
 */
export const CABECALHO_TEMPO_DO_PROXY = 'x-hk-tempo-proxy';

export type Etapa = 'proxy' | 'sessao' | 'auth' | 'app';

/** Uma métrica do Server-Timing: `nome;dur=12.3`. */
export const metrica = (etapa: Etapa, ms: number) =>
  `${etapa};dur=${Math.max(0, Math.round(ms * 10) / 10)}`;

/** O Server-Timing que o proxy passou adiante, se tiver o formato dele. */
export function tempoDoProxy(cabecalhos: Headers): string | null {
  const valor = cabecalhos.get(CABECALHO_TEMPO_DO_PROXY);
  return valor && /^[a-z]+;dur=\d+(\.\d)?(, [a-z]+;dur=\d+(\.\d)?)*$/.test(valor) ? valor : null;
}
