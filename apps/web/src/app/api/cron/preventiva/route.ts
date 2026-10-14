// GET /api/cron/preventiva — geração da OS preventiva, uma vez por dia, às
// 05:00 de Brasília (08:00 UTC), antes do primeiro turno (ADR-007, ADR-041).
// Em cada tenant, cada hotel ativo gera na transação dele as OS dos planos
// ativos, no dia do fuso do hotel; a resposta soma as geradas, as puladas por
// motivo e os hotéis que falharam (o erro de cada um vai para o log e o
// Sentry). Volta ao vercel.json com a tarefa (B9).
import { gerarPreventivasDoTenant, tenantsDoSistema } from '../../../../servidor/composicao';
import { rotaDeCron } from '../../../../servidor/cron';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = rotaDeCron({
  nome: 'preventiva',
  tenants: tenantsDoSistema,
  porTenant: gerarPreventivasDoTenant,
});
