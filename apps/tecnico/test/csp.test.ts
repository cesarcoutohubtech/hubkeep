// CSP do PWA (SP2): o cabeçalho do vercel.json fica preso aqui, e a política
// de conexão do build sai das URLs do ambiente.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { origemDoBuild, politicaDeConexao } from '../csp';

interface Vercel {
  headers: { source: string; headers: { key: string; value: string }[] }[];
}

const vercel = JSON.parse(
  readFileSync(fileURLToPath(new URL('../vercel.json', import.meta.url)), 'utf8'),
) as Vercel;
const cabecalho = (chave: string) =>
  vercel.headers.find((h) => h.source === '/(.*)')?.headers.find((h) => h.key === chave)?.value;

describe('cabeçalhos do vercel.json', () => {
  it('a CSP de script: só a própria origem, sem inline nem eval, e o resto da borda', () => {
    expect(cabecalho('Content-Security-Policy')).toBe(
      "script-src 'self'; worker-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'",
    );
    expect(cabecalho('Content-Security-Policy')).not.toMatch(/unsafe-inline|unsafe-eval|\*/);
  });

  it('os outros cabeçalhos de segurança seguem', () => {
    expect(cabecalho('Strict-Transport-Security')).toBe('max-age=63072000; includeSubDomains');
    expect(cabecalho('X-Content-Type-Options')).toBe('nosniff');
    expect(cabecalho('X-Frame-Options')).toBe('DENY');
    expect(cabecalho('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
    expect(cabecalho('Permissions-Policy')).toContain('camera=(self)');
  });
});

describe('política de conexão do build', () => {
  it('a própria origem, a da API e a do Supabase, só a origem de cada URL', () => {
    expect(
      politicaDeConexao({
        VITE_API_URL: 'https://app.hubkeep.com.br/',
        VITE_SUPABASE_URL: 'https://abcdefgh.supabase.co',
      }),
    ).toBe("connect-src 'self' https://app.hubkeep.com.br https://abcdefgh.supabase.co");
  });

  it('sem as variáveis, só a própria origem (o dev usa o proxy do Vite)', () => {
    expect(politicaDeConexao({})).toBe("connect-src 'self'");
    expect(politicaDeConexao({ VITE_API_URL: '' })).toBe("connect-src 'self'");
  });

  it('recusa URL inválida e http fora do próprio aparelho', () => {
    expect(() => origemDoBuild('VITE_API_URL', 'app.hubkeep.com.br')).toThrow(/não é uma URL/);
    expect(() => origemDoBuild('VITE_API_URL', 'http://app.hubkeep.com.br')).toThrow(/https/);
    expect(origemDoBuild('VITE_API_URL', 'http://localhost:3000/api')).toBe(
      'http://localhost:3000',
    );
  });
});
