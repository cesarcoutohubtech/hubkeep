// Aceite da F0-05: "a secret key não aparece em nenhum pacote além de
// auth-admin (checado na CI)" — CLAUDE.md, regra 5.
//
// Varre todo arquivo do repositório (versionado ou novo, respeitando o
// .gitignore) atrás do nome da variável e dos marcadores de chave de
// administração do Supabase. Fora da lista abaixo, qualquer ocorrência quebra
// a CI: quem precisar da chave usa @hubkeep/auth-admin.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const MARCADORES = /SUPABASE_SECRET_KEY|SERVICE_ROLE_KEY|service_role|sb_secret_/;

// Onde a menção é legítima: o próprio pacote, a CI que entrega a chave ao
// ambiente de teste, documentação e o modelo de variáveis.
const PERMITIDOS = [
  /^packages\/auth-admin\//,
  /^\.github\/workflows\//,
  /^docs\//,
  /\.md$/,
  /^\.env\.example$/,
  // Config gerada pelo supabase init: cita o PAPEL service_role da Data API num
  // comentário, não a chave. Chave de verdade não vai em config.toml.
  /^supabase\/config\.toml$/,
  /^tests\/secret-key-so-no-auth-admin\.test\.ts$/,
];

function arquivosDoRepositorio(): string[] {
  const saida = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], {
    encoding: 'utf8',
  });
  return saida.split('\n').filter(Boolean);
}

describe('secret key do Supabase só em packages/auth-admin', () => {
  it('nenhum arquivo fora da lista permitida menciona a secret key', () => {
    const ocorrencias: string[] = [];
    for (const arquivo of arquivosDoRepositorio()) {
      if (PERMITIDOS.some((p) => p.test(arquivo))) continue;
      let conteudo: string;
      try {
        conteudo = readFileSync(arquivo, 'utf8');
      } catch {
        continue; // removido no disco mas ainda no índice
      }
      conteudo.split('\n').forEach((linha, i) => {
        if (MARCADORES.test(linha)) ocorrencias.push(`${arquivo}:${i + 1}`);
      });
    }
    expect(ocorrencias).toEqual([]);
  });

  it('o próprio pacote auth-admin é quem lê a chave (controle: o teste enxerga o que procura)', () => {
    const fonte = readFileSync('packages/auth-admin/src/index.ts', 'utf8');
    expect(MARCADORES.test(fonte)).toBe(true);
  });
});
