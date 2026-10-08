-- ============================================================================
-- HubKeep — Migração 0032: modelo contratual do hotel e edificação do local
-- (fase 1b, I2)
-- ----------------------------------------------------------------------------
-- Desenho aprovado pelo Cesar em 08/10/2026 (docs/referencia/
-- propostas-desenho-1b.md, item 1).
--   - app.hotel.modelo_contratual: anulável, com check nos valores canônicos
--     do domínio (MODELOS_CONTRATUAIS, packages/dominio/src/hoteis.ts; o teste
--     tests/modelo-contratual-banco.test.ts compara a lista com este check).
--     Nulo quer dizer "não informado": os hotéis existentes ficam nulos, sem
--     padrão, e o painel de implantação mostra a pendência. No MVP é só
--     rótulo e filtro; o comportamento por modelo vem na 1c.
--     O UPDATE vai para o hk_app, sob a policy de UPDATE do hotel, que já só
--     deixa o Admin do grupo. O worker não tem UPDATE em app.hotel: o
--     conector não mexe na coluna.
--   - app.local.edificacao: texto opcional (torre, bloco), de até 60
--     caracteres, para UH e área comum. O limite e a normalização são do
--     domínio (normalizarEdificacao); o check aqui é só o teto do formato,
--     como garantia. O UPDATE vai só para o hk_app, sob a policy de escrita
--     no hotel: o worker, que atualiza nome e andar da UH vinda do sistema
--     hoteleiro, não recebe UPDATE na coluna e não sobrescreve a edificação.
--     Quem pode editar é regra de ação (regra 2).
-- Só estrutura e autorização: nenhuma função, trigger ou regra de negócio.
-- ============================================================================

alter table app.hotel
  add column modelo_contratual text;

alter table app.hotel
  add constraint hotel_modelo_contratual_lista
  check (modelo_contratual in ('proprio', 'administrado', 'arrendado', 'afiliado'));

alter table app.local
  add column edificacao text;

alter table app.local
  add constraint local_edificacao_tamanho check (char_length(edificacao) between 1 and 60);

grant update (modelo_contratual) on app.hotel to hk_app;
grant update (edificacao) on app.local to hk_app;
