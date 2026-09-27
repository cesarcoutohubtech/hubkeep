// Contratos da API: validação de entrada, formato de erro e OpenAPI gerado.
import { describe, expect, it } from 'vitest';
import {
  ErroApi,
  PedidoDeConvite,
  ROTAS,
  RespostaDeHoteis,
  gerarOpenApi,
  problemasDe,
} from '../src/index';

describe('PedidoDeConvite', () => {
  it('normaliza e-mail e nome', () => {
    expect(
      PedidoDeConvite.parse({ email: ' Ana@Hotel.COM ', nome: ' Ana ', papel: 'tecnico' }),
    ).toEqual({ email: 'ana@hotel.com', nome: 'Ana', papel: 'tecnico' });
  });

  it('entrada inválida vira código e parâmetros por campo, sem o valor recebido', () => {
    const r = PedidoDeConvite.safeParse({
      email: 'segredo-nao-sai',
      nome: '',
      papel: 'rei',
      hotelId: 'abc',
      validoAte: 'amanhã',
    });
    expect(r.success).toBe(false);
    if (r.success) return;
    const problemas = problemasDe(r.error);
    expect(problemas.map((p) => [p.campo, p.codigo])).toEqual([
      ['email', 'invalid_format'],
      ['nome', 'too_small'],
      ['papel', 'invalid_value'],
      ['hotelId', 'invalid_format'],
      ['validoAte', 'invalid_format'],
    ]);
    expect(problemas.find((p) => p.campo === 'nome')).toMatchObject({ minimum: 1 });
    expect(JSON.stringify(problemas)).not.toContain('segredo-nao-sai');
  });
});

describe('ErroApi', () => {
  it('não tem campo de frase', () => {
    const ok = ErroApi.safeParse({ erro: { codigo: 'x', parametros: {}, requestId: 'r' } });
    expect(ok.success).toBe(true);
    const campos = Object.keys(ErroApi.shape.erro.shape);
    expect(campos).toEqual(['codigo', 'parametros', 'requestId']);
  });
});

describe('OpenAPI', () => {
  const doc = gerarOpenApi() as {
    openapi: string;
    paths: Record<string, Record<string, { responses: Record<string, unknown> }>>;
    components: { schemas: Record<string, Record<string, unknown>> };
  };

  it('é 3.1 e tem cada rota da lista, com os erros no formato ErroApi', () => {
    expect(doc.openapi).toBe('3.1.0');
    for (const rota of ROTAS) {
      const op = doc.paths[rota.caminho]?.[rota.metodo];
      expect(op, `${rota.metodo} ${rota.caminho}`).toBeDefined();
      for (const status of Object.keys(rota.respostas).filter((s) => Number(s) >= 400)) {
        expect(JSON.stringify(op?.responses[status])).toContain('#/components/schemas/ErroApi');
      }
    }
  });

  it('os schemas referenciados existem em components, sem $schema nem $id', () => {
    const refs = [...JSON.stringify(doc).matchAll(/#\/components\/schemas\/(\w+)/g)].map(
      (m) => m[1],
    );
    for (const id of new Set(refs)) expect(doc.components.schemas[id as string], id).toBeDefined();
    for (const s of Object.values(doc.components.schemas)) {
      expect(s).not.toHaveProperty('$schema');
      expect(s).not.toHaveProperty('$id');
    }
  });

  it('a resposta de hotéis valida o que o banco devolve', () => {
    expect(
      RespostaDeHoteis.parse({
        hoteis: [
          {
            id: '11100000-0000-0000-0000-000000000001',
            nome: 'H',
            status: 'ativo',
            bandeiraId: null,
          },
        ],
      }).hoteis,
    ).toHaveLength(1);
  });
});
