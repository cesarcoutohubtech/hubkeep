// Staging e produção só com uma pessoa no terminal (ADR-020): sem TTY o script
// recusa, e a confirmação é o project ref do alvo digitado por inteiro.
import { describe, expect, it } from 'vitest';
import { refDoAlvo } from '../scripts/ops/ambiente.ts';
import { resumirRespostaDaDataApi } from '../scripts/ops/ler-config-remota.ts';
import { confirmacaoConfere, exigirTerminalInterativo } from '../scripts/ops/terminal.ts';

const REF = 'abcdefghijklmnopqrst';

describe('modo interativo dos scripts de operação', () => {
  it('sem terminal interativo, recusa (agente, CI, pipe)', () => {
    expect(() => exigirTerminalInterativo(false, true, 'staging')).toThrow(/terminal interativo/);
    expect(() => exigirTerminalInterativo(true, false, 'producao')).toThrow(/terminal interativo/);
    expect(() => exigirTerminalInterativo(true, true, 'producao')).not.toThrow();
  });

  it('a confirmação é o ref inteiro do alvo', () => {
    expect(confirmacaoConfere(REF, REF)).toBe(true);
    expect(confirmacaoConfere(`  ${REF}\n`, REF)).toBe(true);
    expect(confirmacaoConfere('sim', REF)).toBe(false);
    expect(confirmacaoConfere(REF.slice(0, 10), REF)).toBe(false);
    expect(confirmacaoConfere('', '')).toBe(false);
  });

  it('o ref do alvo sai do usuário do Supavisor ou do host da conexão direta', () => {
    expect(
      refDoAlvo({ user: `postgres.${REF}`, host: 'aws-0-sa-east-1.pooler.supabase.com' }),
    ).toBe(REF);
    expect(refDoAlvo({ user: 'postgres', host: `db.${REF}.supabase.co` })).toBe(REF);
    expect(refDoAlvo({ user: 'postgres', host: '127.0.0.1' })).toBe('');
  });
});

describe('sonda da Data API', () => {
  it('resume status e erro do PostgREST sem a chave usada', () => {
    const chave = 'sb_publishable_VALOR-DE-TESTE';
    const corpo = JSON.stringify({ code: 'PGRST002', message: `falhou com ${chave}`, hint: null });
    const saida = resumirRespostaDaDataApi(503, corpo, chave);
    expect(saida).toMatchObject({ status: 503, code: 'PGRST002' });
    expect(JSON.stringify(saida)).not.toContain(chave);
  });

  it('corpo que não é JSON sai só como status', () => {
    expect(resumirRespostaDaDataApi(502, '<html>', 'x')).toEqual({
      status: 502,
      corpo_nao_json: true,
    });
  });
});
