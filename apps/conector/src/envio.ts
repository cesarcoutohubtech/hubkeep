// Envio dos registros para POST /api/v1/ingestao/lotes (ADR-008). Divide em
// lotes que cabem nos limites do endpoint; cada lote é idempotente no servidor
// (mesmo conteúdo, mesmo hash), então reenviar depois de uma falha é seguro.
//
// O agente só tem a URL da API e a credencial dele. Nenhuma credencial do banco
// do HubKeep passa por aqui (tests/conector-sem-banco.test.ts).
import {
  type EntidadeExterna,
  type Fonte,
  LIMITE_BYTES_LOTE,
  LIMITE_REGISTROS_LOTE,
  type RegistroExterno,
  RespostaDeLote,
} from '@hubkeep/contratos';

/** Margem para o envelope do lote (fonte, entidade, chaves do JSON). */
const MARGEM_BYTES = 16 * 1024;

const tamanho = (valor: unknown) => new TextEncoder().encode(JSON.stringify(valor)).length;

/** Divide mantendo cada lote abaixo do número de registros e do tamanho em bytes. */
export function dividirEmLotes(
  registros: readonly RegistroExterno[],
  limites = { registros: LIMITE_REGISTROS_LOTE, bytes: LIMITE_BYTES_LOTE - MARGEM_BYTES },
): RegistroExterno[][] {
  const lotes: RegistroExterno[][] = [];
  let atual: RegistroExterno[] = [];
  let bytes = 0;
  for (const r of registros) {
    const t = tamanho(r) + 1;
    if (t > limites.bytes) throw new Error(`Registro ${r.chave} sozinho passa do limite do lote.`);
    if (atual.length >= limites.registros || bytes + t > limites.bytes) {
      lotes.push(atual);
      atual = [];
      bytes = 0;
    }
    atual.push(r);
    bytes += t;
  }
  if (atual.length > 0) lotes.push(atual);
  return lotes;
}

export interface Envio {
  apiUrl: string;
  credencial: string;
  fonte: Fonte;
  entidade: EntidadeExterna;
  registros: readonly RegistroExterno[];
  /** Injetável nos testes. */
  fetch?: typeof fetch;
}

export interface ResultadoDoEnvio {
  lotes: number;
  novos: number;
  repetidos: number;
}

export async function enviar(e: Envio): Promise<ResultadoDoEnvio> {
  const fazer = e.fetch ?? fetch;
  const url = `${e.apiUrl.replace(/\/+$/, '')}/api/v1/ingestao/lotes`;
  const resultado: ResultadoDoEnvio = { lotes: 0, novos: 0, repetidos: 0 };
  for (const registros of dividirEmLotes(e.registros)) {
    const resposta = await fazer(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Agent ${e.credencial}` },
      body: JSON.stringify({ fonte: e.fonte, entidade: e.entidade, registros }),
    });
    if (resposta.status !== 200 && resposta.status !== 201) {
      // O corpo de erro é código e parâmetros (F0-07); a credencial não entra na mensagem.
      const corpo = await resposta.text().catch(() => '');
      throw new Error(`Lote recusado (${resposta.status}): ${corpo.slice(0, 500)}`);
    }
    const lido = RespostaDeLote.parse(await resposta.json());
    resultado.lotes++;
    if (lido.novo) resultado.novos++;
    else resultado.repetidos++;
  }
  return resultado;
}
