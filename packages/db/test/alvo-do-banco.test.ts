// M2 (docs/11): o preview não sobe apontando para o banco de produção, e falha
// fechado quando não consegue provar que não aponta. O erro não carrega a
// string de conexão, que tem a senha.
import { describe, expect, it } from 'vitest';
import { conferirAlvoDoBanco, refDaConexao } from '../src/alvo-do-banco';

const SENHA = 'senha-que-nunca-pode-aparecer';
const PRODUCAO = 'prodprodprodprodprod';
const STAGING = 'stagstagstagstagstag';
const pooler = (ref: string) =>
  `postgresql://hk_app.${ref}:${SENHA}@aws-0-sa-east-1.pooler.supabase.com:6543/postgres`;
const direta = (ref: string) => `postgresql://hk_app:${SENHA}@db.${ref}.supabase.co:5432/postgres`;

const conferir = (vercelEnv: string | undefined, url: string, refProducao: string | undefined) =>
  conferirAlvoDoBanco({ vercelEnv, refProducao, nome: 'DATABASE_URL_APP', url });

describe('refDaConexao', () => {
  it.each([
    ['usuário do Supavisor', pooler(STAGING), STAGING],
    ['host direto', direta(STAGING), STAGING],
    [
      'usuário e host do mesmo projeto',
      `postgresql://hk_app.${STAGING}:x@db.${STAGING}.supabase.co/postgres`,
      STAGING,
    ],
    ['host local', `postgresql://hk_app:${SENHA}@127.0.0.1:54322/postgres`, null],
    [
      'dois projetos na mesma string',
      `postgresql://hk_app.${STAGING}:x@db.${PRODUCAO}.supabase.co/postgres`,
      null,
    ],
    ['?host= com outro projeto', `${pooler(STAGING)}?host=db.${PRODUCAO}.supabase.co`, null],
    ['texto que não é URL', 'não é url', null],
  ])('%s', (_n, url, esperado) => {
    expect(refDaConexao(url)).toBe(esperado);
  });
});

describe('conferirAlvoDoBanco', () => {
  it.each([undefined, '', 'development', 'production'])(
    'fora do preview (%s) não confere nada',
    (env) => {
      expect(() => conferir(env, pooler(PRODUCAO), undefined)).not.toThrow();
    },
  );

  it('preview no staging sobe', () => {
    expect(() => conferir('preview', pooler(STAGING), PRODUCAO)).not.toThrow();
    expect(() => conferir('preview', direta(STAGING), PRODUCAO)).not.toThrow();
  });

  const recusas: [string, string, string | undefined][] = [
    ['preview no banco de produção pelo Supavisor', pooler(PRODUCAO), PRODUCAO],
    ['preview no banco de produção pelo host direto', direta(PRODUCAO), PRODUCAO],
    [
      'preview com produção escondida no ?host=',
      `${pooler(STAGING)}?host=db.${PRODUCAO}.supabase.co`,
      PRODUCAO,
    ],
    ['preview sem HK_REF_PRODUCAO', pooler(STAGING), undefined],
    ['preview com HK_REF_PRODUCAO que não é ref', pooler(STAGING), 'producao'],
    [
      'preview com banco sem ref identificável',
      `postgresql://hk_app:${SENHA}@10.0.0.5:5432/postgres`,
      PRODUCAO,
    ],
  ];

  it.each(recusas)('recusa: %s, sem a senha na mensagem', (_n, url, ref) => {
    let erro: unknown;
    try {
      conferir('preview', url, ref);
    } catch (e) {
      erro = e;
    }
    expect(erro).toBeInstanceOf(Error);
    expect((erro as Error).message).not.toContain(SENHA);
    expect((erro as Error).message).toContain('Nada foi conectado');
  });
});
