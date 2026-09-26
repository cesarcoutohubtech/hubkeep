// @hubkeep/conector — agente que roda na rede do cliente, lê o sistema
// hoteleiro (somente leitura) e envia lotes por HTTPS para o HubKeep (ADR-008).
//
//   CONECTOR_API_URL        base da API do HubKeep (https://...)
//   CONECTOR_CREDENCIAL     hk_<tenant_id>_<segredo>, criada pelo Admin do grupo
//   CONECTOR_FONTE          planilha | totvs_cm
//   CONECTOR_ARQUIVO_HOTEIS CSV de hotéis (fonte planilha)
//   CONECTOR_ARQUIVO_UHS    CSV de UHs (fonte planilha)
//
// Não há, nem pode haver, variável de conexão com o banco do HubKeep.
import { pathToFileURL } from 'node:url';
import type { AdaptadorDeSistemaHoteleiro, EntidadeExterna } from '@hubkeep/contratos';
import { criarAdaptadorDePlanilha } from './adaptadores/planilha';
import { criarAdaptadorTotvs, executorTotvsNaoConfigurado } from './adaptadores/totvs';
import { enviar } from './envio';

export { lerCsv } from './csv';
export { criarAdaptadorDePlanilha, registrosDaPlanilha } from './adaptadores/planilha';
export { CONSULTAS, criarAdaptadorTotvs } from './adaptadores/totvs';
export { dividirEmLotes, enviar } from './envio';

function exigir(nome: string): string {
  const v = process.env[nome];
  if (!v) throw new Error(`${nome} não está definida.`);
  return v;
}

function adaptadorDoAmbiente(): AdaptadorDeSistemaHoteleiro {
  const fonte = process.env['CONECTOR_FONTE'] ?? 'planilha';
  if (fonte === 'planilha') {
    return criarAdaptadorDePlanilha({
      ...(process.env['CONECTOR_ARQUIVO_HOTEIS'] && {
        hotel: process.env['CONECTOR_ARQUIVO_HOTEIS'],
      }),
      ...(process.env['CONECTOR_ARQUIVO_UHS'] && { uh: process.env['CONECTOR_ARQUIVO_UHS'] }),
    });
  }
  if (fonte === 'totvs_cm') return criarAdaptadorTotvs(executorTotvsNaoConfigurado);
  throw new Error(`CONECTOR_FONTE desconhecida: ${fonte} (use planilha ou totvs_cm).`);
}

/** Uma rodada: lê hotéis e UHs e envia. A credencial nunca é impressa. */
export async function rodar(): Promise<void> {
  const apiUrl = exigir('CONECTOR_API_URL');
  const credencial = exigir('CONECTOR_CREDENCIAL');
  const adaptador = adaptadorDoAmbiente();
  for (const entidade of ['hotel', 'uh'] as const satisfies readonly EntidadeExterna[]) {
    const registros = await adaptador.ler(entidade);
    if (registros.length === 0) continue;
    const r = await enviar({ apiUrl, credencial, fonte: adaptador.fonte, entidade, registros });
    console.log(JSON.stringify({ evento: 'envio', entidade, registros: registros.length, ...r }));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  rodar().catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : 'falhou');
    process.exit(1);
  });
}
