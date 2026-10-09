-- ============================================================================
-- HubKeep — Migração 0034: chamado e OS com origem, impacto no hóspede, quem
-- executa e custo; UH indisponível (fase 1b, I4)
-- ----------------------------------------------------------------------------
-- Desenho aprovado pelo Cesar em 08/10/2026 (docs/12, I4; docs/referencia/
-- propostas-desenho-1b.md, itens 2 e 3). Os valores canônicos da origem e de
-- quem executa ficam no domínio (ORIGENS_DO_CHAMADO e EXECUTORES_DA_OS); o
-- check repete a lista, como o do modelo contratual (0032), e o teste
-- tests/valores-canonicos-banco.test.ts falha se os dois divergirem. Valor
-- novo exige migração que amplia o check.
--
-- Chamado:
--   - origem: de onde veio o trabalho, gravada na abertura e sem UPDATE.
--     Hoje sempre 'interno'; a integração (IX2) usa o mesmo campo depois. O
--     default cobre os chamados que já existem;
--   - impacto_hospede: afeta hóspede? Nulo é "não informado". Quem abre
--     responde; a triagem corrige (GRANT de UPDATE só nesta coluna nova).
--
-- OS:
--   - executado_por: 'equipe_interna' (padrão, também nas OS que já existem)
--     ou 'fornecedor', com fornecedor_id do grupo (FK composta (tenant_id,
--     fornecedor_id), I3). O check os_fornecedor_quando_externo amarra os dois:
--     com fornecedor, o id; sem, nada. Fornecedor ativo e quem escolhe são
--     regra do domínio;
--   - custo_informado: valor opcional em reais, gravado no aceite; não
--     negativo (check). Moeda do hotel e alçadas ficam para o módulo de
--     custos (fase 2);
--   - GRANT de UPDATE nas três colunas. Quem grava continua sendo o
--     app_update da OS (0026): a gestão do hotel, o Técnico responsável e
--     quem abriu o chamado. A aplicação só grava quem executa pela triagem
--     e o custo pelo aceite (risco aceito da 0023 e da 0026: o GRANT por
--     coluna vale para todos os papéis do hk_app, e toda gravação fica na
--     auditoria).
--
-- app.uh_indisponivel: a UH ficou fora de uso por causa do chamado, de
-- quando a quando, no modelo da parada do ativo (0025):
--   - a UH é o local do chamado: FK (hotel_id, chamado_id, local_id) →
--     chamado (hotel_id, id, local_id) (chamado_local_unico, 0024). Que o
--     local seja UH, e não área comum, é regra do domínio;
--   - início e fim (fim depois do início), quem abriu e quem encerrou (os
--     dois juntos);
--   - no máximo um período aberto por chamado (índice único parcial). A
--     mesma UH pode ter períodos de chamados diferentes; o trecho
--     sobreposto conta uma vez no cálculo dos UH-dias, que é do domínio;
--   - o período do chamado cancelado é encerrado no cancelamento, e o
--     cálculo o deixa de fora (domínio).
-- Lê: quem lê o hotel, o proprietário do hotel inteiro e o da UH. O worker
-- lê no tenant do job (Intelligence, UH-dias perdidos).
-- Grava: quem tem escrita no hotel, em nome dele mesmo (a aplicação limita a
-- quem abre o chamado e à gestão do hotel). Encerra (UPDATE de fim,
-- encerrada_por e atualizado_em): o Admin do grupo, o Gestor CSC, o Gerente
-- do hotel e o Técnico responsável por OS não cancelada do chamado, em nome
-- dele mesmo, como na parada. Sem DELETE.
-- As policies leem app.os; nenhuma policy lê app.uh_indisponivel, então não
-- há ciclo (meta-teste 27).
-- Só estrutura e autorização: nenhuma função, trigger ou regra de negócio.
-- ============================================================================

-- Chamado: origem e impacto no hóspede.
alter table app.chamado
  add column origem text not null default 'interno',
  add column impacto_hospede boolean;
alter table app.chamado
  add constraint chamado_origem_lista check (origem in ('interno'));
grant update (impacto_hospede) on app.chamado to hk_app;

-- OS: quem executa (equipe interna ou fornecedor do grupo) e o custo informado.
alter table app.os
  add column executado_por text not null default 'equipe_interna',
  add column fornecedor_id uuid,
  add column custo_informado numeric(12, 2);
alter table app.os
  add constraint os_executado_por_lista check (executado_por in ('equipe_interna', 'fornecedor')),
  add constraint os_fornecedor_do_grupo
    foreign key (tenant_id, fornecedor_id) references app.fornecedor (tenant_id, id),
  add constraint os_fornecedor_quando_externo
    check ((executado_por = 'fornecedor') = (fornecedor_id is not null)),
  add constraint os_custo_nao_negativo check (custo_informado is null or custo_informado >= 0);
create index os_fornecedor_idx on app.os (tenant_id, fornecedor_id) where fornecedor_id is not null;
grant update (executado_por, fornecedor_id, custo_informado) on app.os to hk_app;

-- UH indisponível.
create table app.uh_indisponivel (
  id            uuid primary key,
  tenant_id     uuid not null,
  hotel_id      uuid not null,
  local_id      uuid not null,
  chamado_id    uuid not null,
  inicio        timestamptz not null,
  fim           timestamptz,
  aberta_por    uuid not null,
  encerrada_por uuid,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (tenant_id, id),
  unique (hotel_id, id),
  foreign key (tenant_id, hotel_id) references app.hotel (tenant_id, id),
  foreign key (hotel_id, local_id) references app.local (hotel_id, id),
  constraint uh_indisponivel_local_do_chamado foreign key (hotel_id, chamado_id, local_id)
    references app.chamado (hotel_id, id, local_id),
  foreign key (tenant_id, aberta_por) references app.membro (tenant_id, usuario_id),
  foreign key (tenant_id, encerrada_por) references app.membro (tenant_id, usuario_id),
  constraint uh_indisponivel_fim_depois_do_inicio check (fim is null or fim > inicio),
  constraint uh_indisponivel_encerrada_com_fim check ((fim is null) = (encerrada_por is null))
);
create unique index uh_indisponivel_uma_aberta_por_chamado on app.uh_indisponivel (hotel_id, chamado_id)
  where fim is null;
create index uh_indisponivel_local_idx on app.uh_indisponivel (hotel_id, local_id, inicio desc);

alter table app.uh_indisponivel enable row level security;
alter table app.uh_indisponivel force row level security;

grant select, insert on app.uh_indisponivel to hk_app;
grant update (fim, encerrada_por, atualizado_em) on app.uh_indisponivel to hk_app;
grant select on app.uh_indisponivel to hk_worker;

create policy app_select on app.uh_indisponivel for select to hk_app
  using (
    tenant_id = (select authz.tenant_id())
    and (hotel_id in (select authz.hoteis_leitura())
         or hotel_id in (select authz.hoteis_proprietario())
         or local_id in (select lp.local_id from authz.locais_proprietario() lp))
  );

create policy app_insert on app.uh_indisponivel for insert to hk_app
  with check (
    tenant_id = (select authz.tenant_id())
    and hotel_id in (select authz.hoteis_escrita())
    and aberta_por = (select authz.usuario_id())
    and (encerrada_por is null or encerrada_por = (select authz.usuario_id()))
  );

create policy app_update on app.uh_indisponivel for update to hk_app
  using (
    tenant_id = (select authz.tenant_id())
    and (hotel_id in (select authz.hoteis_com_papel(
           array['admin_grupo', 'gestor_csc', 'gerente_hotel']::app.papel[]))
         or (hotel_id in (select authz.hoteis_com_papel(array['tecnico']::app.papel[]))
             and exists (
               select 1 from app.os o
               where o.hotel_id = uh_indisponivel.hotel_id and o.chamado_id = uh_indisponivel.chamado_id
                 and o.estado <> 'cancelada'
                 and (o.tecnico_id = (select authz.usuario_id())
                      or o.equipe_id in (select em.equipe_id from app.equipe_membro em
                                         where em.usuario_id = (select authz.usuario_id())
                                           and em.ativo)))))
  )
  with check (
    tenant_id = (select authz.tenant_id())
    and encerrada_por = (select authz.usuario_id())
    and (hotel_id in (select authz.hoteis_com_papel(
           array['admin_grupo', 'gestor_csc', 'gerente_hotel']::app.papel[]))
         or (hotel_id in (select authz.hoteis_com_papel(array['tecnico']::app.papel[]))
             and exists (
               select 1 from app.os o
               where o.hotel_id = uh_indisponivel.hotel_id and o.chamado_id = uh_indisponivel.chamado_id
                 and o.estado <> 'cancelada'
                 and (o.tecnico_id = (select authz.usuario_id())
                      or o.equipe_id in (select em.equipe_id from app.equipe_membro em
                                         where em.usuario_id = (select authz.usuario_id())
                                           and em.ativo)))))
  );

create policy worker_select on app.uh_indisponivel for select to hk_worker
  using (tenant_id = (select authz.tenant_sistema()));
