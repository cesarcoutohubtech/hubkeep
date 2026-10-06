-- ============================================================================
-- HubKeep — Migração 0030: compra, garantia e criticidade do ativo (fase 1b,
-- I1; instrumentação do Intelligence)
-- ----------------------------------------------------------------------------
-- Relatório de lacunas (docs/referencia/lacunas-instrumentacao-intelligence.md)
-- e decisões do Cesar de 05 e 06/10/2026. O ativo ganha três colunas, todas
-- anuláveis: tudo o que é novo é opcional no banco, e a obrigatoriedade,
-- quando o cliente quiser, é política no domínio (regra 7, ADR-026).
--   - data_compra e garantia_ate: hoje só existiriam como campo estendido da
--     categoria, que muda de chave conforme a categoria e não serve para
--     comparar entre hotéis;
--   - criticidade: escala fixa de 1 a 5 (Cesar, 06/10/2026). O check é
--     formato, não regra configurável. Os nomes de cada nível vêm do catálogo
--     nos quatro idiomas, e o tenant troca os nomes pela política
--     ativo.criticidade, como nas situações (ADR-027).
-- A coerência entre as datas (garantia depois da compra) fica no domínio.
-- O UPDATE das três segue a policy que já vale para o ativo: quem escreve no
-- hotel. O limite por papel é regra de ação (regra 2).
-- Só estrutura e autorização: nenhuma função, trigger ou regra de negócio.
-- ============================================================================

alter table app.ativo
  add column data_compra  date,
  add column garantia_ate date,
  add column criticidade  smallint;

alter table app.ativo
  add constraint ativo_criticidade_escala check (criticidade between 1 and 5);

grant update (data_compra, garantia_ate, criticidade) on app.ativo to hk_app;
