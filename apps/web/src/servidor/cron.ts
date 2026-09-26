// Rotas de cron (ADR-007, F0-09): chamadas pela Vercel Cron com
// Authorization: Bearer <CRON_SECRET>, rodam com hk_worker, um tenant por
// transação, e um tenant com erro não bloqueia os outros.
//
// Falha fechada: sem CRON_SECRET no ambiente, a rota responde 503 e não roda
// nada; com segredo errado, 401. A comparação é em tempo constante.
import { timingSafeEqual } from 'node:crypto';
import { rodarPorTenant } from '@hubkeep/aplicacao';
import { ErroHttp, rota } from './http';

/** Confere o cabeçalho da Vercel Cron contra CRON_SECRET. */
export function exigirSegredoDoCron(req: Request, segredo: string | undefined): void {
  if (!segredo) throw new ErroHttp(503, 'cron_nao_configurado');
  const recebido = Buffer.from(req.headers.get('authorization') ?? '');
  const esperado = Buffer.from(`Bearer ${segredo}`);
  if (recebido.length !== esperado.length || !timingSafeEqual(recebido, esperado)) {
    throw new ErroHttp(401, 'nao_autenticado', { motivo: 'segredo_do_cron' });
  }
}

type Totais = Record<string, number>;

/** Soma os campos numéricos dos resultados de cada tenant. */
function somar(resultados: readonly unknown[]): Totais {
  const totais: Totais = {};
  for (const r of resultados) {
    if (r === null || typeof r !== 'object') continue;
    for (const [k, v] of Object.entries(r)) {
      if (typeof v === 'number') totais[k] = (totais[k] ?? 0) + v;
    }
  }
  return totais;
}

export interface TarefaDeCron {
  nome: string;
  tenants: () => Promise<readonly string[]>;
  porTenant: (tenantId: string) => Promise<unknown>;
  /** Só nos testes. */
  segredo?: () => string | undefined;
}

export function rotaDeCron(t: TarefaDeCron, deps: Parameters<typeof rota>[2] = {}) {
  return rota(
    `cron.${t.nome}`,
    async (r) => {
      exigirSegredoDoCron(r.req, (t.segredo ?? (() => process.env['CRON_SECRET']))());
      const resultado = await rodarPorTenant(t.tenants, t.porTenant);
      for (const f of resultado.falhas) r.registrarErro(f.erro, { tenant_id: f.tenantId });
      return r.json(200, {
        tarefa: t.nome,
        tenants: resultado.tenants,
        concluidos: resultado.concluidos.length,
        falhas: resultado.falhas.map((f) => f.tenantId),
        totais: somar(resultado.concluidos.map((c) => c.resultado)),
      });
    },
    deps,
  );
}
