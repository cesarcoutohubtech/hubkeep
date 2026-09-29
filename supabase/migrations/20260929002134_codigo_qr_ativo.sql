-- ============================================================================
-- HubKeep — Migração 0018: código do QR individual do ativo (fase 1a, B5)
-- ----------------------------------------------------------------------------
-- Cada ativo tem um código curto e aleatório, impresso no QR
-- (tecnico.hubkeep.com.br/q/<codigo>), que abre o ativo pela API respeitando
-- o escopo. O código não é derivado do id e não revela nada do ativo.
--   - codigo_qr: 10 caracteres do alfabeto de Crockford em maiúsculas (sem I,
--     L, O e U, que se confundem ao digitar), gerado pela aplicação no
--     cadastro, como o id (packages/db/src/ids.ts). O check garante o formato;
--     a leitura tolerante (minúscula, O por 0, I e L por 1) é do domínio;
--   - único no tenant: o mesmo código pode existir em outro tenant, e a busca
--     pelo código passa pela RLS de app.ativo, então código de outro tenant ou
--     fora do escopo simplesmente não aparece (404 na API);
--   - sem GRANT de UPDATE: o código impresso não muda. Um QR perdido se
--     reimprime com o mesmo código;
--   - os ativos que já existem recebem um código nesta migração, uma vez só:
--     os 10 primeiros dígitos hexadecimais de um UUID aleatório, em
--     maiúsculas, que cabem no alfabeto. Daqui em diante, só a aplicação gera.
-- Só estrutura e autorização: nenhuma função, trigger ou regra de negócio.
-- ============================================================================

alter table app.ativo add column codigo_qr text;

update app.ativo
   set codigo_qr = upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10))
 where codigo_qr is null;

alter table app.ativo alter column codigo_qr set not null;
alter table app.ativo
  add constraint ativo_codigo_qr_formato check (codigo_qr ~ '^[0-9A-HJKMNP-TV-Z]{10}$');
alter table app.ativo
  add constraint ativo_codigo_qr_unico unique (tenant_id, codigo_qr);
