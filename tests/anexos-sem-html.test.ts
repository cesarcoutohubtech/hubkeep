// S1 (ADR-032): nenhum tipo de anexo que o navegador execute. SVG, HTML e XML
// rodam script quando abertos; o bucket e a API aceitam só foto (JPEG, PNG,
// WebP) e PDF. O limite do bucket vale no próprio Storage, mesmo para quem tiver
// uma URL de upload válida; o meta-teste 23 fixa a lista no banco.
import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TIPOS_DE_ANEXO } from '../packages/aplicacao/src/index';
import { TIPOS_DE_ANEXO_API } from '../packages/contratos/src/index';
import { TIPOS_DE_MINIATURA } from '../packages/dominio/src/index';

const ACEITOS = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const EXECUTAVEL = /svg|html|xml|javascript|ecmascript|text\//i;

/** allowed_mime_types da última migração que mexe no bucket de anexos. */
function tiposDoBucket(): string[] {
  const dir = 'supabase/migrations';
  const migracoes = readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => readFileSync(`${dir}/${f}`, 'utf8'))
    .filter((sql) => /storage\.buckets/.test(sql) && /allowed_mime_types/.test(sql));
  const ultima = migracoes.at(-1) ?? '';
  const lista = /array\[([^\]]*)\]/.exec(ultima)?.[1] ?? '';
  return [...lista.matchAll(/'([^']+)'/g)].map((m) => m[1] ?? '');
}

describe('anexo não aceita SVG, HTML nem outro tipo que o navegador execute', () => {
  it('bucket (migração): só foto e PDF', () => {
    expect(tiposDoBucket()).toEqual(ACEITOS);
  });

  it('API, aplicação e miniatura: dentro da lista do bucket (a foto comprimida sai JPEG)', () => {
    const listas = [[...TIPOS_DE_ANEXO_API], Object.keys(TIPOS_DE_ANEXO), [...TIPOS_DE_MINIATURA]];
    for (const lista of listas) {
      expect(lista.length).toBeGreaterThan(0);
      for (const tipo of lista) {
        expect(ACEITOS).toContain(tipo);
        expect(tipo).not.toMatch(EXECUTAVEL);
      }
    }
  });

  it('o meta-teste 23 fixa no banco a mesma lista', () => {
    const meta = readFileSync('supabase/tests/database/001_meta_seguranca.test.sql', 'utf8');
    const trecho = meta.slice(meta.indexOf('-- 23.'), meta.indexOf('-- 24.'));
    for (const tipo of ACEITOS) expect(trecho).toContain(`'${tipo}'`);
    expect(trecho).not.toMatch(EXECUTAVEL);
  });
});
