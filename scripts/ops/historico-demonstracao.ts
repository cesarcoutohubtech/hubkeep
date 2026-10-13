// Histórico de demonstração do HubKeep Intelligence (atividade 3; decisões de
// Cesar e Kaio em docs/diario-intelligence.md), no dev ou no staging:
//
//   pnpm demo:historico --ambiente dev [--fim AAAA-MM-DD]
//
// O molde é o do demo:dados: lê as variáveis do web do ambiente
// (web-do-ambiente.ts) e, do ambiente, a string do dono (DEV_SESSION_POOLER
// no dev, DATABASE_URL_OWNER no staging) e a HK_DEMO_SENHA (o kit cria as
// contas). Antes de conectar, confere que todas as conexões são do projeto
// pedido. Produção, nunca; o staging, só com o [remotes.staging] (F0-12).
//
// A gravação é de apps/web/test/demonstracao/gravacao-historico.ts, pelos
// casos de uso com o relógio do roteiro; aqui só se confere o alvo e se chama
// o vitest. Nada em argv, nada de senha na tela.
import { type Ambiente, conexaoDono, lerArgs } from './ambiente.ts';
import { lerFimDoHistorico } from './historico-inteligencia.ts';
import { carregarWebDoAmbiente, exigir, rodarNoWeb, urlDoDonoComCa } from './web-do-ambiente.ts';

const AMBIENTES_PERMITIDOS: readonly Ambiente[] = ['dev', 'staging'];
const argv = process.argv.slice(2);
const { ambiente } = lerArgs(argv, AMBIENTES_PERMITIDOS);
const fim = lerFimDoHistorico(argv);

const ref = carregarWebDoAmbiente(ambiente);
const dono = conexaoDono(ambiente); // confere o ref antes de qualquer conexão
if (exigir('HK_DEMO_SENHA').length < 12) {
  throw new Error('HK_DEMO_SENHA precisa de pelo menos 12 caracteres.');
}

console.log(`Ambiente: ${ambiente} (ref ${ref}), fim ${fim ?? 'padrão'}\n`);
process.exit(
  rodarNoWeb('vitest.historico.config.ts', {
    HK_DEMO_URL_DONO: urlDoDonoComCa(dono),
    HK_HISTORICO_FIM: fim ?? '',
  }),
);
