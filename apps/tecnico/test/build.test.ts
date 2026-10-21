// Aceite da F0-11 e da parte que ficou da F0-10b: o build de verdade (vite
// build) sai instalável e com a casca offline, e os quatro catálogos vão no
// build junto com o app.
//   - manifesto: nome do catálogo, start_url, display standalone, ícones 192 e
//     512 (e maskable) — o que Android e iOS pedem para instalar;
//   - service worker com a casca no precache (HTML, JS, CSS e ícones), para
//     abrir sem rede, e sem nada da API;
//   - JS com o texto dos quatro idiomas;
//   - as fontes do @hubkeep/ui no build e no precache, sem pedido a servidor
//     de fora, e o tema claro já no HTML (ADR-038, U5).
import { existsSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { beforeAll, describe, expect, it } from 'vitest';
import en from '../../../packages/i18n/catalogos/en.json' with { type: 'json' };
import es from '../../../packages/i18n/catalogos/es.json' with { type: 'json' };
import fr from '../../../packages/i18n/catalogos/fr.json' with { type: 'json' };
import pt from '../../../packages/i18n/catalogos/pt-BR.json' with { type: 'json' };

const raiz = fileURLToPath(new URL('..', import.meta.url));
const saida = mkdtempSync(join(tmpdir(), 'hubkeep-tecnico-'));
const ler = (arquivo: string) => readFileSync(join(saida, arquivo), 'utf8');

interface Manifesto {
  name: string;
  short_name: string;
  description: string;
  start_url: string;
  display: string;
  icons: { src: string; sizes: string; purpose?: string }[];
}

beforeAll(async () => {
  await build({ root: raiz, logLevel: 'silent', build: { outDir: saida, emptyOutDir: true } });
}, 120_000);

describe('build do PWA', () => {
  it('manifesto instalável, com nome e descrição do catálogo', () => {
    const m = JSON.parse(ler('manifest.webmanifest')) as Manifesto;
    expect(m).toMatchObject({
      name: pt['tecnico.nome'],
      short_name: pt['app.nome'],
      description: pt['tecnico.descricao'],
      start_url: '/',
      display: 'standalone',
    });
    expect(m.icons.map((i) => i.sizes)).toEqual(expect.arrayContaining(['192x192', '512x512']));
    expect(m.icons.some((i) => i.purpose === 'maskable')).toBe(true);
    for (const i of m.icons) expect(existsSync(join(saida, i.src)), i.src).toBe(true);
  });

  it('iOS: apple-touch-icon e modo standalone no HTML, e o título do catálogo', () => {
    const html = ler('index.html');
    expect(html).toContain('rel="apple-touch-icon"');
    expect(existsSync(join(saida, 'icones/apple-touch-icon.png'))).toBe(true);
    expect(html).toContain('name="apple-mobile-web-app-capable"');
    expect(html).toContain(`<title>${pt['tecnico.nome']}</title>`);
    expect(html).toContain('rel="manifest"');
  });

  it('service worker com a casca offline no precache, sem a API', () => {
    const sw = ler('sw.js');
    expect(sw).toContain('index.html');
    const js = readdirSync(join(saida, 'assets')).filter((f) => f.endsWith('.js'));
    for (const f of js) expect(sw, f).toContain(`assets/${f}`);
    expect(sw).toMatch(/NavigationRoute/);
    expect(sw).not.toMatch(/api\/v1/);
  });

  it('o push (1c, C4): o sw.js importa o push-sw.js, que vai no build', () => {
    expect(ler('sw.js')).toMatch(/importScripts\(["']push-sw\.js["']\)/);
    const push = ler('push-sw.js');
    expect(push).toContain("addEventListener('push'");
    expect(push).toContain("addEventListener('notificationclick'");
  });

  it('os quatro catálogos vão no build', () => {
    const js = readdirSync(join(saida, 'assets'))
      .filter((f) => f.endsWith('.js'))
      .map((f) => ler(`assets/${f}`))
      .join('\n');
    for (const catalogo of [pt, en, es, fr]) {
      expect(js).toContain(JSON.stringify(catalogo['tecnico.fila.titulo']).slice(1, -1));
      expect(js).toContain(JSON.stringify(catalogo['tecnico.fila.vazia']).slice(1, -1));
    }
  });

  it('fontes do próprio sistema no precache e tema claro no HTML (ADR-038)', () => {
    const assets = readdirSync(join(saida, 'assets'));
    const fontes = assets.filter((f) => f.endsWith('.woff2'));
    expect(fontes.some((f) => f.startsWith('barlow-latin-400'))).toBe(true);
    expect(fontes.some((f) => f.startsWith('barlow-condensed-latin-600'))).toBe(true);
    const sw = ler('sw.js');
    for (const f of fontes) expect(sw, f).toContain(`assets/${f}`);
    const css = assets
      .filter((f) => f.endsWith('.css'))
      .map((f) => ler(`assets/${f}`))
      .join('\n');
    expect(css).toContain('--hk-fundo');
    expect(css).not.toMatch(/fonts\.googleapis|fonts\.gstatic|url\(https?:/);
    expect(ler('index.html')).toContain('<html lang="pt-BR" data-tema="claro">');
  });
});
