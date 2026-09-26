// Formato único de erro da API /api/v1 (F0-07, ADR-022).
//
//   { "erro": { "codigo": "...", "parametros": { ... }, "requestId": "..." } }
//
// Nunca há frase: quem exibe traduz o código pelo catálogo, com os parâmetros.
// O requestId é o mesmo do cabeçalho x-request-id e das linhas de log.
import { z } from 'zod';

export const ErroApi = z
  .object({
    erro: z.object({
      codigo: z.string(),
      parametros: z.record(z.string(), z.unknown()),
      requestId: z.string(),
    }),
  })
  .meta({ id: 'ErroApi', description: 'Erro da API: código estável e parâmetros, sem frase.' });
export type ErroApi = z.infer<typeof ErroApi>;

/** Códigos gerais da camada HTTP. Os de regra vêm do domínio. */
export const CODIGOS_HTTP = {
  entradaInvalida: 'entrada_invalida',
  corpoGrande: 'corpo_grande',
  naoAutenticado: 'nao_autenticado',
  tenantAusente: 'tenant_ausente',
  semPermissao: 'sem_permissao',
  integridade: 'recusado_pela_integridade',
  erroInterno: 'erro_interno',
} as const;

/** Um problema de validação, pronto para a tela traduzir campo a campo. */
export interface ProblemaDeEntrada {
  campo: string;
  codigo: string;
  [parametro: string]: string | number | boolean | null;
}

/**
 * Converte os problemas do Zod em código e parâmetros. Só passam os limites
 * que a mensagem traduzida usa (mínimo, máximo, formato, valores aceitos),
 * nunca o valor recebido: ele pode ser grande ou sensível.
 */
export function problemasDe(erro: z.ZodError): ProblemaDeEntrada[] {
  return erro.issues.map((issue) => {
    const problema: ProblemaDeEntrada = { campo: issue.path.join('.'), codigo: issue.code };
    const extra = issue as unknown as Record<string, unknown>;
    for (const chave of ['minimum', 'maximum', 'format', 'expected', 'origin']) {
      const v = extra[chave];
      if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
        problema[chave] = v;
      }
    }
    if (Array.isArray(extra['values'])) problema['valores'] = extra['values'].join(',');
    return problema;
  });
}
