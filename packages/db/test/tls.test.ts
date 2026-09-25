// HK_BANCO_SEM_TLS=1 só desliga o TLS com o banco na própria máquina (a CI).
// Com host remoto, a inicialização falha — e o erro não carrega a string de
// conexão, que tem a senha.
import { describe, expect, it } from 'vitest';
import { tlsDaConexao } from '../src/tls';

const SENHA = 'senha-que-nunca-pode-aparecer';
const remotas = [
  `postgresql://hk_app.abcdefghijklmnopqrst:${SENHA}@aws-0-sa-east-1.pooler.supabase.com:6543/postgres`,
  `postgresql://hk_app:${SENHA}@db.abcdefghijklmnopqrst.supabase.co:5432/postgres`,
  `postgresql://hk_app:${SENHA}@10.0.0.5:5432/postgres`,
  // Host local na URL, mas o ?host= (que o pg respeita) aponta para fora.
  `postgresql://hk_app:${SENHA}@127.0.0.1:5432/postgres?host=db.exemplo.com`,
  // "localhost" como subdomínio não é localhost.
  `postgresql://hk_app:${SENHA}@localhost.exemplo.com:5432/postgres`,
];
const locais = [
  `postgresql://hk_app:${SENHA}@127.0.0.1:54322/postgres`,
  `postgresql://hk_app:${SENHA}@localhost:5432/postgres`,
  `postgresql://hk_app:${SENHA}@[::1]:5432/postgres`,
];

/** Mensagem do erro lançado, ou "não falhou". */
function erroDe(url: string): string {
  try {
    tlsDaConexao(url, true);
  } catch (e) {
    return (e as Error).message;
  }
  return 'não falhou';
}

describe('tlsDaConexao', () => {
  it.each(remotas)(
    'host remoto + HK_BANCO_SEM_TLS=1 → erro, sem a string de conexão: %s',
    (url) => {
      const erro = erroDe(url);
      expect(erro).toMatch(/^HK_BANCO_SEM_TLS=1 só é aceito/);
      expect(erro).not.toContain(SENHA);
      expect(erro).not.toContain('hk_app');
    },
  );

  it.each(locais)('localhost + HK_BANCO_SEM_TLS=1 → sem TLS: %s', (url) => {
    expect(tlsDaConexao(url, true)).toBe(false);
  });

  it.each([...remotas, ...locais])('sem a flag → TLS: %s', (url) => {
    expect(tlsDaConexao(url, false)).toBe(true);
  });

  it('URL inválida com a flag → erro que não repete o valor', () => {
    const erro = erroDe(`nao-e-url ${SENHA}`);
    expect(erro).toMatch(/não é uma URL/);
    expect(erro).not.toContain(SENHA);
  });
});
