// Dados de demonstração do kit de teste (docs/10-kit-de-teste.md), no dev ou
// no staging do treinamento:
//
//   pnpm demo:dados --ambiente dev
//   pnpm demo:dados --ambiente staging --turma 2
//
// Lê as variáveis do web do ambiente (web-do-ambiente.ts) e, do ambiente, a
// string do dono (DEV_SESSION_POOLER no dev, DATABASE_URL_OWNER no staging;
// só para o tenant, a licença e o primeiro Admin) e a HK_DEMO_SENHA (senha de
// teste de todas as contas). Antes de conectar, confere que TODAS as conexões
// são do projeto pedido, pelo ref de [remotes.<ambiente>]. Sem o bloco
// [remotes.staging] no config.toml (F0-12), o staging é recusado.
//
// --turma N (1 a 99) cria um grupo novo por turma de treinamento, "Grupo
// Demonstração — Turma N", com e-mails @turmaN.demo.hubkeep.test, sem
// apagar nada (docs/13, resposta 3 do Cesar de 08/10/2026). Sem --turma, é o
// grupo de sempre. Rodar de novo com a mesma turma cai no mesmo grupo.
//
// A gravação é do script apps/web/test/demonstracao/semear.ts, que usa os
// casos de uso da aplicação; aqui só se confere o alvo e se chama o vitest,
// como o db:fumaca. Nada em argv, nada de senha na tela.
import { type Ambiente, conexaoDono, lerArgs } from './ambiente.ts';
import { lerTurma } from './turma.ts';
import { carregarWebDoAmbiente, exigir, rodarNoWeb, urlDoDonoComCa } from './web-do-ambiente.ts';

// Grava dado de teste: dev e staging (adendo ao ADR-024 sobre a conta do kit);
// produção, nunca.
const AMBIENTES_PERMITIDOS: readonly Ambiente[] = ['dev', 'staging'];
const argv = process.argv.slice(2);
const { ambiente } = lerArgs(argv, AMBIENTES_PERMITIDOS);
const turma = lerTurma(argv);

const ref = carregarWebDoAmbiente(ambiente);
const dono = conexaoDono(ambiente); // confere o ref antes de qualquer conexão
if (exigir('HK_DEMO_SENHA').length < 12) {
  throw new Error('HK_DEMO_SENHA precisa de pelo menos 12 caracteres.');
}

console.log(`Ambiente: ${ambiente} (ref ${ref})${turma ? `, turma ${turma}` : ''}\n`);
process.exit(
  rodarNoWeb('vitest.demonstracao.config.ts', {
    HK_DEMO_URL_DONO: urlDoDonoComCa(dono),
    HK_DEMO_TURMA: turma === null ? '' : String(turma),
  }),
);
