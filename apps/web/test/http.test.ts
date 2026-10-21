// Aceite da F0-07 sem banco: formato único de erro (código e parâmetros, sem
// frase), request_id, logs com tenant_id e usuario_id, e o Sentry só para o
// que é inesperado. O contexto e o usuário são falsos; o resto é o invólucro real.
import { LIMITE_BYTES_PADRAO, PedidoDeConvite, RespostaDeConvite, z } from '@hubkeep/contratos';
import { PermissaoNegada, RegraViolada } from '@hubkeep/dominio';
import { describe, expect, it } from 'vitest';
import { ErroHttp, type Dependencias, rota } from '../src/servidor/http';
import type { CamposDeLog, Nivel } from '../src/servidor/log';

const TENANT = '10000000-0000-4000-8000-000000000001';
const USUARIO = 'aaaaaaaa-0000-4000-8000-000000000001';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function montar() {
  const logs: { nivel: Nivel; evento: string; campos: CamposDeLog }[] = [];
  const relatados: { erro: unknown; marcas: Record<string, unknown> }[] = [];
  const escopos: string[] = [];
  const deps: Dependencias = {
    resolverContexto: async () => ({ usuarioId: USUARIO, tenantId: TENANT }),
    usuarioDaRequisicao: async () => ({
      usuarioId: USUARIO,
      email: null,
      tenantsSugeridos: [],
      nivel: 'aal1' as const,
    }),
    registrar: (nivel, evento, campos) => void logs.push({ nivel, evento, campos }),
    relatar: (erro, marcas) => void relatados.push({ erro, marcas }),
    escopoDeLeitura: async (fn) => {
      escopos.push('aberto');
      try {
        return await fn();
      } finally {
        escopos.push('fechado');
      }
    },
  };
  return { deps, logs, relatados, escopos };
}

const pedir = (corpo?: unknown, cabecalhos: Record<string, string> = {}) =>
  new Request('http://127.0.0.1/api/v1/teste', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...cabecalhos },
    ...(corpo === undefined
      ? {}
      : { body: typeof corpo === 'string' ? corpo : JSON.stringify(corpo) }),
  });

const corpoDe = async (r: Response) =>
  (await r.json()) as {
    erro: { codigo: string; parametros: Record<string, unknown>; requestId: string };
  };

describe('rota(): sucesso, request_id e log', () => {
  it('responde pelo contrato, com x-request-id e uma linha de log com tenant e usuário', async () => {
    const { deps, logs } = montar();
    const post = rota(
      'teste.criar',
      async (r) => {
        await r.contexto();
        return r.responder(201, RespostaDeConvite, { usuarioId: USUARIO });
      },
      deps,
    );
    const resposta = await post(pedir());
    expect(resposta.status).toBe(201);
    const requestId = resposta.headers.get('x-request-id');
    expect(requestId).toMatch(UUID);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      nivel: 'info',
      evento: 'http',
      campos: {
        rota: 'teste.criar',
        metodo: 'POST',
        status: 201,
        request_id: requestId,
        tenant_id: TENANT,
        usuario_id: USUARIO,
      },
    });
  });

  it('reaproveita o x-request-id recebido só se for UUID', async () => {
    const { deps } = montar();
    const get = rota('teste.ler', async (r) => r.json(200, {}), deps);
    const recebido = '3f2c1d5e-8a9b-4c7d-9e0f-1a2b3c4d5e6f';
    expect(
      (await get(pedir(undefined, { 'x-request-id': recebido }))).headers.get('x-request-id'),
    ).toBe(recebido);
    const forjado = (
      await get(pedir(undefined, { 'x-request-id': 'x"} {"nivel":"error' }))
    ).headers.get('x-request-id');
    expect(forjado).toMatch(UUID);
  });
});

// M3 (docs/11): o hotel do pedido no log e no Sentry, sem cada handler lembrar.
describe('rota(): hotel_id no log e no Sentry', () => {
  const HOTEL = 'b0000000-0000-4000-8000-000000000001';
  const OUTRO = 'b0000000-0000-4000-8000-000000000002';
  const ComHotel = z.object({ hotelId: z.string() });
  const pedirEm = (caminho: string, corpo?: unknown) =>
    new Request(`http://127.0.0.1${caminho}`, {
      method: corpo === undefined ? 'GET' : 'POST',
      headers: { 'content-type': 'application/json' },
      ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) }),
    });

  it('o hotel do caminho /hoteis/{id}/...', async () => {
    const { deps, logs } = montar();
    const get = rota('teste.hotel', async (r) => r.json(200, {}), deps);
    await get(pedirEm(`/api/v1/hoteis/${HOTEL}/locais`));
    expect(logs[0]?.campos.hotel_id).toBe(HOTEL);
  });

  it('o hotelId do corpo, e o da resposta não troca o primeiro', async () => {
    const { deps, logs } = montar();
    const post = rota(
      'teste.hotel',
      async (r) => {
        const { hotelId } = await r.corpo(ComHotel);
        return r.responder(201, ComHotel, { hotelId: hotelId === HOTEL ? OUTRO : HOTEL });
      },
      deps,
    );
    await post(pedirEm('/api/v1/chamados', { hotelId: HOTEL }));
    expect(logs[0]?.campos.hotel_id).toBe(HOTEL);
  });

  it('o hotelId da query e o da resposta', async () => {
    const { deps, logs } = montar();
    const daQuery = rota(
      'teste.hotel',
      async (r) => {
        r.consulta(ComHotel);
        return r.json(200, {});
      },
      deps,
    );
    await daQuery(pedirEm(`/api/v1/os?hotelId=${HOTEL}`));
    const daResposta = rota(
      'teste.hotel',
      async (r) => r.responder(200, ComHotel, { hotelId: OUTRO }),
      deps,
    );
    await daResposta(pedirEm('/api/v1/chamados/x'));
    expect(logs.map((l) => l.campos.hotel_id)).toEqual([HOTEL, OUTRO]);
  });

  it('sem hotel no pedido, hotel_id fica nulo; marcarHotel define', async () => {
    const { deps, logs } = montar();
    const semHotel = rota('teste.hotel', async (r) => r.json(200, { itens: [] }), deps);
    await semHotel(pedirEm('/api/v1/chamados'));
    const marcado = rota(
      'teste.hotel',
      async (r) => {
        r.marcarHotel(HOTEL);
        return r.json(200, {});
      },
      deps,
    );
    await marcado(pedirEm('/api/v1/chamados'));
    expect(logs.map((l) => l.campos.hotel_id)).toEqual([null, HOTEL]);
  });

  it('o erro inesperado vai ao Sentry com o hotel', async () => {
    const { deps, relatados } = montar();
    const falha = rota(
      'teste.hotel',
      async () => {
        throw new Error('quebrou');
      },
      deps,
    );
    await falha(pedirEm(`/api/v1/hoteis/${HOTEL}/ativos`));
    expect(relatados[0]?.marcas).toMatchObject({ hotel_id: HOTEL });
  });
});

describe('rota(): formato único de erro', () => {
  it('erro de domínio: código e parâmetros, sem frase, com o mesmo request_id do cabeçalho', async () => {
    const { deps, relatados } = montar();
    const post = rota(
      'teste.criar',
      async () => {
        throw new PermissaoNegada('implantador_nao_concede_papel', 'frase que não sai', {
          papel: 'admin_grupo',
        });
      },
      deps,
    );
    const resposta = await post(pedir());
    expect(resposta.status).toBe(403);
    const corpo = await corpoDe(resposta);
    expect(corpo).toEqual({
      erro: {
        codigo: 'implantador_nao_concede_papel',
        parametros: { papel: 'admin_grupo' },
        requestId: resposta.headers.get('x-request-id'),
      },
    });
    expect(JSON.stringify(corpo)).not.toContain('frase que não sai');
    expect(relatados).toHaveLength(0);
  });

  it('regra violada vira 422 e erro HTTP mantém o status dele', async () => {
    const { deps } = montar();
    const regra = rota(
      't',
      async () => {
        throw new RegraViolada('validade_no_passado', 'x');
      },
      deps,
    );
    expect((await regra(pedir())).status).toBe(422);
    const http = rota(
      't',
      async () => {
        throw new ErroHttp(400, 'tenant_ausente', { cabecalho: 'x-hubkeep-tenant' });
      },
      deps,
    );
    const r = await http(pedir());
    expect(r.status).toBe(400);
    expect((await corpoDe(r)).erro).toMatchObject({
      codigo: 'tenant_ausente',
      parametros: { cabecalho: 'x-hubkeep-tenant' },
    });
  });

  it('entrada fora do contrato: 422 entrada_invalida com os problemas por campo', async () => {
    const { deps } = montar();
    const post = rota(
      'convites.criar',
      async (r) => r.json(200, await r.corpo(PedidoDeConvite)),
      deps,
    );
    const resposta = await post(pedir({ email: 'nao-e-email', nome: '', papel: 'rei' }));
    expect(resposta.status).toBe(422);
    const { erro } = await corpoDe(resposta);
    expect(erro.codigo).toBe('entrada_invalida');
    const problemas = erro.parametros['problemas'] as { campo: string; codigo: string }[];
    expect(problemas.map((p) => p.campo)).toEqual(['email', 'nome', 'papel']);
    expect(JSON.stringify(erro)).not.toContain('nao-e-email');
  });

  it('JSON inválido também é entrada_invalida', async () => {
    const { deps } = montar();
    const post = rota('t', async (r) => r.json(200, await r.corpo(PedidoDeConvite)), deps);
    const resposta = await post(pedir('{nao e json'));
    expect(resposta.status).toBe(422);
    expect((await corpoDe(resposta)).erro).toMatchObject({
      codigo: 'entrada_invalida',
      parametros: { motivo: 'json_invalido' },
    });
  });

  it('a RLS recusando (42501) vira 403 sem_permissao, sem Sentry', async () => {
    const { deps, relatados } = montar();
    const post = rota(
      't',
      async () => {
        throw Object.assign(new Error('new row violates row-level security'), { code: '42501' });
      },
      deps,
    );
    const resposta = await post(pedir());
    expect(resposta.status).toBe(403);
    expect((await corpoDe(resposta)).erro.codigo).toBe('sem_permissao');
    expect(relatados).toHaveLength(0);
  });
});

describe('rota(): erro inesperado', () => {
  it('500 erro_interno sem detalhe; Sentry e log de erro com request_id, tenant e usuário', async () => {
    const { deps, logs, relatados } = montar();
    const post = rota(
      'teste.criar',
      async (r) => {
        await r.contexto();
        throw new Error('detalhe interno que não sai');
      },
      deps,
    );
    const resposta = await post(pedir());
    expect(resposta.status).toBe(500);
    const corpo = await corpoDe(resposta);
    expect(corpo.erro).toMatchObject({ codigo: 'erro_interno', parametros: {} });
    expect(JSON.stringify(corpo)).not.toContain('detalhe interno');

    const requestId = resposta.headers.get('x-request-id');
    expect(relatados).toHaveLength(1);
    expect(relatados[0]?.marcas).toEqual({
      rota: 'teste.criar',
      request_id: requestId,
      tenant_id: TENANT,
      usuario_id: USUARIO,
      hotel_id: null,
    });
    expect(logs.map((l) => [l.nivel, l.evento])).toEqual([
      ['error', 'erro_inesperado'],
      ['error', 'http'],
    ]);
    expect(logs[1]?.campos).toMatchObject({
      status: 500,
      codigo: 'erro_interno',
      tenant_id: TENANT,
    });
  });

  it('resposta que não bate com o contrato é defeito: 500, e nada fora do contrato sai', async () => {
    const { deps, relatados } = montar();
    const post = rota(
      't',
      async (r) => r.responder(201, RespostaDeConvite, { usuarioId: 'nao-e-uuid' }),
      deps,
    );
    const resposta = await post(pedir());
    expect(resposta.status).toBe(500);
    expect(relatados).toHaveLength(1);
  });
});

describe('rota(): limite do corpo em toda rota (ADR-032, condição 2)', () => {
  const grande = (bytes: number) => JSON.stringify({ email: 'a@b.co', nome: 'x'.repeat(bytes) });
  const post = (deps: Dependencias, limiteBytes?: number) =>
    rota(
      't',
      async (r) =>
        r.json(200, await r.corpo(PedidoDeConvite, limiteBytes ? { limiteBytes } : undefined)),
      deps,
    );

  it('sem limite declarado, vale o padrão: 413 corpo_grande', async () => {
    const { deps } = montar();
    const resposta = await post(deps)(pedir(grande(LIMITE_BYTES_PADRAO + 1)));
    expect(resposta.status).toBe(413);
    expect((await corpoDe(resposta)).erro).toMatchObject({
      codigo: 'corpo_grande',
      parametros: { limiteBytes: LIMITE_BYTES_PADRAO },
    });
  });

  it('content-length acima do limite: 413 sem ler o corpo', async () => {
    const { deps } = montar();
    const req = pedir('{}', { 'content-length': String(LIMITE_BYTES_PADRAO + 1) });
    expect((await post(deps)(req)).status).toBe(413);
    expect(req.bodyUsed).toBe(false);
  });

  it('sem content-length, a leitura para ao passar do limite e cancela o envio', async () => {
    const { deps } = montar();
    let enviados = 0;
    let cancelado = false;
    const pedaco = new TextEncoder().encode('x'.repeat(16 * 1024));
    const fluxo = new ReadableStream<Uint8Array>({
      pull(c) {
        enviados += 1;
        c.enqueue(pedaco);
      },
      cancel() {
        cancelado = true;
      },
    });
    const req = new Request('http://127.0.0.1/api/v1/teste', {
      method: 'POST',
      body: fluxo,
      duplex: 'half',
    } as RequestInit);
    expect((await post(deps)(req)).status).toBe(413);
    expect(cancelado).toBe(true);
    expect(enviados * pedaco.byteLength).toBeLessThan(LIMITE_BYTES_PADRAO + 4 * pedaco.byteLength);
  });

  it('rota que declara limite maior aceita o corpo acima do padrão', async () => {
    const { deps } = montar();
    const resposta = await post(deps, 1024 * 1024)(pedir(grande(LIMITE_BYTES_PADRAO + 1)));
    // Passou do limite e chegou ao contrato (nome longo demais): 422, não 413.
    expect(resposta.status).toBe(422);
  });

  it('corpo UTF-8 é lido inteiro, com caractere partido entre pedaços', async () => {
    const { deps } = montar();
    const texto = JSON.stringify({ email: 'ção@b.co', nome: 'Ção', papel: 'rei' });
    const bytes = new TextEncoder().encode(texto);
    const meio = texto.indexOf('ç') + 3; // dentro do "ç" de 2 bytes
    const fluxo = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(bytes.slice(0, meio));
        c.enqueue(bytes.slice(meio));
        c.close();
      },
    });
    const req = new Request('http://127.0.0.1/api/v1/teste', {
      method: 'POST',
      body: fluxo,
      duplex: 'half',
    } as RequestInit);
    const resposta = await rota(
      't',
      async (r) => r.json(200, await r.corpo(z.object({ nome: z.string() }).loose())),
      deps,
    )(req);
    expect(await resposta.json()).toMatchObject({ nome: 'Ção' });
  });
});

describe('rota(): escopo de leitura (P1b)', () => {
  const comMetodo = (metodo: string) =>
    new Request('http://127.0.0.1/api/v1/teste', { method: metodo });

  it('GET roda o handler dentro do escopo de leitura', async () => {
    const { deps, escopos } = montar();
    const dentro: string[] = [];
    const get = rota(
      'teste.ler',
      async (r) => {
        dentro.push([...escopos].join(','));
        await r.contexto();
        return r.json(200, {});
      },
      deps,
    );
    const resposta = await get(comMetodo('GET'));
    expect(resposta.status).toBe(200);
    expect(dentro).toEqual(['aberto']);
    expect(escopos).toEqual(['aberto', 'fechado']);
  });

  it('escrita (POST, PUT, PATCH, DELETE) não entra no escopo', async () => {
    for (const metodo of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      const { deps, escopos } = montar();
      const handler = rota('teste.escrever', async (r) => r.json(200, {}), deps);
      expect((await handler(comMetodo(metodo))).status).toBe(200);
      expect(escopos).toEqual([]);
    }
  });

  it('erro no GET ainda fecha o escopo e vira o formato único de erro', async () => {
    const { deps, escopos } = montar();
    const get = rota(
      'teste.ler',
      async () => {
        throw new PermissaoNegada('sem_permissao', 'sem acesso');
      },
      deps,
    );
    const resposta = await get(comMetodo('GET'));
    expect(resposta.status).toBe(403);
    expect(escopos).toEqual(['aberto', 'fechado']);
  });
});
