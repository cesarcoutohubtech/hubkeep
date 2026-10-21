-- ============================================================================
-- HubKeep — Migração 0061: códigos de QR reservados (fase 1b, M3)
-- ----------------------------------------------------------------------------
-- Desenho da M3 em docs/referencia/propostas-desenho-pv-implantacao.md, com a
-- decisão 21 aprovada pelo Cesar em 12/10/2026: a etiqueta reservada serve só
-- para ativo novo (app.ativo.codigo_qr continua sem UPDATE). O implantador
-- gera um lote de códigos para o hotel antes do cadastro, imprime e cola as
-- etiquetas, e o ativo é cadastrado depois, pelo PWA, a partir da etiqueta.
--
-- app.qr_reservado, só de inserção (meta-teste 32), do hotel:
--   - codigo: o mesmo formato do código do ativo (0018) e único no tenant;
--   - lote_id: agrupa os códigos gerados de uma vez, para imprimir de novo a
--     folha do lote. Não é tabela: só um identificador gerado pela aplicação;
--   - criado_por, igual a quem grava, com FK composta para o membro.
-- Não há coluna de ligação. Ligar a etiqueta é cadastrar o ativo com o
-- código reservado: o código está ligado quando existe ativo com ele, e a
-- unicidade de app.ativo (tenant_id, codigo_qr) impede ligar duas vezes, sem
-- UPDATE aqui. Que o código esteja reservado no hotel do ativo e livre, que a
-- geração não repita código de ativo, o tamanho do lote e quem gera ficam na
-- aplicação e no domínio.
-- Lê e grava: quem escreve no hotel (a policy usa hoteis_escrita). O
-- proprietário não lê. A aplicação restringe a geração ao Implantador e à
-- gestão do hotel; o técnico só lê, para cadastrar o ativo da etiqueta. O
-- worker não lê.
-- Só estrutura e autorização: nenhuma função, trigger ou regra de negócio.
-- ============================================================================

create table app.qr_reservado (
  id         uuid primary key,
  tenant_id  uuid not null references app.tenant (id),
  hotel_id   uuid not null,
  codigo     text not null,
  lote_id    uuid not null,
  criado_por uuid not null,
  criado_em  timestamptz not null default now(),
  unique (tenant_id, id),
  constraint qr_reservado_codigo_unico unique (tenant_id, codigo),
  constraint qr_reservado_codigo_formato check (codigo ~ '^[0-9A-HJKMNP-TV-Z]{10}$'),
  constraint qr_reservado_hotel_do_tenant
    foreign key (tenant_id, hotel_id) references app.hotel (tenant_id, id),
  constraint qr_reservado_criado_por_membro
    foreign key (tenant_id, criado_por) references app.membro (tenant_id, usuario_id)
);
-- A lista do hotel e a folha de um lote.
create index qr_reservado_hotel_lote_idx on app.qr_reservado (tenant_id, hotel_id, lote_id);

alter table app.qr_reservado enable row level security;
alter table app.qr_reservado force row level security;

grant select, insert on app.qr_reservado to hk_app;

create policy app_select on app.qr_reservado for select to hk_app
  using (
    tenant_id = (select authz.tenant_id())
    and hotel_id in (select authz.hoteis_escrita())
  );
create policy app_insert on app.qr_reservado for insert to hk_app
  with check (
    tenant_id = (select authz.tenant_id())
    and hotel_id in (select authz.hoteis_escrita())
    and criado_por = (select authz.usuario_id())
  );
