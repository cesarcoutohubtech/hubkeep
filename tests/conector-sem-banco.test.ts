// Aceite da F0-08: "o agente não tem nenhuma variável de conexão com o banco do
// HubKeep" (ADR-008; CLAUDE.md, "Nunca faça"). O lint já barra o import de db,
// pg e kysely no conector; este teste pega o resto: variável de ambiente,
// dependência declarada e string de conexão escrita no código.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const PROIBIDO =
  /DATABASE_URL|DEV_SESSION_POOLER|HK_[A-Z]+_SENHA|SUPABASE_(SECRET|SERVICE|DB)|postgres(ql)?:\/\/|@hubkeep\/db|["']pg["']|["']kysely["']|["']postgres["']/;

const arquivosDoConector = () =>
  execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', 'apps/conector'], {
    encoding: 'utf8',
  })
    .split('\n')
    .filter(Boolean);

describe('conector sem credencial do banco do HubKeep', () => {
  it('nenhum arquivo do conector cita variável, dependência ou URL de banco', () => {
    const achados: string[] = [];
    for (const arquivo of arquivosDoConector()) {
      readFileSync(arquivo, 'utf8')
        .split('\n')
        .forEach((linha, i) => {
          if (PROIBIDO.test(linha)) achados.push(`${arquivo}:${i + 1}: ${linha.trim()}`);
        });
    }
    expect(achados).toEqual([]);
  });

  it('as dependências de produção do conector são só o contrato', () => {
    const pacote = JSON.parse(readFileSync('apps/conector/package.json', 'utf8')) as {
      dependencies?: Record<string, string>;
    };
    expect(Object.keys(pacote.dependencies ?? {})).toEqual(['@hubkeep/contratos']);
  });
});
