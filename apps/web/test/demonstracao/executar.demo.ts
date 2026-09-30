// Execução dos dados de demonstração no dev, chamada por `pnpm demo:dados`
// (scripts/ops/dados-demonstracao.ts), que confere o alvo e monta as
// variáveis. Fora do `pnpm test`: o vitest do web só pega *.test.ts, e este
// arquivo só roda pela config vitest.demonstracao.config.ts.
import { expect, it } from 'vitest';
import { PESSOAS, type Pessoa, semearDemonstracao } from './semear';

const exigir = (nome: string): string => {
  const v = process.env[nome];
  if (!v) throw new Error(`${nome} não está definida (rode por pnpm demo:dados).`);
  return v;
};

it('dados de demonstração no dev', { timeout: 600_000 }, async () => {
  const r = await semearDemonstracao({
    urlDono: exigir('HK_DEMO_URL_DONO'),
    senha: exigir('HK_DEMO_SENHA'),
    site: process.env['HK_URL_SITE'] ?? 'http://localhost:3000',
    log: (linha) => console.log(linha),
  });
  const contas = (Object.keys(PESSOAS) as Pessoa[]).map(
    (p) => `  ${PESSOAS[p].nome.padEnd(28)} ${r.usuarios[p].email}`,
  );
  console.log(['', 'Contas (todas com a senha de HK_DEMO_SENHA):', ...contas, ''].join('\n'));
  expect(Object.keys(r.chamados)).toHaveLength(7);
});
