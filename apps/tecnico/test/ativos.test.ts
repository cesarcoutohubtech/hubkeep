// B3b (fase 1a): cadastro e alteração de ativo no aparelho.
//   - a referência (hotéis, locais, categorias e ativos) fica guardada por
//     usuário e tenant, e sair apaga só a de quem sai (ADR-025, ajuste (b));
//   - lerReferencia monta a referência pelos contratos e devolve null em erro;
//   - ativo.cadastrar sai da fila no contrato, e a alteração com versão velha
//     volta como rejeitada com conflito_de_versao, até o técnico dispensar
//     (ADR-029).
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';
import { criarEnvio, lerReferencia } from '../src/api';
import { type FilaDeOperacoes, abrirFila } from '../src/fila/banco';
import { sincronizar } from '../src/fila/sincronizar';
import {
  type Referencia,
  type ReferenciaDoAparelho,
  abrirReferencia,
} from '../src/referencia/banco';
import { apagarDadosLocais } from '../src/saida';

const A = 'aaaaaaaa-0000-4000-8000-000000000001';
const B = 'bbbbbbbb-0000-4000-8000-000000000002';
const TENANT = 'cccccccc-0000-4000-8000-000000000003';
const H1 = '11111111-0000-4000-8000-000000000001';
const L1 = '22222222-0000-4000-8000-000000000001';
const ATIVO = '33333333-0000-4000-8000-000000000001';
const CAT = '44444444-0000-4000-8000-000000000001';

const sessaoDe = (usuarioId: string) => ({
  usuarioId: () => usuarioId,
  token: async () => `token-${usuarioId}`,
  tenant: () => TENANT,
});

const referenciaDe = (usuarioId: string, tenantId = TENANT): Referencia => ({
  usuarioId,
  tenantId,
  hoteis: [{ id: H1, nome: 'Hotel 1' }],
  locais: { [H1]: [{ id: L1, nome: 'UH 101', status: 'ativo' }] },
  ativos: { [H1]: [] },
  idiomaPadrao: 'pt-BR',
  categorias: [],
  lidaEm: 1_000,
});

const gravacao = {
  categoriaId: null,
  nome: 'Frigobar',
  fabricante: null,
  modelo: null,
  numeroSerie: null,
  campos: {},
};

const json = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status });

let fila: FilaDeOperacoes;
let referencia: ReferenciaDoAparelho;
beforeEach(async () => {
  globalThis.indexedDB = new IDBFactory();
  fila = await abrirFila();
  referencia = await abrirReferencia();
});

describe('referência no aparelho', () => {
  it('é do usuário e do tenant em que foi lida', async () => {
    await referencia.gravar(referenciaDe(A));
    expect((await referencia.ler(A, TENANT))?.hoteis).toEqual([{ id: H1, nome: 'Hotel 1' }]);
    expect(await referencia.ler(A, 'outro-tenant')).toBeNull();
    expect(await referencia.ler(B, TENANT)).toBeNull();
  });

  it('sair apaga a referência de quem sai; a de outra pessoa fica', async () => {
    await referencia.gravar(referenciaDe(A));
    await referencia.gravar(referenciaDe(B));
    await apagarDadosLocais(fila, A, { removeItem: () => undefined }, referencia);
    expect(await referencia.ler(A, TENANT)).toBeNull();
    expect(await referencia.ler(B, TENANT)).not.toBeNull();
    referencia.fechar();
    expect(await (await abrirReferencia()).ler(A, TENANT)).toBeNull();
  });

  it('lerReferencia monta pelos contratos; erro em qualquer leitura dá null', async () => {
    const respostas: Record<string, unknown> = {
      '/api/v1/hoteis': {
        hoteis: [{ id: H1, nome: 'Hotel 1', status: 'ativo', bandeiraId: null }],
      },
      '/api/v1/categorias-de-ativo': { idiomaPadrao: 'es', categorias: [] },
      [`/api/v1/hoteis/${H1}/locais`]: {
        locais: [
          {
            id: L1,
            nome: 'UH 101',
            tipo: 'uh',
            andar: '1',
            status: 'ativo',
            origem: 'sistema_hoteleiro',
            editavel: false,
          },
        ],
      },
      [`/api/v1/hoteis/${H1}/ativos`]: {
        ativos: [
          {
            id: ATIVO,
            localId: L1,
            categoriaId: null,
            nome: 'Frigobar',
            fabricante: null,
            modelo: null,
            numeroSerie: null,
            campos: {},
            versao: 3,
            ativo: true,
          },
        ],
      },
    };
    const fetchFalso: typeof fetch = async (url) => {
      const caminho = String(url);
      return caminho in respostas ? json(respostas[caminho]) : json({}, 404);
    };
    const r = await lerReferencia(sessaoDe(A), fetchFalso);
    expect(r).toMatchObject({
      usuarioId: A,
      tenantId: TENANT,
      idiomaPadrao: 'es',
      locais: { [H1]: [{ id: L1, nome: 'UH 101', status: 'ativo' }] },
      ativos: { [H1]: [{ id: ATIVO, versao: 3 }] },
    });
    const semAtivos: typeof fetch = async (url, init) =>
      String(url).endsWith('/ativos') ? json({}, 500) : fetchFalso(url, init);
    expect(await lerReferencia(sessaoDe(A), semAtivos)).toBeNull();
  });
});

describe('operações de ativo na fila', () => {
  it('ativo.cadastrar sai no contrato; alteração com versão velha volta rejeitada', async () => {
    const recebidas: { tipo: string; dados: Record<string, unknown> }[] = [];
    const fetchFalso: typeof fetch = async (_url, init) => {
      const corpo = JSON.parse(String(init?.body)) as {
        chave: string;
        tipo: string;
        dados: Record<string, unknown>;
      };
      recebidas.push(corpo);
      if (corpo.tipo === 'ativo.alterar' && corpo.dados.versao !== 2) {
        return json(
          { erro: { codigo: 'conflito_de_versao', parametros: { versaoAtual: 2 } } },
          409,
        );
      }
      return json({ chave: corpo.chave, repetida: false, resposta: { id: ATIVO, versao: 1 } }, 201);
    };
    const enviar = criarEnvio(sessaoDe(A), fetchFalso);
    await fila.enfileirar(
      { usuarioId: A, tipo: 'ativo.cadastrar', dados: { localId: L1, ...gravacao } },
      1_000,
    );
    const alteracao = await fila.enfileirar(
      {
        usuarioId: A,
        tipo: 'ativo.alterar',
        dados: {
          ativoId: ATIVO,
          versao: 1,
          ...gravacao,
          categoriaId: CAT,
          campos: { potencia: 1 },
        },
      },
      1_001,
    );
    await sincronizar(fila, enviar, { usuarioId: A });
    expect(recebidas.map((r) => r.tipo)).toEqual(['ativo.cadastrar', 'ativo.alterar']);
    expect(recebidas[0]?.dados).toMatchObject({ localId: L1, nome: 'Frigobar' });
    expect(await fila.doUsuario(A)).toMatchObject([
      { chave: alteracao.chave, estado: 'rejeitada', ultimoErro: 'conflito_de_versao' },
    ]);
  });
});
