-- ============================================================================
-- HubKeep — Migração 0047: responsável do arrendamento na OS (fase 1c, item 6;
-- ADR-045)
-- ----------------------------------------------------------------------------
-- Decisões 5 a 8 do Cesar, de 13/10/2026 (docs/13-plano-fase-1c.md). A matriz
-- do hotel arrendado é a política hotel.matriz_arrendamento (grupo → hotel),
-- e quem responde por cada OS é regra do domínio (responsavelDoArrendamento,
-- pela categoria do chamado). O banco guarda só a marca e a hora do aviso:
--   - app.os.responsavel_arrendamento: 'arrendataria' ou 'locador', com os
--     valores do domínio (RESPONSAVEIS_DO_ARRENDAMENTO; teste de paridade no
--     PR do código). Nulo fora do hotel arrendado e nas OS anteriores a esta
--     migração: elas ficam sem marca, sem preenchimento retroativo;
--   - app.os.locador_avisado_em: a hora em que o aviso ao locador saiu, uma
--     vez por OS (decisão 8). Fica gravada mesmo que a marca volte para a
--     arrendatária depois: o aviso aconteceu;
--   - quem grava é o hk_app: na geração da OS (o INSERT da tabela já cobre as
--     colunas novas) e no ajuste da marca na triagem (UPDATE por coluna). A
--     OS preventiva, gerada pelo worker, entra com a marca pelo INSERT que a
--     migração da PV3 (1b) dá ao hk_worker.
-- Risco aceito (como na 0023, 0026 e 0041): o GRANT por coluna vale para
-- todos os papéis do hk_app que passam na policy de UPDATE da OS; quem pode
-- ajustar a marca, e quando, é do domínio, e toda gravação fica na auditoria.
-- O locador (o proprietário do hotel, ADR-031) só lê: a policy de leitura da
-- OS já o alcança, e ele não passa na de UPDATE.
-- Índice parcial para o filtro "do locador". Campos de escopo seguem sem
-- UPDATE (meta-teste 18). Sem DELETE; nenhuma função, trigger ou regra de
-- negócio.
-- ============================================================================

alter table app.os add column responsavel_arrendamento text;
alter table app.os add column locador_avisado_em timestamptz;
alter table app.os
  add constraint os_responsavel_arrendamento_lista
    check (responsavel_arrendamento in ('arrendataria', 'locador'));

grant update (responsavel_arrendamento, locador_avisado_em) on app.os to hk_app;

create index os_do_locador_idx on app.os (tenant_id, hotel_id, criado_em desc)
  where responsavel_arrendamento = 'locador';
