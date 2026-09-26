// OpenAPI 3.1 da API /api/v1, gerado dos schemas Zod (F0-07). A lista de rotas
// abaixo é a fonte: rota nova entra aqui junto com o handler, e o teste do
// pacote confere que cada schema de corpo e de resposta está no documento.
import { z } from 'zod';
import { PedidoDeConvite, RespostaDeConvite, RespostaDeHoteis, RespostaDeSessao } from './api';
import { ErroApi } from './erro';

type Esquema = z.ZodType;

export interface Rota {
  metodo: 'get' | 'post';
  caminho: string;
  resumo: string;
  /** Rota que precisa do tenant ativo (cabeçalho x-hubkeep-tenant ou cookie). */
  exigeTenant: boolean;
  corpo?: Esquema;
  respostas: Record<number, { descricao: string; esquema?: Esquema }>;
}

const ERRO = (descricao: string) => ({ descricao, esquema: ErroApi });

export const ROTAS: readonly Rota[] = [
  {
    metodo: 'get',
    caminho: '/api/v1/sessao',
    resumo: 'Usuário do token verificado e tenants sugeridos.',
    exigeTenant: false,
    respostas: {
      200: { descricao: 'Sessão', esquema: RespostaDeSessao },
      401: ERRO('Sem sessão ou token inválido (nao_autenticado).'),
    },
  },
  {
    metodo: 'get',
    caminho: '/api/v1/hoteis',
    resumo: 'Hotéis visíveis ao usuário no tenant ativo (recorte da RLS).',
    exigeTenant: true,
    respostas: {
      200: { descricao: 'Hotéis visíveis', esquema: RespostaDeHoteis },
      400: ERRO('Tenant não informado (tenant_ausente).'),
      401: ERRO('Sem sessão ou token inválido (nao_autenticado).'),
    },
  },
  {
    metodo: 'post',
    caminho: '/api/v1/convites',
    resumo: 'Convida uma pessoa para o tenant ativo (ADR-014, ADR-018).',
    exigeTenant: true,
    corpo: PedidoDeConvite,
    respostas: {
      201: { descricao: 'Acesso gravado; o e-mail sai pelo worker', esquema: RespostaDeConvite },
      400: ERRO('Tenant não informado (tenant_ausente).'),
      401: ERRO('Sem sessão ou token inválido (nao_autenticado).'),
      403: ERRO('Quem convida não pode conceder este papel (código do domínio).'),
      404: ERRO('Escopo do convite não visível a quem convida (escopo_nao_encontrado).'),
      409: ERRO('A pessoa já é membro do tenant (ja_e_membro).'),
      422: ERRO('Entrada inválida (entrada_invalida) ou regra do domínio violada.'),
    },
  },
];

const referencia = (id: string) => ({ $ref: `#/components/schemas/${id}` });

/** Id do schema registrado com .meta({ id }). Todo schema da lista tem um. */
function idDe(esquema: Esquema): string {
  const id = z.globalRegistry.get(esquema)?.id;
  if (!id) throw new Error('Schema do contrato sem .meta({ id }).');
  return id;
}

export function gerarOpenApi(): Record<string, unknown> {
  // Os schemas vão para components; entrada e saída usam a forma de entrada
  // do Zod (o que o cliente manda), que aqui coincide com a de saída.
  const gerados = z.toJSONSchema(z.globalRegistry, {
    io: 'input',
    uri: (id) => `#/components/schemas/${id}`,
  }).schemas;
  // Em components, o nome já identifica o schema: sai o $schema e o $id do Zod.
  const schemas: Record<string, Record<string, unknown>> = {};
  for (const [id, gerado] of Object.entries(gerados)) {
    const copia: Record<string, unknown> = { ...gerado };
    delete copia['$schema'];
    delete copia['$id'];
    schemas[id] = copia;
  }

  const paths: Record<string, Record<string, unknown>> = {};
  for (const rota of ROTAS) {
    const respostas: Record<string, unknown> = {};
    for (const [status, r] of Object.entries(rota.respostas)) {
      respostas[status] = {
        description: r.descricao,
        ...(r.esquema && {
          content: { 'application/json': { schema: referencia(idDe(r.esquema)) } },
        }),
      };
    }
    (paths[rota.caminho] ??= {})[rota.metodo] = {
      summary: rota.resumo,
      ...(rota.exigeTenant && { parameters: [{ $ref: '#/components/parameters/Tenant' }] }),
      ...(rota.corpo && {
        requestBody: {
          required: true,
          content: { 'application/json': { schema: referencia(idDe(rota.corpo)) } },
        },
      }),
      responses: respostas,
    };
  }

  return {
    openapi: '3.1.0',
    info: {
      title: 'HubKeep API',
      version: 'v1',
      description:
        'Erros sempre no formato ErroApi: código e parâmetros, sem frase (ADR-022). ' +
        'Toda resposta traz x-request-id.',
    },
    security: [{ bearer: [] }, { cookie: [] }],
    paths,
    components: {
      schemas,
      parameters: {
        Tenant: {
          name: 'x-hubkeep-tenant',
          in: 'header',
          required: false,
          description: 'Tenant ativo (alternativa ao cookie hk_tenant).',
          schema: { type: 'string', format: 'uuid' },
        },
      },
      securitySchemes: {
        bearer: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        cookie: { type: 'apiKey', in: 'cookie', name: 'sb-<ref>-auth-token' },
      },
    },
  };
}
