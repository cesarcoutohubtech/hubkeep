// Leitura no servidor para uma página do painel (P1c). É o equivalente do
// rota() do http.ts para o Server Component:
//   - contexto pelo mesmo caminho da API (resolverContexto: token do cookie de
//     sessão verificado pelo JWKS, tenant do cookie hk_tenant);
//   - leituras num escopo de leitura (P1b): uma transação para a página;
//   - erros classificados como a API os responde (falhaDe), só código e
//     parâmetros; o inesperado vai para o log e para o Sentry;
//   - uma linha de log por página, com duração, tenant e usuário.
//
// Sem sessão ou sem grupo escolhido (primeiro acesso), a página não decide
// nada: devolve `sem_contexto` e a tela carrega pela API, como antes. A
// moldura cuida do login e da escolha do grupo.
import type { Contexto } from '@hubkeep/db';
import { emEscopoDeLeitura } from '@hubkeep/db';
import { headers } from 'next/headers';
import { resolverContexto } from './contexto';
import { ErroHttp } from './erro-http';
import { falhaDe } from './http';
import { type Registrador, registrarNoConsole } from './log';
import { type Relator, relatarAoSentry } from './sentry';

export interface ErroDaPagina {
  codigo: string;
  parametros: Record<string, unknown>;
}

export type CargaDaPagina<T> =
  | { tipo: 'ok'; dados: T }
  | { tipo: 'sem_contexto' }
  | { tipo: 'nao_encontrado' }
  | { tipo: 'erro'; erro: ErroDaPagina };

export interface DependenciasDaPagina {
  /** A requisição da página (cabeçalhos e cookies), para resolver o contexto. */
  requisicao: () => Promise<Request>;
  resolverContexto: (req: Request) => Promise<Contexto>;
  escopoDeLeitura: <T>(fn: () => Promise<T>) => Promise<T>;
  registrar: Registrador;
  relatar: Relator;
}

/** A requisição da página, montada dos cabeçalhos que o proxy deixou (cookie renovado incluso). */
async function requisicaoDaPagina(): Promise<Request> {
  return new Request('http://pagina.interna/', { headers: await headers() });
}

const PADRAO: DependenciasDaPagina = {
  requisicao: requisicaoDaPagina,
  resolverContexto,
  escopoDeLeitura: emEscopoDeLeitura,
  registrar: registrarNoConsole,
  relatar: relatarAoSentry,
};

/** Quem ainda não tem sessão ou grupo: a tela segue pelo caminho do cliente. */
const semContexto = (e: unknown) =>
  e instanceof ErroHttp && (e.status === 401 || e.codigo === 'tenant_ausente');

/**
 * Carrega os dados iniciais de uma página. `nome` identifica a página no log
 * (ex.: 'pagina.chamado'). `ler` recebe o contexto e um `registrarErro` para
 * leitura complementar que falhou sem derrubar a página.
 */
export async function carregarNaPagina<T>(
  nome: string,
  ler: (ctx: Contexto, registrarErro: (erro: unknown) => void) => Promise<T>,
  deps: Partial<DependenciasDaPagina> = {},
): Promise<CargaDaPagina<T>> {
  const d: DependenciasDaPagina = { ...PADRAO, ...deps };
  const inicio = performance.now();
  const requestId = crypto.randomUUID();
  const escopo: { tenant_id: string | null; usuario_id: string | null } = {
    tenant_id: null,
    usuario_id: null,
  };
  const relatar = (erro: unknown, evento: string) => {
    const marcas = { rota: nome, request_id: requestId, ...escopo };
    d.relatar(erro, marcas);
    d.registrar('error', evento, {
      ...marcas,
      erro: erro instanceof Error ? { nome: erro.name, mensagem: erro.message } : String(erro),
    });
  };
  const registrarErro = (erro: unknown) => {
    if (falhaDe(erro).inesperada) relatar(erro, 'erro_tratado');
  };

  let carga: CargaDaPagina<T>;
  let authMs = 0;
  let inesperada = false;
  try {
    const comecoAuth = performance.now();
    let ctx: Contexto;
    try {
      ctx = await d.resolverContexto(await d.requisicao());
    } finally {
      authMs = performance.now() - comecoAuth;
    }
    escopo.tenant_id = ctx.tenantId;
    escopo.usuario_id = ctx.usuarioId;
    carga = { tipo: 'ok', dados: await d.escopoDeLeitura(() => ler(ctx, registrarErro)) };
  } catch (e) {
    if (semContexto(e)) {
      carga = { tipo: 'sem_contexto' };
    } else {
      const falha = falhaDe(e);
      inesperada = falha.inesperada;
      if (inesperada) relatar(e, 'erro_inesperado');
      carga =
        falha.status === 404
          ? { tipo: 'nao_encontrado' }
          : { tipo: 'erro', erro: { codigo: falha.codigo, parametros: falha.parametros } };
    }
  }

  d.registrar(inesperada ? 'error' : 'info', 'pagina', {
    rota: nome,
    resultado: carga.tipo,
    duracao_ms: Math.round(performance.now() - inicio),
    auth_ms: Math.round(authMs),
    request_id: requestId,
    ...escopo,
  });
  return carga;
}
