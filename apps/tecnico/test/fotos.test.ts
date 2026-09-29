// Fotos do ativo pelo PWA (B4): a foto e a miniatura preparadas no aparelho vão
// direto ao Storage (PUT na URL assinada) e o anexo é registrado com os dois
// caminhos. Falha de envio, de leitura da foto ou recusa da API volta como
// código, sem registrar nada pela metade.
import { describe, expect, it } from 'vitest';
import type { Credenciais } from '../src/api';
import { criarFotos } from '../src/anexos/fotos';

const ATIVO = 'a1000000-0000-4000-8000-000000000001';
const credenciais: Credenciais = {
  usuarioId: () => 'u',
  token: async () => 'token',
  tenant: () => 't',
};
const preparar = async () => ({
  foto: new Blob(['foto'], { type: 'image/jpeg' }),
  miniatura: new Blob(['mini'], { type: 'image/jpeg' }),
});

function servidor(opcoes: { falharPut?: number; recusarRegistro?: string } = {}) {
  const chamadas: { metodo: string; url: string; corpo?: unknown }[] = [];
  let uploads = 0;
  let puts = 0;
  const json = (status: number, dados: unknown) =>
    new Response(JSON.stringify(dados), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  const requisitar: typeof fetch = async (entrada, init) => {
    const url = String(entrada);
    const metodo = init?.method ?? 'GET';
    const corpo = typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined;
    chamadas.push({ metodo, url, corpo });
    if (url.endsWith('/api/v1/anexos/url-de-upload')) {
      uploads += 1;
      return json(200, {
        caminho: `t/h/ativo/${ATIVO}/${uploads}.jpg`,
        url: `https://storage/upload/${uploads}`,
        token: 'x',
        expiraEm: '2026-09-28T12:00:00.000Z',
      });
    }
    if (url.startsWith('https://storage/upload/')) {
      puts += 1;
      return new Response(null, { status: puts === opcoes.falharPut ? 400 : 200 });
    }
    if (url.endsWith('/api/v1/anexos')) {
      return opcoes.recusarRegistro
        ? json(422, { erro: { codigo: opcoes.recusarRegistro, parametros: {} } })
        : json(201, { id: 'b1000000-0000-4000-8000-000000000001' });
    }
    return json(404, { erro: { codigo: 'nao_encontrado', parametros: {} } });
  };
  return { chamadas, requisitar };
}

describe('fotos do ativo (B4)', () => {
  it('sobe a foto e a miniatura e registra os dois caminhos', async () => {
    const { chamadas, requisitar } = servidor();
    const fotos = criarFotos(credenciais, { preparar, requisitar });
    expect(await fotos.enviar(ATIVO, new Blob(['x']), 'frigobar.jpg')).toEqual({ tipo: 'ok' });
    expect(chamadas.map((c) => `${c.metodo} ${c.url.replace(/^https?:\/\/[^/]+/, '')}`)).toEqual([
      'POST /api/v1/anexos/url-de-upload',
      'PUT /upload/1',
      'POST /api/v1/anexos/url-de-upload',
      'PUT /upload/2',
      'POST /api/v1/anexos',
    ]);
    expect(chamadas[0]?.corpo).toEqual({
      entidade: 'ativo',
      registroId: ATIVO,
      tipo: 'image/jpeg',
    });
    expect(chamadas.at(-1)?.corpo).toEqual({
      caminho: `t/h/ativo/${ATIVO}/1.jpg`,
      miniaturaCaminho: `t/h/ativo/${ATIVO}/2.jpg`,
      nome: 'frigobar.jpg',
    });
  });

  it('envio ao Storage recusado: código, sem registrar', async () => {
    const { chamadas, requisitar } = servidor({ falharPut: 2 });
    const fotos = criarFotos(credenciais, { preparar, requisitar });
    expect(await fotos.enviar(ATIVO, new Blob(['x']), null)).toEqual({
      tipo: 'erro',
      codigo: 'envio_de_arquivo_falhou',
    });
    expect(chamadas.some((c) => c.url.endsWith('/api/v1/anexos'))).toBe(false);
  });

  it('recusa da API no registro volta com o código dela', async () => {
    const { requisitar } = servidor({ recusarRegistro: 'anexo_sem_escrita_no_hotel' });
    const fotos = criarFotos(credenciais, { preparar, requisitar });
    expect(await fotos.enviar(ATIVO, new Blob(['x']), null)).toEqual({
      tipo: 'erro',
      codigo: 'anexo_sem_escrita_no_hotel',
    });
  });

  it('foto que o aparelho não consegue ler: código, sem chamar a API', async () => {
    const { chamadas, requisitar } = servidor();
    const fotos = criarFotos(credenciais, {
      preparar: async () => {
        throw new Error('imagem corrompida');
      },
      requisitar,
    });
    expect(await fotos.enviar(ATIVO, new Blob(['x']), null)).toEqual({
      tipo: 'erro',
      codigo: 'foto_ilegivel',
    });
    expect(chamadas).toEqual([]);
  });

  it('sem sessão: não chama nada', async () => {
    const { chamadas, requisitar } = servidor();
    const fotos = criarFotos({ ...credenciais, token: async () => null }, { preparar, requisitar });
    expect(await fotos.enviar(ATIVO, new Blob(['x']), null)).toEqual({
      tipo: 'erro',
      codigo: 'nao_autenticado',
    });
    expect(chamadas).toEqual([]);
    expect(await fotos.listar(ATIVO)).toBeNull();
  });
});
