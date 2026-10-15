// Gravação do histórico de demonstração do Intelligence no dev ou no staging,
// chamada por `pnpm demo:historico` (scripts/ops/historico-demonstracao.ts),
// que confere o alvo e monta as variáveis. Fora do `pnpm test`: o vitest do
// web só pega *.test.ts, e este arquivo só roda pela config
// vitest.historico.config.ts.
import { expect, it } from 'vitest';
import { baseDoKit, fimPadraoDoHistorico, gravarHistorico } from './gravacao-historico';

const exigir = (nome: string): string => {
  const v = process.env[nome];
  if (!v) throw new Error(`${nome} não está definida (rode por pnpm demo:historico).`);
  return v;
};

// Até 8 horas: do notebook até o dev, o volume completo (cerca de 21,5 mil
// operações pelos casos de uso) leva de 3 a 4 horas (14/10/2026).
it('histórico de demonstração do Intelligence', { timeout: 8 * 3_600_000 }, async () => {
  const log = (linha: string) => console.log(linha);
  const r = await gravarHistorico({
    fim: process.env['HK_HISTORICO_FIM'] || fimPadraoDoHistorico(new Date()),
    urlDono: exigir('HK_DEMO_URL_DONO'),
    base: baseDoKit({
      senha: exigir('HK_DEMO_SENHA'),
      site: process.env['HK_URL_SITE'] ?? 'http://localhost:3000',
      log,
    }),
    log,
  });
  console.log(
    [
      '',
      `Grupo ${r.tenantId}: ${r.chamados} chamados, ${r.diasCalculados} dias calculados, ` +
        `${r.decisoes} decisões. As contas são as do kit, com a senha de HK_DEMO_SENHA.`,
      ...Object.entries(r.estados).map(([c, e]) => `  ${c.padEnd(28)} ${e}`),
      '',
    ].join('\n'),
  );
  expect(r.inesperados).toEqual([]);
});
