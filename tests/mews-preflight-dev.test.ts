// Guarda do preflight Mews: sem executar o script nem abrir conexoes de banco.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const fonte = readFileSync('scripts/ops/mews-preflight-dev.mjs', 'utf8');

describe('pré-voo Mews: somente leitura do Supabase-dev', () => {
  it('usa a guarda de destino e apenas transação READ ONLY com ROLLBACK', () => {
    expect(fonte).toContain("lerArgs(process.argv.slice(2), ['dev'])");
    expect(fonte).toContain('conexaoDono(ambiente)');
    expect(fonte).toContain('BEGIN TRANSACTION READ ONLY');
    expect(fonte).toContain("'ROLLBACK'");
    expect(fonte).not.toMatch(
      /cliente\.query\(\s*['"`](INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|TRUNCATE)\b/i,
    );
  });

  it('verifica as três migrações aprovadas, FORCE RLS e as colunas sensíveis', () => {
    for (const versao of ['20261017183000', '20261017230500', '20261018010500']) {
      expect(fonte).toContain(versao);
    }
    for (const tabela of ['mews_checkpoint', 'mews_recurso', 'mews_bloqueio']) {
      expect(fonte).toContain(tabela);
    }
    // A comparacao de roles name[] ocorre no banco: pg pode retornar "{hk_app}".
    expect(fonte).toContain("('hk_app'::name = any(roles))");
    expect(fonte).toContain("cmd = 'SELECT'");
    expect(fonte).toContain('qual is not null');
    expect(fonte).not.toContain('Array.isArray(roles)');
    expect(fonte).toContain('relforcerowsecurity');
    expect(fonte).toContain('has_column_privilege');
    expect(fonte).toContain('credencial_ref');
    expect(fonte).toContain('enterprise_id');
    expect(fonte).toContain('digest_incremental');
  });
});
