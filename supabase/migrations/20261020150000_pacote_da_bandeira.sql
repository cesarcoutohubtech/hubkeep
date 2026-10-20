-- ============================================================================
-- HubKeep — Migração 0059: pacote da bandeira (fase 1b, PB1; ADR-026)
-- ----------------------------------------------------------------------------
-- Desenho da PB1 em docs/referencia/propostas-desenho-pv-implantacao.md,
-- aprovado pelo Cesar em 08/10/2026, com a decisão 20 (planos do pacote numa
-- tabela própria) aprovada em 12/10/2026. Sem tabela de pacote: o pacote é o
-- que o grupo e a bandeira têm de modelos de ativo, modelos de checklist e
-- planos por categoria. Tudo o que é regra fica no domínio e na aplicação:
-- que o hotel só vê os modelos da bandeira dele e os do grupo, que aplicar o
-- pacote copia os planos pausados e sem responsável, que reaplicar só
-- acrescenta o que falta, e quem aplica. Aqui fica só a estrutura e a
-- autorização.
--
-- app.modelo_ativo.bandeira_id e app.checklist_modelo.bandeira_id, anuláveis:
-- nulo vale para o grupo inteiro. A FK composta impede bandeira de outro
-- tenant. A bandeira é campo de escopo (ADR-011, meta-teste 18) e não recebe
-- UPDATE: é escolhida na criação; para levar o modelo a outra bandeira, o
-- Admin desativa e cria outro.
--
-- app.plano_padrao, do grupo (tenant), como os modelos de ativo (0050): o
-- plano por categoria do pacote, que vira app.plano_preventivo do hotel ao
-- aplicar o pacote (o plano do hotel tem hotel_id obrigatório):
--   - bandeira_id, anulável (nulo: o grupo inteiro), com FK composta;
--   - categoria_id, obrigatória, com FK composta;
--   - nome e periodicidade (intervalo e unidade), com os mesmos checks do
--     plano do hotel (0044);
--   - checklist_modelo_id, anulável, com FK composta;
--   - versao (ADR-029) e ativa (desativação lógica, sem DELETE).
-- Lê: o Admin do grupo e quem aplica o pacote ou gere os planos do hotel
-- (Gestor CSC, Gerente do hotel e Implantador). O Técnico, o Solicitante e o
-- proprietário não leem. O worker não lê: o pacote só é aplicado por pessoa.
-- Grava (INSERT, e UPDATE de categoria, nome, periodicidade, checklist,
-- versão, ativa e atualizado_em; a bandeira, como nos modelos, não muda): só o
-- Admin do grupo.
--
-- app.plano_preventivo.plano_padrao_id, anulável: de que plano do pacote o
-- plano do hotel foi copiado. Único por hotel, para reaplicar o pacote não
-- duplicar o plano, nem numa corrida. Sem GRANT de UPDATE: a origem não muda
-- depois da cópia, e mudar o pacote não muda o plano já copiado (ADR-026). O
-- INSERT segue a policy que já vale para o plano do hotel (0044).
-- Só estrutura e autorização: nenhuma função, trigger ou regra de negócio.
-- ============================================================================

alter table app.modelo_ativo add column bandeira_id uuid;
alter table app.modelo_ativo
  add constraint modelo_ativo_bandeira_do_grupo
    foreign key (tenant_id, bandeira_id) references app.bandeira (tenant_id, id);
create index modelo_ativo_bandeira_idx on app.modelo_ativo (tenant_id, bandeira_id);

alter table app.checklist_modelo add column bandeira_id uuid;
alter table app.checklist_modelo
  add constraint checklist_modelo_bandeira_do_grupo
    foreign key (tenant_id, bandeira_id) references app.bandeira (tenant_id, id);
create index checklist_modelo_bandeira_idx on app.checklist_modelo (tenant_id, bandeira_id);

create table app.plano_padrao (
  id                  uuid primary key,
  tenant_id           uuid not null references app.tenant (id),
  bandeira_id         uuid,
  categoria_id        uuid not null,
  nome                text not null,
  intervalo           integer not null,
  unidade             text not null,
  checklist_modelo_id uuid,
  versao              integer not null default 1,
  ativa               boolean not null default true,
  criado_em           timestamptz not null default now(),
  atualizado_em       timestamptz not null default now(),
  unique (tenant_id, id),
  constraint plano_padrao_bandeira_do_grupo
    foreign key (tenant_id, bandeira_id) references app.bandeira (tenant_id, id),
  constraint plano_padrao_categoria_do_grupo
    foreign key (tenant_id, categoria_id) references app.categoria_ativo (tenant_id, id),
  constraint plano_padrao_checklist_do_grupo
    foreign key (tenant_id, checklist_modelo_id) references app.checklist_modelo (tenant_id, id),
  constraint plano_padrao_unidade_lista check (unidade in ('dia', 'semana', 'mes')),
  constraint plano_padrao_intervalo_positivo check (intervalo >= 1),
  constraint plano_padrao_nome_preenchido check (length(btrim(nome)) > 0),
  constraint plano_padrao_versao_positiva check (versao >= 1)
);
-- A lista do Admin e a aplicação ao hotel: os planos do pacote, por bandeira.
create index plano_padrao_bandeira_idx on app.plano_padrao (tenant_id, bandeira_id);

alter table app.plano_padrao enable row level security;
alter table app.plano_padrao force row level security;

grant select, insert on app.plano_padrao to hk_app;
grant update (categoria_id, nome, intervalo, unidade, checklist_modelo_id, versao,
              ativa, atualizado_em) on app.plano_padrao to hk_app;

create policy app_select on app.plano_padrao for select to hk_app
  using (
    tenant_id = (select authz.tenant_id())
    and ((select authz.eh_admin_grupo())
         or exists (select 1 from authz.hoteis_com_papel(
              array['gestor_csc', 'gerente_hotel', 'implantador']::app.papel[])))
  );
create policy app_insert on app.plano_padrao for insert to hk_app
  with check (tenant_id = (select authz.tenant_id()) and (select authz.eh_admin_grupo()));
create policy app_update on app.plano_padrao for update to hk_app
  using (tenant_id = (select authz.tenant_id()) and (select authz.eh_admin_grupo()))
  with check (tenant_id = (select authz.tenant_id()));

alter table app.plano_preventivo add column plano_padrao_id uuid;
alter table app.plano_preventivo
  add constraint plano_preventivo_padrao_do_grupo
    foreign key (tenant_id, plano_padrao_id) references app.plano_padrao (tenant_id, id),
  add constraint plano_preventivo_padrao_unico unique (hotel_id, plano_padrao_id);
