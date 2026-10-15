/**
 * Segundo histórico do Intelligence, SOMENTE no DEV; não altera o primeiro.
 * Dois modos exclusivos: --verificar (read-only) ou --executar (escreve só tenant novo).
 * Uso a partir da raiz:
 * node --experimental-strip-types --no-warnings=ExperimentalWarning scripts/ops/historico-isolado.ts --ambiente dev --fim 2026-10-13 --verificar
 * Após revisar a verificação:
 * node --experimental-strip-types --no-warnings=ExperimentalWarning scripts/ops/historico-isolado.ts --ambiente dev --fim 2026-10-13 --executar
 */
import { conexaoDono, lerArgs } from './ambiente.ts';
import { lerFimDoHistorico } from './historico-inteligencia.ts';
import { carregarWebDoAmbiente, exigir, rodarNoWeb, urlDoDonoComCa } from './web-do-ambiente.ts';

const argv = process.argv.slice(2);
const permitidas = new Set(['--ambiente', '--fim', '--verificar', '--executar']);
if (argv.some((x) => x.startsWith('--') && !permitidas.has(x))) {
  throw new Error('Argumento não permitido. Informe apenas --ambiente dev --fim AAAA-MM-DD e um modo.');
}
const { ambiente } = lerArgs(argv, ['dev']); // staging e produção PROIBIDOS nesta execução.
const fim = lerFimDoHistorico(argv);
if (!fim) throw new Error('Informe um --fim explícito para a v2. Nada foi gravado.');
const verificar = argv.includes('--verificar');
const executar = argv.includes('--executar');
if (verificar === executar) {
  throw new Error('Escolha exatamente --verificar ou --executar. Nada foi gravado.');
}
const ref = carregarWebDoAmbiente(ambiente);
const dono = conexaoDono(ambiente); // confere o ref da string antes de conectar.
if (executar && exigir('HK_DEMO_SENHA').length < 12) {
  throw new Error('HK_DEMO_SENHA precisa ter pelo menos 12 caracteres.');
}

console.log(`Intelligence v2: ${executar ? 'EXECUTAR' : 'VERIFICAR'} em DEV (${ref}), fim ${fim}.\n`);
process.exit(
  rodarNoWeb('vitest.historico-isolado.config.ts', {
    HK_HISTORICO_V2_URL_DONO: urlDoDonoComCa(dono),
    HK_HISTORICO_V2_FIM: fim,
    HK_HISTORICO_V2_MODO: executar ? 'executar' : 'verificar',
  }),
);
