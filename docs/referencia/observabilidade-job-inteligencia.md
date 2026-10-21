# Observabilidade do job do Intelligence e recálculo de um período

Este documento cobre as atividades 2b e 2c do Kaio de 12/10/2026, aprovadas pelo Cesar em 13/10/2026. Os números de tempo estão em `carga-job-inteligencia.md`.

## O que cada rodada deixa

A rota `/api/cron/inteligencia` roda uma vez por dia, às 06:00 UTC (`vercel.json`). Cada rodada deixa:

| Onde | O quê |
|---|---|
| Log, `inteligencia.job.tenant` | Uma linha por tenant: `tenant_id`, `resultado` (`ok`, `sem_modulo` ou `falha`), `duracao_ms`, `dia`, `ativos`, `metricas_gravadas`, `metricas_ja_gravadas`, `insights_abertos` e `insights_atualizados`. |
| Log, `erro_tratado` e Sentry | O erro do tenant que falhou, como nos outros crons (`rotaDeCron`). |
| Log, `inteligencia.job.rodada` | Uma linha por rodada: `resultado` (`ok` ou `falha`), `status` da resposta, `duracao_ms` e `falhas`, a lista dos tenants que falharam. |
| Log, `http` | A linha de todo pedido, com `rota: cron.inteligencia`. |
| Sentry, monitor `inteligencia-job-diario` | Um check-in ao fim da rodada: `ok` quando todos os tenants rodaram, `error` quando um falhou ou a rota não rodou (503 sem `CRON_SECRET`, 500). |
| Auditoria, `job_inteligencia` | O registro de cada execução num tenant com o módulo vigente (`calcular_dia` ou `recalcular_dia`), como antes. Desde a 0061, traz `metricasNaParticaoPadrao`: as linhas do dia que caíram na partição padrão da métrica, porque o mês delas ainda não foi criado. Diferente de zero, é hora da migração do ano seguinte. |

O pedido com o segredo errado (401) não manda check-in.

Para achar uma rodada nos logs da Vercel, filtre por `inteligencia.job.rodada`. Para ver um tenant, filtre por `inteligencia.job.tenant` e pelo `tenant_id`.

## O monitor e o alerta no Sentry

O próprio check-in cria e atualiza o monitor no Sentry, com esta configuração (`observabilidade.ts`):

- horário `0 6 * * *`, no fuso `Etc/UTC`, o mesmo do `vercel.json` (um teste confere);
- 30 minutos de tolerância: sem check-in até 06:30 UTC, o Sentry marca a rodada como perdida;
- o problema abre na primeira falha ou falta e fecha no primeiro `ok`.

Sem `SENTRY_DSN`, nada vai ao Sentry e fica só o log.

Passos do Cesar quando o `SENTRY_DSN` entrar na Vercel:

1. Depois da primeira rodada, conferir que o monitor `inteligencia-job-diario` aparece em Crons, no projeto do Sentry.
2. Criar a regra de alerta dos problemas do monitor e dizer quem a recebe (e-mail ou outro canal do projeto). Sem essa regra, o problema abre no Sentry, mas ninguém recebe aviso.
3. Para testar, rodar a rota uma vez sem `CRON_SECRET` num preview. A resposta é 503, o check-in vai como `error` e o alerta deve chegar.

## Recálculo de um período

```bash
pnpm ops:recalcular-inteligencia --ambiente dev --tenant <uuid> \
  --de 2026-09-01 --ate 2026-09-30 --por "Cesar" --dry-run
pnpm ops:recalcular-inteligencia --ambiente dev --tenant <uuid> \
  --de 2026-09-01 --ate 2026-09-30 --por "Cesar"
```

- **Ambientes:** só dev e staging. Produção entra com o roteiro de operação dela (F0-12). Antes de qualquer conexão, o script confere que as variáveis do web do ambiente são do projeto certo, como o `ops:provisionar`.
- **O que grava (ADR-036):**
  - Para cada dia, do `--de` ao `--ate`, cada um numa transação do `hk_worker`, grava outra linha da métrica por ativo. A linha leva o número de cálculo seguinte, `recalculo = true` e as versões das fórmulas do código de hoje.
  - A linha original fica. Os insights não mudam.
  - A auditoria recebe `recalcular_dia`, com `disparadoPor` `ops:<por>`.
  - O dia em que o módulo não estava vigente não grava nada.
- **Onde aparece:** na página do ativo do Intelligence, no bloco "Como este resultado foi gravado", o botão **Ver os recálculos deste dia** lista os recálculos do último dia gravado, com o número do cálculo, quando, a atenção, a reincidência e as versões. O painel e os insights continuam no original. No dia que o job nunca gravou, o primeiro recálculo é o resultado do dia e aparece como "Recálculo 1".
- **Limites:** no máximo 366 dias por pedido, e só dias que já terminaram, em UTC, como o motor corta o dia. Pela carga, cada dia leva cerca de 6 s no piloto, então um ano leva perto de 40 minutos.
- **`--dry-run`:** roda cada dia inteiro, com as gravações, e desfaz a transação. Mostra os números e não deixa nada.
- **Falha no meio:** o dia que falha para o pedido, e os anteriores já ficaram gravados. Rodar o mesmo período de novo grava mais um cálculo desses dias, o que o recálculo permite; para não repetir, recomece do dia que falhou.
