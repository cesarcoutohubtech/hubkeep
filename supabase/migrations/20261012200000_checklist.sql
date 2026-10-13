-- ============================================================================
-- HubKeep — Migração 0042: checklist tipado (fase 1b, PV1; ADR-040, ADR-028,
-- ADR-026)
-- ----------------------------------------------------------------------------
-- Desenho aprovado pelo Cesar em 12/10/2026, com o ADR-040 e as decisões 1 a
-- 5 de docs/referencia/propostas-desenho-pv-implantacao.md. Tudo o que é
-- regra fica no domínio e na aplicação: o formato dos itens (os campos
-- tipados do ADR-028, até 50), quando a versão sobe, o tipo de item que não
-- muda, a validação das respostas, quem aplica e quando, a troca do modelo só
-- sem resposta e a política os.checklist_completo_obrigatorio. Aqui fica só
-- a estrutura e a autorização.
--
-- app.checklist_modelo, do grupo (tenant), como as categorias (0014) e os
-- códigos de manutenção (0036):
--   - nomes jsonb por idioma, com ao menos um (o modelo não tem chave padrão
--     no catálogo);
--   - categoria_id, anulável, com FK composta: só sugere e filtra o modelo;
--   - itens jsonb, a lista de definições de campo tipado;
--   - versao, o contador que o domínio sobe a cada gravação dos itens;
--   - ativa: desativação lógica, sem DELETE.
-- Lê: a gestão (Admin do grupo, Gestor CSC e Gerente do hotel) e o
-- Implantador. O Técnico, o Solicitante e o proprietário não leem o modelo; o
-- Técnico lê só a cópia na OS dele. O worker lê no tenant do job (a PV3 aplica
-- o checklist do plano na OS preventiva).
-- Grava (INSERT e UPDATE de categoria, nomes, itens, versão, ativa e
-- atualizado_em): só o Admin do grupo.
--
-- app.os_checklist, uma por OS: a cópia dos nomes, dos itens e da versão do
-- modelo aplicado (ADR-026: mudar o modelo não altera a OS que já tem
-- checklist), e as respostas. Tabela à parte, e não colunas em app.os, para
-- responder o checklist não subir a versão da OS: a conclusão que vem depois
-- na fila offline do aparelho seria recusada por conflito (ADR-029).
--   - FK (hotel_id, os_id) → app.os e único por OS;
--   - FK (tenant_id, modelo_id) → app.checklist_modelo: modelo de outro tenant
--     é impossível;
--   - respostas jsonb, um objeto por item (valor, hora no aparelho e quem
--     respondeu), validado pelo domínio contra a cópia.
-- Lê: quem lê a OS (a policy consulta app.os, que não consulta esta tabela:
-- sem ciclo, meta-teste 27). Insere: a gestão do hotel (quem tria), em nome
-- dela mesma; a PV3 dá o INSERT ao worker. Altera: a gestão do hotel e o
-- Técnico responsável pela OS (ele, ou uma equipe ativa de que é membro).
-- Risco aceito, como na 0023: o GRANT por coluna vale para todos os papéis do
-- hk_app, então o responsável tem UPDATE, no banco, também no modelo e nos
-- itens da cópia, que só a gestão troca (e só sem resposta). A aplicação nunca
-- grava essas colunas por ele, e toda gravação fica na auditoria.
-- Só estrutura e autorização: nenhuma função, trigger ou regra de negócio.
-- ============================================================================

create table app.checklist_modelo (
  id            uuid primary key,
  tenant_id     uuid not null references app.tenant (id),
  categoria_id  uuid,
  nomes         jsonb not null,
  itens         jsonb not null default '[]',
  versao        integer not null default 1,
  ativa         boolean not null default true,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (tenant_id, id),
  constraint checklist_modelo_categoria_do_grupo
    foreign key (tenant_id, categoria_id) references app.categoria_ativo (tenant_id, id),
  constraint checklist_modelo_nomes_objeto
    check (jsonb_typeof(nomes) = 'object' and nomes <> '{}'::jsonb),
  constraint checklist_modelo_itens_lista check (jsonb_typeof(itens) = 'array'),
  constraint checklist_modelo_versao_positiva check (versao >= 1)
);
-- A lista do Admin e a escolha na triagem: os modelos do grupo, por categoria.
create index checklist_modelo_categoria_idx on app.checklist_modelo (tenant_id, categoria_id);

alter table app.checklist_modelo enable row level security;
alter table app.checklist_modelo force row level security;

grant select, insert on app.checklist_modelo to hk_app;
grant update (categoria_id, nomes, itens, versao, ativa, atualizado_em) on app.checklist_modelo to hk_app;
grant select on app.checklist_modelo to hk_worker;

create policy app_select on app.checklist_modelo for select to hk_app
  using (
    tenant_id = (select authz.tenant_id())
    and ((select authz.eh_admin_grupo())
         or exists (select 1 from authz.hoteis_com_papel(
              array['gestor_csc', 'gerente_hotel', 'implantador']::app.papel[])))
  );
create policy app_insert on app.checklist_modelo for insert to hk_app
  with check (tenant_id = (select authz.tenant_id()) and (select authz.eh_admin_grupo()));
create policy app_update on app.checklist_modelo for update to hk_app
  using (tenant_id = (select authz.tenant_id()) and (select authz.eh_admin_grupo()))
  with check (tenant_id = (select authz.tenant_id()));
create policy worker_select on app.checklist_modelo for select to hk_worker
  using (tenant_id = (select authz.tenant_sistema()));

create table app.os_checklist (
  id            uuid primary key,
  tenant_id     uuid not null,
  hotel_id      uuid not null,
  os_id         uuid not null,
  modelo_id     uuid not null,
  modelo_versao integer not null,
  nomes         jsonb not null,
  itens         jsonb not null,
  respostas     jsonb not null default '{}',
  criado_por    uuid not null,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (tenant_id, id),
  constraint os_checklist_uma_por_os unique (hotel_id, os_id),
  foreign key (tenant_id, hotel_id) references app.hotel (tenant_id, id),
  foreign key (hotel_id, os_id) references app.os (hotel_id, id),
  constraint os_checklist_modelo_do_grupo
    foreign key (tenant_id, modelo_id) references app.checklist_modelo (tenant_id, id),
  foreign key (tenant_id, criado_por) references app.membro (tenant_id, usuario_id),
  constraint os_checklist_nomes_objeto
    check (jsonb_typeof(nomes) = 'object' and nomes <> '{}'::jsonb),
  constraint os_checklist_itens_lista check (jsonb_typeof(itens) = 'array'),
  constraint os_checklist_respostas_objeto check (jsonb_typeof(respostas) = 'object'),
  constraint os_checklist_versao_positiva check (modelo_versao >= 1)
);
-- Os registros que aplicaram um modelo (relatórios; o Admin vê o uso antes de mudar).
create index os_checklist_modelo_idx on app.os_checklist (tenant_id, modelo_id);

alter table app.os_checklist enable row level security;
alter table app.os_checklist force row level security;

grant select, insert on app.os_checklist to hk_app;
grant update (modelo_id, modelo_versao, nomes, itens, respostas, atualizado_em) on app.os_checklist to hk_app;
grant select on app.os_checklist to hk_worker;

-- Lê quem lê a OS.
create policy app_select on app.os_checklist for select to hk_app
  using (
    tenant_id = (select authz.tenant_id())
    and exists (select 1 from app.os o
                where o.hotel_id = os_checklist.hotel_id and o.id = os_checklist.os_id)
  );
-- Aplica quem tria: a gestão do hotel, em nome dela mesma.
create policy app_insert on app.os_checklist for insert to hk_app
  with check (
    tenant_id = (select authz.tenant_id())
    and hotel_id in (select authz.hoteis_com_papel(
          array['admin_grupo', 'gestor_csc', 'gerente_hotel']::app.papel[]))
    and criado_por = (select authz.usuario_id())
    and exists (select 1 from app.os o
                where o.hotel_id = os_checklist.hotel_id and o.id = os_checklist.os_id)
  );
-- Altera a gestão do hotel (troca do modelo) e o Técnico responsável (respostas).
create policy app_update on app.os_checklist for update to hk_app
  using (
    tenant_id = (select authz.tenant_id())
    and (hotel_id in (select authz.hoteis_com_papel(
           array['admin_grupo', 'gestor_csc', 'gerente_hotel']::app.papel[]))
         or (hotel_id in (select authz.hoteis_com_papel(array['tecnico']::app.papel[]))
             and exists (
               select 1 from app.os o
               where o.hotel_id = os_checklist.hotel_id and o.id = os_checklist.os_id
                 and (o.tecnico_id = (select authz.usuario_id())
                      or o.equipe_id in (select em.equipe_id from app.equipe_membro em
                                         where em.usuario_id = (select authz.usuario_id())
                                           and em.ativo)))))
  )
  with check (
    tenant_id = (select authz.tenant_id())
    and (hotel_id in (select authz.hoteis_com_papel(
           array['admin_grupo', 'gestor_csc', 'gerente_hotel']::app.papel[]))
         or (hotel_id in (select authz.hoteis_com_papel(array['tecnico']::app.papel[]))
             and exists (
               select 1 from app.os o
               where o.hotel_id = os_checklist.hotel_id and o.id = os_checklist.os_id
                 and (o.tecnico_id = (select authz.usuario_id())
                      or o.equipe_id in (select em.equipe_id from app.equipe_membro em
                                         where em.usuario_id = (select authz.usuario_id())
                                           and em.ativo)))))
  );
create policy worker_select on app.os_checklist for select to hk_worker
  using (tenant_id = (select authz.tenant_sistema()));
