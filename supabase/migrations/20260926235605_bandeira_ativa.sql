-- ============================================================================
-- HubKeep — Migração 0008: bandeira ativa ou desativada (fase 1a, A2)
-- ----------------------------------------------------------------------------
-- Desativação lógica de bandeira (regra do CLAUDE.md: nenhum papel tem DELETE).
-- A bandeira desativada continua ligada aos hotéis que já a têm, mas não é
-- oferecida para escolha; a regra de não ligar hotel a bandeira desativada é
-- da aplicação (domínio). Quem cria, renomeia e desativa é o Admin do grupo,
-- pela policy de UPDATE que já existe (fundação).
-- Só estrutura: nenhuma função, trigger ou regra de negócio nova.
-- ============================================================================
alter table app.bandeira add column ativa boolean not null default true;

grant update (ativa) on app.bandeira to hk_app;
