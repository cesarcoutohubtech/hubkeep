// A observabilidade do job diário do Intelligence (atividade 2b do Kaio,
// proposta aprovada pelo Cesar em 13/10/2026):
//
// - uma linha de log por tenant (inteligencia.job.tenant), com a duração, o
//   resultado (ok, sem_modulo ou falha) e os números do resumo; o erro em si
//   continua indo para o log e o Sentry pelo rotaDeCron (registrarErro);
// - uma linha de log por rodada (inteligencia.job.rodada), com a duração, o
//   status da resposta e os tenants que falharam;
// - um check-in de cron no Sentry ao fim de cada rodada: 'ok' quando todos os
//   tenants rodaram, 'error' quando um falhou ou a rota não rodou (503, 500).
//   O monitor tem o horário do vercel.json: se a rodada não acontece, o Sentry
//   marca a falta sozinho. O alerta é a regra de alerta do projeto no Sentry
//   para os problemas do monitor (docs/referencia/observabilidade-job-inteligencia.md).
//
// O 401 (segredo errado) não manda check-in: é quem não é a Vercel Cron, e um
// 'ok' ou 'error' dele confundiria o monitor.
import type { ResumoDoJob } from '@hubkeep/inteligencia';

/** O nome do monitor no Sentry. */
export const MONITOR_DO_JOB = 'inteligencia-job-diario';

/** O mesmo horário do vercel.json (06:00 UTC, 03:00 de Brasília; teste confere). */
export const HORARIO_DO_JOB = '0 6 * * *';

export interface CheckInDoJob {
  monitorSlug: string;
  status: 'ok' | 'error';
  /** Em segundos. */
  duration: number;
}

export interface ConfigDoMonitor {
  schedule: { type: 'crontab'; value: string };
  /** Minutos de tolerância depois do horário antes de marcar a falta. */
  checkinMargin: number;
  timezone: string;
  failureIssueThreshold: number;
  recoveryThreshold: number;
}

export const CONFIG_DO_MONITOR: ConfigDoMonitor = {
  schedule: { type: 'crontab', value: HORARIO_DO_JOB },
  checkinMargin: 30,
  timezone: 'Etc/UTC',
  failureIssueThreshold: 1,
  recoveryThreshold: 1,
};

type RegistrarDoJob = (
  nivel: 'info' | 'error',
  evento: string,
  campos: Record<string, unknown>,
) => void;

export interface DepsDaObservacao {
  registrar: RegistrarDoJob;
  checkIn: (checkIn: CheckInDoJob, config: ConfigDoMonitor) => Promise<void>;
  /** Só nos testes. */
  medir?: () => number;
}

export interface ObservacaoDoJob {
  /** Envolve o job de um tenant: mede e registra, e devolve (ou lança) o mesmo. */
  porTenant(
    job: (tenantId: string) => Promise<ResumoDoJob>,
  ): (tenantId: string) => Promise<ResumoDoJob>;
  /** Envolve a rota do cron: mede a rodada, registra e manda o check-in. */
  rodada(handler: (req: Request) => Promise<Response>): (req: Request) => Promise<Response>;
}

function falhasDoCorpo(corpo: unknown): string[] | null {
  if (corpo === null || typeof corpo !== 'object' || !('falhas' in corpo)) return null;
  const { falhas } = corpo;
  return Array.isArray(falhas) ? falhas.map(String) : null;
}

export function criarObservacaoDoJob(deps: DepsDaObservacao): ObservacaoDoJob {
  const medir = deps.medir ?? (() => performance.now());
  return {
    porTenant: (job) => async (tenantId) => {
      const inicio = medir();
      try {
        const r = await job(tenantId);
        deps.registrar('info', 'inteligencia.job.tenant', {
          tenant_id: tenantId,
          resultado: r.semModulo ? 'sem_modulo' : 'ok',
          duracao_ms: Math.round(medir() - inicio),
          dia: r.dia,
          ativos: r.ativos,
          metricas_gravadas: r.metricasGravadas,
          metricas_ja_gravadas: r.metricasJaGravadas,
          insights_abertos: r.insightsAbertos,
          insights_atualizados: r.insightsAtualizados,
        });
        return r;
      } catch (e) {
        deps.registrar('error', 'inteligencia.job.tenant', {
          tenant_id: tenantId,
          resultado: 'falha',
          duracao_ms: Math.round(medir() - inicio),
        });
        throw e;
      }
    },
    rodada: (handler) => async (req) => {
      const inicio = medir();
      const resposta = await handler(req);
      if (resposta.status === 401) return resposta;
      const falhas =
        resposta.status === 200
          ? falhasDoCorpo(
              await resposta
                .clone()
                .json()
                .catch(() => null),
            )
          : null;
      const ok = falhas !== null && falhas.length === 0;
      const duracao = medir() - inicio;
      deps.registrar(ok ? 'info' : 'error', 'inteligencia.job.rodada', {
        resultado: ok ? 'ok' : 'falha',
        status: resposta.status,
        duracao_ms: Math.round(duracao),
        falhas: falhas ?? [],
      });
      // O check-in que não chega não muda a resposta: o monitor marca a falta.
      await deps
        .checkIn(
          { monitorSlug: MONITOR_DO_JOB, status: ok ? 'ok' : 'error', duration: duracao / 1000 },
          CONFIG_DO_MONITOR,
        )
        .catch(() => undefined);
      return resposta;
    },
  };
}
