-- ============================================================================
-- HubKeep — Migração 0002: limites por papel de banco (F0-03)
-- ----------------------------------------------------------------------------
-- Parâmetro de infraestrutura, não regra de negócio: quanto cada papel pode
-- ocupar do banco e por quanto tempo. LOGIN e senha NÃO moram aqui — são
-- definidos por ambiente, fora do git, por scripts/ops/configurar-papeis.ts.
--
-- Orçamento de conexões: o menor compute do Supabase (Nano/Micro) tem
-- max_connections = 60. Os três papéis somam 40, e sobram ~20 para o que o
-- próprio Supabase mantém aberto (Auth, Storage, Supavisor, postgres).
--
--   papel        conexões  statement_timeout  idle_in_transaction
--   hk_app          30          8s                  10s
--   hk_worker        5         30s                  15s
--   hk_ingestao      5         15s                  10s
--
-- hk_app: requisições de usuário via Supavisor em modo transação. Consulta de
--   tela passa de 8s só por defeito, e o banco deve cortá-la antes que a função
--   da Vercel morra sem resposta. Transação de API é curta; parada 10s segurando
--   lock é conexão perdida (ex.: exceção sem rollback).
-- hk_worker: cron do outbox, SLA e preventiva, um tenant por transação e em
--   lotes. Precisa de mais fôlego por instrução que a API, mas um lote que passa
--   de 30s tem de ser menor, não mais lento. Poucos em paralelo: 5.
-- hk_ingestao: lotes do agente conector de até 4,5 MB (limite da Vercel), com
--   upsert em staging. 15s cobre o maior lote com folga; 5 conexões porque há
--   um agente por cliente e ele envia em série.
--
-- hk_backoffice e hk_authz ficam sem limite próprio: não têm LOGIN.
-- O meta-teste 14 confere estes valores.
-- ============================================================================

alter role hk_app      connection limit 30;
alter role hk_app      set statement_timeout = '8s';
alter role hk_app      set idle_in_transaction_session_timeout = '10s';

alter role hk_worker   connection limit 5;
alter role hk_worker   set statement_timeout = '30s';
alter role hk_worker   set idle_in_transaction_session_timeout = '15s';

alter role hk_ingestao connection limit 5;
alter role hk_ingestao set statement_timeout = '15s';
alter role hk_ingestao set idle_in_transaction_session_timeout = '10s';
