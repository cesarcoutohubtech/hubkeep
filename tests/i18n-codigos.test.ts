// A API devolve erro como código e parâmetros, e quem exibe traduz (ADR-022).
// Este teste varre o código atrás de todo código de erro emitido (erros do
// domínio, ErroHttp dos handlers e os gerais da camada HTTP) e exige a chave
// `erro.<codigo>` nos quatro catálogos.
//
// O código montado em template (`${tipo}_nome_invalido`) não é literal: cada
// template achado precisa estar em CODIGOS_MONTADOS, com os valores que ele
// pode ter, e cada valor é conferido como os outros (B4 do docs/11).
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CODIGOS_HTTP } from '../packages/contratos/src/index';
import { CATALOGOS, IDIOMAS } from '../packages/i18n/src/index';

const ERROS = '(?:NaoEncontrado|PermissaoNegada|RegraViolada|Conflito|ErroHttp)';
const EMISSAO = new RegExp(`new\\s+${ERROS}\\(\\s*(?:\\d+\\s*,\\s*)?'([a-z_]+)'`, 'g');
const EMISSAO_MONTADA = new RegExp(`new\\s+${ERROS}\\(\\s*(?:\\d+\\s*,\\s*)?\`([^\`]+)\``, 'g');

/** Template do código, no arquivo em que aparece → os códigos que ele pode gerar. */
const CODIGOS_MONTADOS: Record<string, readonly string[]> = {
  // validarNomesDeConfiguracao(tipo: 'situacao' | 'prioridade', ...)
  'packages/dominio/src/situacoes.ts ${tipo}_nome_invalido': [
    'situacao_nome_invalido',
    'prioridade_nome_invalido',
  ],
};

/** Os templates de código achados no código, como "arquivo template". */
function templatesEmitidos(): string[] {
  const achados = new Set<string>();
  for (const arquivo of arquivosDeCodigo()) {
    for (const m of lerOuVazio(arquivo).matchAll(EMISSAO_MONTADA)) {
      achados.add(`${arquivo} ${m[1] ?? ''}`);
    }
  }
  return [...achados].sort();
}

function arquivosDeCodigo(): string[] {
  return execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], {
    encoding: 'utf8',
  })
    .split('\n')
    .filter((f) => /^(apps|packages)\/[^/]+\/src\/.*\.tsx?$/.test(f));
}

function lerOuVazio(arquivo: string): string {
  try {
    return readFileSync(arquivo, 'utf8');
  } catch {
    return '';
  }
}

function codigosEmitidos(): string[] {
  const codigos = new Set<string>(Object.values(CODIGOS_HTTP));
  for (const arquivo of arquivosDeCodigo()) {
    for (const m of lerOuVazio(arquivo).matchAll(EMISSAO)) codigos.add(m[1] ?? '');
  }
  for (const valores of Object.values(CODIGOS_MONTADOS)) for (const c of valores) codigos.add(c);
  return [...codigos].sort();
}

describe('todo código de erro da API tem mensagem no catálogo', () => {
  const codigos = codigosEmitidos();

  it('controle: a varredura enxerga os códigos (domínio, handler e HTTP)', () => {
    expect(codigos).toEqual(
      expect.arrayContaining(['ativacao_so_admin', 'credencial_nao_encontrada', 'erro_interno']),
    );
  });

  it.each(IDIOMAS)('%s: cada código tem erro.<codigo>', (idioma) => {
    const faltando = codigos.filter((c) => !(`erro.${c}` in CATALOGOS[idioma]));
    expect(faltando).toEqual([]);
  });

  it('todo código montado em template tem os valores declarados aqui', () => {
    expect(templatesEmitidos()).toEqual(Object.keys(CODIGOS_MONTADOS).sort());
  });

  it('controle: a varredura enxerga o código montado em template', () => {
    expect(templatesEmitidos()).toContain(
      'packages/dominio/src/situacoes.ts ${tipo}_nome_invalido',
    );
  });
});
