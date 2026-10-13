// Recálculo de um período do Intelligence (ADR-036; atividade 2c do Kaio,
// proposta aprovada pelo Cesar em 13/10/2026):
//
//   pnpm ops:recalcular-inteligencia --ambiente dev --tenant <uuid> \
//     --de 2026-09-01 --ate 2026-09-30 --por "Cesar" [--dry-run]
//
// Dia a dia, do --de ao --ate, roda o job no modo de recálculo: grava outra
// linha da métrica por ativo, com o número de cálculo seguinte, a marca de
// recálculo e as versões das fórmulas de hoje. O resultado original fica, e
// os insights não mudam. Cada dia é uma transação do hk_worker com o registro
// da execução na auditoria (disparadoPor `ops:<por>`). O dia sem o módulo
// vigente não grava nada. --dry-run calcula e mostra os números sem gravar.
//
// Confere o alvo como o kit (web-do-ambiente.ts) e roda pelo
// apps/web/test/recalculo/executar.recalcular.ts. Dev e staging; produção
// entra com o roteiro de operação dela (F0-12), como o ops:provisionar.
import { type Ambiente, lerArgs } from './ambiente.ts';
import { lerPedidoDeRecalculo } from './recalculo-inteligencia.ts';
import { carregarWebDoAmbiente, rodarNoWeb } from './web-do-ambiente.ts';

const AMBIENTES_PERMITIDOS: readonly Ambiente[] = ['dev', 'staging'];
const argv = process.argv.slice(2);
const { ambiente, dryRun } = lerArgs(argv, AMBIENTES_PERMITIDOS);
const pedido = lerPedidoDeRecalculo(argv);

const ref = carregarWebDoAmbiente(ambiente); // confere o ref antes de qualquer conexão
console.log(
  `Ambiente: ${ambiente} (ref ${ref}) — grupo ${pedido.tenant}, ` +
    `${pedido.dias[0]} a ${pedido.dias.at(-1)} (${pedido.dias.length} dias)` +
    `${dryRun ? ', --dry-run: nada será gravado' : ''}\n`,
);
process.exit(
  rodarNoWeb('vitest.recalculo.config.ts', {
    HK_RECALCULO_PEDIDO: JSON.stringify(pedido),
    HK_RECALCULO_DRY_RUN: dryRun ? '1' : '',
  }),
);
