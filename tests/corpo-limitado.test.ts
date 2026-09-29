// ADR-032, condição 2: toda rota que lê corpo passa pelo r.corpo() da rota(),
// que sempre aplica limite (o da rota ou LIMITE_BYTES_PADRAO). Leitura direta do
// Request (req.json(), req.text(), formData...) escaparia do limite.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function arquivos(dir: string): string[] {
  return readdirSync(dir).flatMap((nome) => {
    const caminho = join(dir, nome);
    return statSync(caminho).isDirectory() ? arquivos(caminho) : [caminho];
  });
}

const LEITURA_DIRETA = /\b(req|request)\s*\.\s*(json|text|formData|arrayBuffer|blob|bytes|body)\b/;

describe('corpo do pedido só pelo r.corpo(), com limite', () => {
  const rotas = arquivos('apps/web/src/app').filter((f) => /route\.tsx?$/.test(f));

  it('há rotas para conferir', () => {
    expect(rotas.length).toBeGreaterThan(50);
  });

  it.each(rotas)('%s não lê o Request direto', (arquivo) => {
    expect(readFileSync(arquivo, 'utf8')).not.toMatch(LEITURA_DIRETA);
  });

  it('a rota() aplica o padrão quando a rota não declara limite', () => {
    const http = readFileSync('apps/web/src/servidor/http.ts', 'utf8');
    expect(http).toContain('opcoes.limiteBytes ?? LIMITE_BYTES_PADRAO');
    expect(http.match(LEITURA_DIRETA)?.[0]).toBe('req.body');
  });
});
