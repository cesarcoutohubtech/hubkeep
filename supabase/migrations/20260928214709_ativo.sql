-- ============================================================================
-- HubKeep — Migração 0015: ativos (fase 1a, B3; ADR-028 e ADR-029)
-- ----------------------------------------------------------------------------
-- O ativo fica num local do hotel e, opcionalmente, numa categoria do tenant.
-- Tudo o que é regra fica no domínio (packages/dominio): quem cadastra, a
-- validação dos campos estendidos contra a categoria (campos-tipados.ts) e o
-- conflito de versão. O banco guarda estrutura:
--   - local_id e hotel_id não mudam (ADR-011, meta-teste 18): o local decide
--     o que o proprietário vê, então trocar o ativo de local mudaria o escopo
--     da linha. A FK (hotel_id, local_id) impede local de outro hotel;
--   - categoria_id é opcional: "ativos sem categoria" é pendência do painel de
--     implantação (A5); a FK composta impede categoria de outro tenant;
--   - campos jsonb (objeto chave → valor), validado pela aplicação;
--   - versao (ADR-029): o UPDATE leva "where versao = $esperada" e incrementa;
--     sem linha afetada, o caso de uso devolve 409 conflito_de_versao;
--   - desativado_em (desativação lógica, sem DELETE).
-- Lê: quem lê o hotel e o proprietário, só nos locais dele (UH ou hotel
-- inteiro, por authz.locais_proprietario()). Grava: quem escreve no hotel; o
-- limite por papel (quem cadastra ativo) é regra de ação (regra 2).
-- Só estrutura e autorização: nenhuma função, trigger ou regra de negócio.
-- ============================================================================

create table app.ativo (
  id            uuid primary key,
  tenant_id     uuid not null,
  hotel_id      uuid not null,
  local_id      uuid not null,
  categoria_id  uuid,
  nome          text not null,
  fabricante    text,
  modelo        text,
  numero_serie  text,
  campos        jsonb not null default '{}',
  versao        integer not null default 1,
  desativado_em timestamptz,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (tenant_id, id),
  unique (hotel_id, id),
  foreign key (tenant_id, hotel_id) references app.hotel (tenant_id, id),
  foreign key (hotel_id, local_id) references app.local (hotel_id, id),
  foreign key (tenant_id, categoria_id) references app.categoria_ativo (tenant_id, id),
  constraint ativo_nome_preenchido check (length(btrim(nome)) > 0),
  constraint ativo_campos_objeto check (jsonb_typeof(campos) = 'object'),
  constraint ativo_versao_positiva check (versao >= 1)
);
create index ativo_hotel_idx on app.ativo (tenant_id, hotel_id);
create index ativo_local_idx on app.ativo (hotel_id, local_id);
create index ativo_categoria_idx on app.ativo (tenant_id, categoria_id);

alter table app.ativo enable row level security;
alter table app.ativo force row level security;

grant select, insert on app.ativo to hk_app;
grant update (categoria_id, nome, fabricante, modelo, numero_serie, campos, versao,
              desativado_em, atualizado_em) on app.ativo to hk_app;
grant select on app.ativo to hk_worker;

create policy app_select on app.ativo for select to hk_app
  using (
    tenant_id = (select authz.tenant_id())
    and (hotel_id in (select authz.hoteis_leitura())
         or local_id in (select lp.local_id from authz.locais_proprietario() lp))
  );
create policy app_insert on app.ativo for insert to hk_app
  with check (tenant_id = (select authz.tenant_id())
              and hotel_id in (select authz.hoteis_escrita()));
create policy app_update on app.ativo for update to hk_app
  using (tenant_id = (select authz.tenant_id())
         and hotel_id in (select authz.hoteis_escrita()))
  with check (tenant_id = (select authz.tenant_id())
              and hotel_id in (select authz.hoteis_escrita()));
create policy worker_select on app.ativo for select to hk_worker
  using (tenant_id = (select authz.tenant_sistema()));
