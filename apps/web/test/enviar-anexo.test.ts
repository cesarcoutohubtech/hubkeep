// Envio de anexo pelo web (B4): imagem com miniatura pelo código do PWA, PDF
// como está. A preparação (canvas), a API e o Storage são substituídos.
import { describe, expect, it, vi } from 'vitest';
import type { RespostaDaApi } from '../src/cliente/api';
import { enviarAnexo } from '../src/cliente/enviar-anexo';

const ALVO = { entidade: 'ativo' as const, registroId: 'a1' };

function montar(
  opcoes: { putFalha?: boolean; prepararFalha?: boolean; registroErro?: string } = {},
) {
  const chamadas: { caminho: string; corpo: Record<string, unknown> }[] = [];
  let n = 0;
  const chamar = vi.fn(async (caminho: string, init?: RequestInit) => {
    const corpo = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
    chamadas.push({ caminho, corpo });
    if (caminho.endsWith('/url-de-upload')) {
      n += 1;
      return { ok: true, dados: { caminho: `t/h/ativo/a1/${n}`, url: `https://s/${n}` } };
    }
    return opcoes.registroErro
      ? { ok: false, erro: { codigo: opcoes.registroErro, parametros: {} } }
      : { ok: true, dados: { id: 'x' } };
  }) as unknown as <T>(caminho: string, init?: RequestInit) => Promise<RespostaDaApi<T>>;
  const puts: { url: string; tipo: string; corpo: unknown }[] = [];
  const requisitar = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const tipo = (init?.headers as Record<string, string>)['content-type'] ?? '';
    puts.push({ url: String(url), tipo, corpo: init?.body });
    return new Response(null, { status: opcoes.putFalha ? 400 : 200 });
  }) as unknown as typeof fetch;
  const foto = new Blob(['f'], { type: 'image/jpeg' });
  const miniatura = new Blob(['m'], { type: 'image/jpeg' });
  const preparar = vi.fn(async () => {
    if (opcoes.prepararFalha) throw new Error('imagem corrompida');
    return { foto, miniatura };
  });
  return { chamar, requisitar, preparar, chamadas, puts, foto, miniatura };
}

describe('enviarAnexo', () => {
  it('imagem: envia foto e miniatura em JPEG e registra os dois caminhos', async () => {
    const m = montar();
    const png = new File(['p'], 'planta.png', { type: 'image/png' });
    expect(await enviarAnexo(ALVO, png, m)).toBeNull();
    expect(m.preparar).toHaveBeenCalledWith(png);
    expect(m.puts.map((p) => [p.tipo, p.corpo])).toEqual([
      ['image/jpeg', m.foto],
      ['image/jpeg', m.miniatura],
    ]);
    expect(m.chamadas[0]?.corpo).toEqual({ ...ALVO, tipo: 'image/jpeg' });
    expect(m.chamadas.at(-1)).toEqual({
      caminho: '/api/v1/anexos',
      corpo: { caminho: 't/h/ativo/a1/1', miniaturaCaminho: 't/h/ativo/a1/2', nome: 'planta.png' },
    });
  });

  it('PDF: vai como está, sem miniatura', async () => {
    const m = montar();
    const pdf = new File(['%PDF'], 'manual.pdf', { type: 'application/pdf' });
    expect(await enviarAnexo(ALVO, pdf, m)).toBeNull();
    expect(m.preparar).not.toHaveBeenCalled();
    expect(m.puts).toEqual([{ url: 'https://s/1', tipo: 'application/pdf', corpo: pdf }]);
    expect(m.chamadas.at(-1)?.corpo).toEqual({ caminho: 't/h/ativo/a1/1', nome: 'manual.pdf' });
  });

  it('imagem que o navegador não lê: foto_ilegivel, sem nada enviado', async () => {
    const m = montar({ prepararFalha: true });
    const jpg = new File(['x'], 'x.jpg', { type: 'image/jpeg' });
    expect(await enviarAnexo(ALVO, jpg, m)).toEqual({ codigo: 'foto_ilegivel', parametros: {} });
    expect(m.chamadas).toEqual([]);
  });

  it('Storage recusa o arquivo: envio_de_arquivo_falhou, sem registro', async () => {
    const m = montar({ putFalha: true });
    const pdf = new File(['%PDF'], 'manual.pdf', { type: 'application/pdf' });
    expect(await enviarAnexo(ALVO, pdf, m)).toEqual({
      codigo: 'envio_de_arquivo_falhou',
      parametros: {},
    });
    expect(m.chamadas.map((c) => c.caminho)).toEqual(['/api/v1/anexos/url-de-upload']);
  });

  it('erro do registro volta como veio da API', async () => {
    const m = montar({ registroErro: 'anexo_ja_registrado' });
    const pdf = new File(['%PDF'], 'manual.pdf', { type: 'application/pdf' });
    expect(await enviarAnexo(ALVO, pdf, m)).toEqual({
      codigo: 'anexo_ja_registrado',
      parametros: {},
    });
  });
});
