// A API devolve erro como código e parâmetros, e quem exibe traduz (ADR-022).
// Este teste varre o código atrás de todo código de erro emitido (erros do
// domínio, ErroHttp dos handlers e os gerais da camada HTTP) e exige a chave
// `erro.<codigo>` no catálogo pt-BR (e, pelo teste do pacote, em en).
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CODIGOS_HTTP } from '../packages/contratos/src/index';
import { CATALOGOS } from '../packages/i18n/src/index';

const EMISSAO =
  /new\s+(?:NaoEncontrado|PermissaoNegada|RegraViolada|Conflito|ErroHttp)\(\s*(?:\d+\s*,\s*)?'([a-z_]+)'/g;

function codigosEmitidos(): string[] {
  const arquivos = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], {
    encoding: 'utf8',
  })
    .split('\n')
    .filter((f) => /^(apps|packages)\/[^/]+\/src\/.*\.tsx?$/.test(f));
  const codigos = new Set<string>(Object.values(CODIGOS_HTTP));
  for (const arquivo of arquivos) {
    let fonte: string;
    try {
      fonte = readFileSync(arquivo, 'utf8');
    } catch {
      continue;
    }
    for (const m of fonte.matchAll(EMISSAO)) codigos.add(m[1] ?? '');
  }
  return [...codigos].sort();
}

describe('todo código de erro da API tem mensagem no catálogo', () => {
  const codigos = codigosEmitidos();

  it('controle: a varredura enxerga os códigos (domínio, handler e HTTP)', () => {
    expect(codigos).toEqual(
      expect.arrayContaining(['ativacao_so_admin', 'credencial_nao_encontrada', 'erro_interno']),
    );
  });

  it('cada código tem erro.<codigo> em pt-BR', () => {
    const faltando = codigos.filter((c) => !(`erro.${c}` in CATALOGOS['pt-BR']));
    expect(faltando).toEqual([]);
  });
});
