// Conferência de ambiente dos scripts de operação, sem conexão nenhuma: cada
// script roda só nos ambientes que declara, e a string de conexão tem de ser
// do ambiente pedido (CI local; dev pelo ref de [remotes.dev]) antes de o
// script abrir qualquer conexão.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  AMBIENTES,
  conferirAlvo,
  lerArgs,
  lerRefDoDev,
  refDoDevNoConfig,
} from '../scripts/ops/ambiente.ts';

const REF = 'abcdefghijklmnopqrst';
const OUTRO = 'zyxwvutsrqponmlkjihg';
const SENHA = 'senha-que-nunca-pode-aparecer';

/** Mensagem do erro lançado, ou "não falhou". */
function erroDe(fn: () => void): string {
  try {
    fn();
  } catch (e) {
    return (e as Error).message;
  }
  return 'não falhou';
}

describe('refDoDevNoConfig', () => {
  it('lê o project_id do bloco [remotes.dev], não o de topo nem o de outro remoto', () => {
    const toml = [
      'project_id = "hubkeep"',
      '[remotes.staging]',
      `project_id = "${OUTRO}"`,
      '[remotes.dev]',
      '# comentário',
      `project_id = "${REF}"`,
      '[remotes.dev.api]',
      'enabled = false',
    ].join('\r\n');
    expect(refDoDevNoConfig(toml)).toBe(REF);
  });

  it('project_id de subseção ([remotes.dev.api]) não conta', () => {
    const toml = ['[remotes.dev]', 'x = 1', '[remotes.dev.api]', `project_id = "${REF}"`];
    expect(() => refDoDevNoConfig(toml.join('\n'))).toThrow(/não encontrado/);
  });

  it('sem [remotes.dev], ou com valor que não é ref, falha', () => {
    expect(() => refDoDevNoConfig('project_id = "hubkeep"\n')).toThrow(/não encontrado/);
    expect(() => refDoDevNoConfig('[remotes.dev]\nproject_id = "hubkeep"\n')).toThrow(
      /não é um project ref/,
    );
  });

  it('o supabase/config.toml do repositório tem o ref do dev', () => {
    expect(lerRefDoDev()).toMatch(/^[a-z]{20}$/);
  });
});

describe('conferirAlvo', () => {
  const pooler = (ref: string) =>
    `postgresql://postgres.${ref}:${SENHA}@aws-0-sa-east-1.pooler.supabase.com:5432/postgres`;

  it('dev: aceita a string do Supavisor e a conexão direta com o ref do dev', () => {
    expect(() => conferirAlvo('dev', 'DEV_SESSION_POOLER', pooler(REF), REF)).not.toThrow();
    const direta = `postgresql://postgres:${SENHA}@db.${REF}.supabase.co:5432/postgres`;
    expect(() => conferirAlvo('dev', 'DEV_SESSION_POOLER', direta, REF)).not.toThrow();
  });

  it('dev: ref de outro projeto → erro que não mostra a string de conexão', () => {
    const erro = erroDe(() => conferirAlvo('dev', 'DEV_SESSION_POOLER', pooler(OUTRO), REF));
    expect(erro).toMatch(/não é do HubKeep-dev/);
    expect(erro).not.toContain(SENHA);
    expect(erro).not.toContain(OUTRO);
  });

  it('dev: o ref só na senha não conta', () => {
    const url = `postgresql://postgres.${OUTRO}:${REF}@aws-0-sa-east-1.pooler.supabase.com:5432/postgres`;
    expect(erroDe(() => conferirAlvo('dev', 'DEV_SESSION_POOLER', url, REF))).toMatch(
      /não é do HubKeep-dev/,
    );
  });

  it('dev: sem o ref para comparar, falha fechado', () => {
    expect(() => conferirAlvo('dev', 'DEV_SESSION_POOLER', pooler(REF), undefined)).toThrow();
  });

  it('ci: só Postgres local', () => {
    for (const host of ['127.0.0.1', 'localhost', '[::1]']) {
      const url = `postgresql://postgres:postgres@${host}:54322/postgres`;
      expect(() => conferirAlvo('ci', 'CI_DATABASE_URL_OWNER', url, undefined)).not.toThrow();
    }
    const erro = erroDe(() => conferirAlvo('ci', 'CI_DATABASE_URL_OWNER', pooler(REF), undefined));
    expect(erro).toMatch(/Postgres local da CI/);
    expect(erro).not.toContain(SENHA);
  });

  it('URL inválida → erro sem o valor', () => {
    const erro = erroDe(() => conferirAlvo('dev', 'DEV_SESSION_POOLER', `x ${SENHA}`, REF));
    expect(erro).toMatch(/não é uma URL/);
    expect(erro).not.toContain(SENHA);
  });
});

describe('lerArgs', () => {
  it('aceita só os ambientes declarados pelo script', () => {
    expect(lerArgs(['--ambiente', 'dev'], ['ci', 'dev']).ambiente).toBe('dev');
    expect(erroDe(() => lerArgs(['--ambiente', 'staging'], ['ci', 'dev']))).toMatch(
      /Este script não roda em staging/,
    );
    expect(erroDe(() => lerArgs(['--ambiente', 'producao'], ['ci', 'dev']))).toMatch(
      /não roda em producao/,
    );
    expect(erroDe(() => lerArgs([], ['ci', 'dev']))).toMatch(/Informe --ambiente ci\|dev/);
  });

  it('padrão só quando o argumento falta, e ainda conferido', () => {
    expect(lerArgs([], ['dev'], 'dev').ambiente).toBe('dev');
    expect(() => lerArgs(['--ambiente', 'staging'], ['dev'], 'dev')).toThrow();
  });
});

// Os ambientes declarados no topo de cada script. Os que gravam ou apagam dado
// (fixture própria ou da suíte que disparam) ficam em ci e dev; mudar isso é
// decisão revisada, não edição de passagem.
describe('ambientes declarados pelos scripts de scripts/ops', () => {
  const declarados = (arquivo: string): string[] => {
    const fonte = readFileSync(`scripts/ops/${arquivo}`, 'utf8');
    const m = /const AMBIENTES_PERMITIDOS[^=]*=\s*\[([^\]]*)\]/.exec(fonte);
    if (!m?.[1]) throw new Error(`${arquivo} não declara AMBIENTES_PERMITIDOS.`);
    return [...m[1].matchAll(/'([a-z]+)'/g)].map((x) => x[1] ?? '');
  };

  it.each([
    ['verificar-papeis.ts', ['ci', 'dev']],
    ['fumaca-db.ts', ['dev']],
    ['testar-banco-dev.mjs', ['dev']],
    ['configurar-papeis.ts', ['ci', 'dev', 'staging', 'producao']],
  ])('%s declara %j', (arquivo, esperado) => {
    const lista = declarados(arquivo);
    expect(lista).toEqual(esperado);
    for (const amb of lista) expect(AMBIENTES).toContain(amb);
  });
});
