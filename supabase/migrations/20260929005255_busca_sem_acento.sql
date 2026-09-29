-- ============================================================================
-- HubKeep — Migração 0019: busca por trecho, sem acento (fase 1a, B6; ADR-030)
-- ----------------------------------------------------------------------------
-- A busca de locais e ativos acha "Açúcar" digitando "acucar" e "Refrigerador"
-- digitando "frig". Nada disso é função do banco (regra 4):
--   - coluna `busca` em app.local e app.ativo: o texto sem acento e em
--     minúsculas, gravado pela aplicação com a função de packages/i18n
--     (textoDeBusca) em todo INSERT e UPDATE que muda os campos pesquisáveis
--     (local: nome; ativo: nome, fabricante, modelo e número de série);
--   - extensão pg_trgm no schema extensions e índice GIN de trigramas na
--     coluna. A consulta é `busca ILIKE '%termo%'`, operador padrão do
--     Postgres, com o termo normalizado pela mesma função;
--   - o default '' só cobre as linhas gravadas fora da aplicação (fixtures dos
--     testes, que inserem como superusuário). A aplicação sempre grava; os
--     testes de integração conferem cada caminho de gravação;
--   - os registros que já existem recebem o texto nesta migração, uma vez só,
--     com translate() e lower(), que dão o mesmo resultado da função para as
--     letras acentuadas do português, do espanhol e do francês (o par de
--     letras está repetido no teste de packages/i18n);
--   - GRANT de UPDATE da coluna para quem já altera o nome: hk_app nos dois e
--     hk_worker no local (promoção de UHs).
-- Sem função nova no projeto: o meta-teste 11 continua fechado, e as funções
-- da extensão ficam na exceção de extensões do meta-teste 22. O meta-teste 25
-- fecha a lista de extensões.
-- ============================================================================

create extension if not exists pg_trgm with schema extensions;

alter table app.local add column busca text not null default '';
alter table app.ativo add column busca text not null default '';

update app.local
   set busca = lower(translate(nome,
     'ÁÀÂÃÄÅáàâãäåÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñÝýÿ',
     'AAAAAAaaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNnYyy'));

update app.ativo
   set busca = lower(translate(
     concat_ws(' ', nome, fabricante, modelo, numero_serie),
     'ÁÀÂÃÄÅáàâãäåÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñÝýÿ',
     'AAAAAAaaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNnYyy'));

create index local_busca_trgm_idx on app.local using gin (busca extensions.gin_trgm_ops);
create index ativo_busca_trgm_idx on app.ativo using gin (busca extensions.gin_trgm_ops);

grant update (busca) on app.local to hk_app, hk_worker;
grant update (busca) on app.ativo to hk_app;
