// Auditoria geral (fase 1c): o filtro por tipo de registro e o nome de cada
// tipo saem de ENTIDADES_DA_AUDITORIA (domínio). Este teste lê o código que
// grava a auditoria (as chamadas a auditar) e falha se uma entidade gravada
// não estiver na lista; e confere a lista da API e o nome de cada entidade no
// catálogo de cada idioma.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ENTIDADES_DA_AUDITORIA_API } from '../packages/contratos/src/index';
import { ENTIDADES_DA_AUDITORIA } from '../packages/dominio/src/index';
import { CATALOGOS } from '../packages/i18n/src/index';

function arquivos(dir: string): string[] {
  return readdirSync(dir).flatMap((nome) => {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) return nome === 'node_modules' ? [] : arquivos(caminho);
    return caminho.endsWith('.ts') ? [caminho] : [];
  });
}

/** As entidades das chamadas a auditar: os literais da linha do campo entidade. */
function entidadesGravadas(): Set<string> {
  const achadas = new Set<string>();
  for (const dir of ['packages/db/src', 'packages/aplicacao/src', 'apps/web/src', 'scripts']) {
    for (const arquivo of arquivos(dir)) {
      const texto = readFileSync(arquivo, 'utf8');
      for (const m of texto.matchAll(/auditar\(\{[\s\S]*?entidade:([^,\n]*)/g)) {
        // O literal comparado no ternário (v.tipo === 'uh') não é entidade.
        const expressao = (m[1] ?? '').replace(/===?\s*'[a-z_]+'/g, '');
        for (const literal of expressao.matchAll(/'([a-z_]+)'/g)) achadas.add(literal[1] ?? '');
      }
    }
  }
  return achadas;
}

describe('entidades da auditoria (1c)', () => {
  it('toda entidade gravada está na lista do domínio', () => {
    const gravadas = entidadesGravadas();
    // Controle: a leitura acha as do cadastro e as do ternário dos proprietários.
    expect([...gravadas]).toEqual(expect.arrayContaining(['chamado', 'os', 'local_proprietario']));
    const fora = [...gravadas].filter(
      (e) => !(ENTIDADES_DA_AUDITORIA as readonly string[]).includes(e),
    );
    expect(fora).toEqual([]);
  });

  it('a lista da API é a do domínio', () => {
    expect([...ENTIDADES_DA_AUDITORIA_API]).toEqual([...ENTIDADES_DA_AUDITORIA]);
  });

  it('cada entidade tem nome no catálogo, em cada idioma', () => {
    for (const [idioma, mensagens] of Object.entries(CATALOGOS)) {
      const texto = (mensagens as Record<string, string>)['auditoria.entidade'] ?? '';
      for (const e of ENTIDADES_DA_AUDITORIA) {
        expect([idioma, e, texto.includes(` ${e} {`)]).toEqual([idioma, e, true]);
      }
    }
  });
});
