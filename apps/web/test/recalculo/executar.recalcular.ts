// Execução do recálculo do Intelligence, chamada por `pnpm
// ops:recalcular-inteligencia` (scripts/ops/recalcular-inteligencia.ts), que
// confere o alvo e monta o pedido. Fora do `pnpm test`: o vitest do web só
// pega *.test.ts, e este arquivo só roda pela config vitest.recalculo.config.ts.
//
// Um dia por transação do hk_worker, em ordem: o dia que falha para o pedido,
// e os dias anteriores já ficaram gravados (rodar de novo grava outro cálculo
// deles, o que o recálculo permite). No --dry-run, cada dia roda inteiro, com
// as gravações, e a transação é desfeita no fim.
import {
  type PortaDoJobDoIntelligence,
  criarAcessoBanco,
  criarPortaDoJobDoIntelligence,
  tlsDaConexao,
} from '@hubkeep/db';
import { registrosDePoliticasPorModulo } from '@hubkeep/dominio';
import { expect, it } from 'vitest';
import { montarInteligencia } from '../../src/servidor/modulos/inteligencia';

const exigir = (nome: string): string => {
  const v = process.env[nome];
  if (!v) throw new Error(`${nome} não está definida (rode por pnpm ops:recalcular-inteligencia).`);
  return v;
};

class Desfazer extends Error {}

/** A mesma porta, com a transação desfeita no fim de cada dia. */
function semGravar(porta: PortaDoJobDoIntelligence): PortaDoJobDoIntelligence {
  return {
    noTenant: async (tenantId, fn) => {
      let resultado: Awaited<ReturnType<typeof fn>> | undefined;
      try {
        await porta.noTenant(tenantId, async (sessao) => {
          resultado = await fn(sessao);
          throw new Desfazer();
        });
      } catch (e) {
        if (!(e instanceof Desfazer)) throw e;
      }
      return resultado as Awaited<ReturnType<typeof fn>>;
    },
  };
}

it('recálculo do Intelligence', { timeout: 2 * 60 * 60_000 }, async () => {
  const pedido = JSON.parse(exigir('HK_RECALCULO_PEDIDO')) as {
    tenant: string;
    dias: string[];
    por: string;
  };
  const dryRun = process.env['HK_RECALCULO_DRY_RUN'] === '1';
  const url = exigir('DATABASE_URL_WORKER');
  const banco = await criarAcessoBanco({
    worker: { url, ssl: tlsDaConexao(url, process.env['HK_BANCO_SEM_TLS'] === '1') },
  });
  const porta = criarPortaDoJobDoIntelligence(banco);
  const inteligencia = montarInteligencia();
  const recalcular = inteligencia.recalculoDoDia({
    porta: dryRun ? semGravar(porta) : porta,
    registros: registrosDePoliticasPorModulo(inteligencia.extensoesDePolitica),
  });

  let gravadas = 0;
  for (const dia of pedido.dias) {
    const inicio = performance.now();
    const r = await recalcular(pedido.tenant, dia, `ops:${pedido.por}`);
    const s = ((performance.now() - inicio) / 1000).toFixed(1);
    console.log(
      r.semModulo
        ? `${dia}: sem o módulo vigente, nada gravado (${s} s)`
        : `${dia}: ${r.ativos} ativos, ${r.metricasGravadas} linhas de recálculo (${s} s)`,
    );
    gravadas += r.metricasGravadas;
  }
  console.log(
    `\n${pedido.dias.length} dias, ${gravadas} linhas de recálculo${dryRun ? ' calculadas; --dry-run: nada foi gravado' : ' gravadas'}.\n`,
  );
  expect(gravadas).toBeGreaterThanOrEqual(0);
});
