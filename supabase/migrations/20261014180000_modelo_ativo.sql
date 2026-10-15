-- ============================================================================
-- HubKeep — Migração 0050: modelos de ativo por categoria (fase 1b, M1;
-- ADR-028, ADR-026)
-- ----------------------------------------------------------------------------
-- Desenho da M1 em docs/referencia/propostas-desenho-pv-implantacao.md,
-- aprovado pelo Cesar em 12/10/2026. Tudo o que é regra fica no domínio e na
-- aplicação: a validação dos campos contra a definição da categoria, o formato
-- da periodicidade sugerida, quando a versão sobe, que escolher o modelo no
-- cadastro preenche só o que está vazio, e a sugestão de plano. Aqui fica só a
-- estrutura e a autorização.
--
-- app.modelo_ativo, do grupo (tenant), como as categorias (0014) e os modelos
-- de checklist (0042):
--   - categoria_id, obrigatória, com FK composta: categoria de outro tenant é
--     impossível;
--   - nome, fabricante e modelo (o modelo do fabricante), como no ativo;
--   - campos jsonb (objeto chave → valor), os valores pré-preenchidos dos
--     campos estendidos da categoria;
--   - checklist_modelo_id, anulável, com FK composta;
--   - plano_sugerido jsonb, anulável: só a periodicidade (intervalo e
--     unidade), validada pelo domínio;
--   - versao (ADR-029) e ativa (desativação lógica, sem DELETE).
-- Lê: quem cadastra ativo (Admin do grupo, Gestor CSC, Gerente do hotel,
-- Implantador e Técnico), porque o PWA baixa os modelos com os dados de
-- referência para cadastrar offline. O Solicitante e o proprietário não leem.
-- O worker lê no tenant do job (a sugestão de plano e os relatórios).
-- Grava (INSERT e UPDATE de categoria, nome, fabricante, modelo, campos,
-- checklist, plano sugerido, versão, ativa e atualizado_em): só o Admin do
-- grupo.
--
-- app.ativo.modelo_id, anulável: de que modelo o ativo nasceu, para a sugestão
-- de plano e os relatórios. A FK composta impede modelo de outro tenant. O
-- UPDATE segue a policy que já vale para o ativo: quem escreve no hotel. Os
-- dados copiados do modelo ficam no ativo (ADR-026): mudar o modelo não muda
-- o ativo já cadastrado.
--
-- O plano sugerido não muda nenhuma permissão (Cesar, 15/10/2026): ele nasce
-- pelo hk_app, com autor, por quem já cria plano; o worker não ganha INSERT em
-- app.plano_preventivo, porque plano é configuração do hotel e precisa de
-- autor.
-- Só estrutura e autorização: nenhuma função, trigger ou regra de negócio.
-- ============================================================================

create table app.modelo_ativo (
  id                  uuid primary key,
  tenant_id           uuid not null references app.tenant (id),
  categoria_id        uuid not null,
  nome                text not null,
  fabricante          text,
  modelo              text,
  campos              jsonb not null default '{}',
  checklist_modelo_id uuid,
  plano_sugerido      jsonb,
  versao              integer not null default 1,
  ativa               boolean not null default true,
  criado_em           timestamptz not null default now(),
  atualizado_em       timestamptz not null default now(),
  unique (tenant_id, id),
  constraint modelo_ativo_categoria_do_grupo
    foreign key (tenant_id, categoria_id) references app.categoria_ativo (tenant_id, id),
  constraint modelo_ativo_checklist_do_grupo
    foreign key (tenant_id, checklist_modelo_id) references app.checklist_modelo (tenant_id, id),
  constraint modelo_ativo_nome_preenchido check (length(btrim(nome)) > 0),
  constraint modelo_ativo_campos_objeto check (jsonb_typeof(campos) = 'object'),
  constraint modelo_ativo_plano_sugerido_objeto check (jsonb_typeof(plano_sugerido) = 'object'),
  constraint modelo_ativo_versao_positiva check (versao >= 1)
);
-- A lista do Admin e a escolha no cadastro do ativo: os modelos do grupo, por categoria.
create index modelo_ativo_categoria_idx on app.modelo_ativo (tenant_id, categoria_id);

alter table app.modelo_ativo enable row level security;
alter table app.modelo_ativo force row level security;

grant select, insert on app.modelo_ativo to hk_app;
grant update (categoria_id, nome, fabricante, modelo, campos, checklist_modelo_id, plano_sugerido,
              versao, ativa, atualizado_em) on app.modelo_ativo to hk_app;
grant select on app.modelo_ativo to hk_worker;

create policy app_select on app.modelo_ativo for select to hk_app
  using (
    tenant_id = (select authz.tenant_id())
    and ((select authz.eh_admin_grupo())
         or exists (select 1 from authz.hoteis_com_papel(
              array['gestor_csc', 'gerente_hotel', 'implantador', 'tecnico']::app.papel[])))
  );
create policy app_insert on app.modelo_ativo for insert to hk_app
  with check (tenant_id = (select authz.tenant_id()) and (select authz.eh_admin_grupo()));
create policy app_update on app.modelo_ativo for update to hk_app
  using (tenant_id = (select authz.tenant_id()) and (select authz.eh_admin_grupo()))
  with check (tenant_id = (select authz.tenant_id()));
create policy worker_select on app.modelo_ativo for select to hk_worker
  using (tenant_id = (select authz.tenant_sistema()));

alter table app.ativo add column modelo_id uuid;
alter table app.ativo
  add constraint ativo_modelo_do_grupo
    foreign key (tenant_id, modelo_id) references app.modelo_ativo (tenant_id, id);
create index ativo_modelo_idx on app.ativo (tenant_id, modelo_id) where modelo_id is not null;

grant update (modelo_id) on app.ativo to hk_app;
