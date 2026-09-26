// Anexos (F0-10) com portas em memória: escopo antes de qualquer URL, caminho
// calculado aqui, download conferido de novo e 404 para tudo fora do escopo.
import { type Contexto, NaoEncontrado, PermissaoNegada, RegraViolada } from '@hubkeep/dominio';
import { describe, expect, it } from 'vitest';
import { criarCasosDeUsoDeAnexos } from '../src/index';

const TENANT = '10000000-0000-4000-8000-000000000001';
const HOTEL = '11100000-0000-4000-8000-000000000001';
const OUTRO_HOTEL = '11100000-0000-4000-8000-000000000002';
const LOCAL = '11110000-0000-4000-8000-000000000001';
const ID = '01939a6e-0000-7000-8000-000000000001';
const ctx: Contexto = { usuarioId: 'u', tenantId: TENANT };
const AGORA = new Date('2026-09-26T12:00:00Z');

function montar(opcoes: { hotel?: string | null; escreve?: boolean; le?: boolean }) {
  const emitidas: string[] = [];
  const casos = criarCasosDeUsoDeAnexos({
    relogio: { agora: () => AGORA },
    novoId: () => ID,
    escopo: {
      hotelDoRegistro: async () => (opcoes.hotel === undefined ? HOTEL : opcoes.hotel),
      escreveNoHotel: async () => opcoes.escreve ?? true,
      leNoHotel: async () => opcoes.le ?? true,
    },
    armazenamento: {
      urlDeUpload: async (c) => {
        emitidas.push(`upload:${c}`);
        return { url: `https://storage/upload/${c}`, token: 't' };
      },
      urlDeDownload: async (c, s) => {
        emitidas.push(`download:${c}:${s}`);
        return `https://storage/download/${c}`;
      },
    },
  });
  return { casos, emitidas };
}

const CAMINHO = `${TENANT}/${HOTEL}/local/${LOCAL}/${ID}.jpg`;

describe('URL de upload', () => {
  it('caminho calculado aqui: tenant/hotel/entidade/registro/id.ext', async () => {
    const { casos, emitidas } = montar({});
    const r = await casos.pedirUrlDeUpload(ctx, {
      entidade: 'local',
      registroId: LOCAL,
      tipo: 'image/jpeg',
    });
    expect(r.caminho).toBe(CAMINHO);
    expect(r.expiraEm.getTime() - AGORA.getTime()).toBe(2 * 60 * 60 * 1000);
    expect(emitidas).toEqual([`upload:${CAMINHO}`]);
  });

  it('registro fora do escopo (a RLS não mostra): 404, sem URL', async () => {
    const { casos, emitidas } = montar({ hotel: null });
    await expect(
      casos.pedirUrlDeUpload(ctx, { entidade: 'local', registroId: LOCAL, tipo: 'image/png' }),
    ).rejects.toBeInstanceOf(NaoEncontrado);
    expect(emitidas).toEqual([]);
  });

  it('quem só lê o hotel (ex.: proprietário) não anexa: 403, sem URL', async () => {
    const { casos, emitidas } = montar({ escreve: false });
    await expect(
      casos.pedirUrlDeUpload(ctx, { entidade: 'local', registroId: LOCAL, tipo: 'image/png' }),
    ).rejects.toBeInstanceOf(PermissaoNegada);
    expect(emitidas).toEqual([]);
  });

  it('tipo fora da lista: 422, antes de olhar o escopo', async () => {
    const { casos, emitidas } = montar({});
    await expect(
      casos.pedirUrlDeUpload(ctx, { entidade: 'local', registroId: LOCAL, tipo: 'text/html' }),
    ).rejects.toBeInstanceOf(RegraViolada);
    expect(emitidas).toEqual([]);
  });
});

describe('URL de download', () => {
  it('caminho do próprio escopo: URL de 5 minutos', async () => {
    const { casos, emitidas } = montar({});
    const r = await casos.pedirUrlDeDownload(ctx, CAMINHO);
    expect(r.expiraEm.getTime() - AGORA.getTime()).toBe(300 * 1000);
    expect(emitidas).toEqual([`download:${CAMINHO}:300`]);
  });

  it.each([
    [
      'caminho de outro tenant',
      CAMINHO.replace(TENANT, '20000000-0000-4000-8000-000000000001'),
      {},
    ],
    ['hotel que o usuário não lê', CAMINHO, { le: false }],
    ['registro que não é daquele hotel', CAMINHO, { hotel: OUTRO_HOTEL }],
    ['registro que o usuário não enxerga', CAMINHO, { hotel: null }],
    ['caminho fora do formato', '../../outro/arquivo.jpg', {}],
    ['entidade sem anexo', CAMINHO.replace('/local/', '/membro/'), {}],
  ] as const)('%s: 404, sem URL', async (_n, caminho, opcoes) => {
    const { casos, emitidas } = montar(opcoes);
    await expect(casos.pedirUrlDeDownload(ctx, caminho)).rejects.toBeInstanceOf(NaoEncontrado);
    expect(emitidas).toEqual([]);
  });
});
