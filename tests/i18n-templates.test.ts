// O template do convite no Supabase é o do catálogo (aceite da F0-10b): o
// arquivo supabase/templates/convite.html e o assunto no config.toml saem de
// emailDeConvite em pt-BR, com as variáveis do Go no lugar dos dados. Para
// regenerar o arquivo depois de mudar o catálogo:
//   HK_ATUALIZAR_TEMPLATES=1 pnpm exec vitest run tests/i18n-templates.test.ts
// O assunto fica no config.toml (zona protegida) e muda à mão, junto.
import { readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { emailDeConvite } from '../packages/i18n/src/index';

/** Variáveis do template do Supabase (Go), no lugar dos dados do convite. */
const VARIAVEIS_DO_SUPABASE = {
  nome: '{{ .Data.nome }}',
  tenant: '{{ .Data.tenant }}',
  link: '{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=invite',
};

describe('template do Supabase gerado do catálogo (pt-BR)', () => {
  const email = emailDeConvite('pt-BR', VARIAVEIS_DO_SUPABASE);

  it('supabase/templates/convite.html é o do catálogo', () => {
    const arquivo = 'supabase/templates/convite.html';
    if (process.env['HK_ATUALIZAR_TEMPLATES'] === '1') writeFileSync(arquivo, email.html);
    expect(readFileSync(arquivo, 'utf8')).toBe(email.html);
  });

  it('o assunto do convite no config.toml é o do catálogo', () => {
    const config = readFileSync('supabase/config.toml', 'utf8');
    const bloco = /\[auth\.email\.template\.invite\]\s*\nsubject = "([^"]*)"/.exec(config);
    expect(bloco?.[1]).toBe(email.assunto);
  });
});
