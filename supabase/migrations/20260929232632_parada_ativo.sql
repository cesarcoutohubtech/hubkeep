-- ============================================================================
-- HubKeep — Migração 0025: parada do equipamento (fase 1a, C5; ADR-025,
-- ADR-027)
-- ----------------------------------------------------------------------------
-- O registro de que o ativo ficou parado (início e fim), ligado ao chamado do
-- ativo e, quando registrado na execução, à OS. Nasce na abertura do chamado
-- (quem abre marca o equipamento como parado) ou na execução (o responsável
-- pela OS registra e encerra, pelas operações offline do PWA); o Admin do
-- grupo, o Gestor CSC e o Gerente do hotel também encerram, pelo web. Tudo o
-- que é regra fica no domínio e na aplicação (paradas.ts, corretiva.ts): quem
-- registra e quando, o início e o fim aceitos e o tempo parado, calculado no
-- domínio (o indicador é da 1c). O banco guarda:
--   - o ativo e o chamado dele: a FK (hotel_id, chamado_id, ativo_id) vai ao
--     chamado com o mesmo ativo, então a parada só existe em chamado aberto
--     para o ativo;
--   - a OS, opcional, do mesmo chamado (FK (hotel_id, os_id, chamado_id));
--   - início e fim (fim depois do início), quem abriu e quem encerrou (os dois
--     juntos: sem fim, sem quem encerrou);
--   - no máximo uma parada aberta por ativo: índice único parcial
--     (hotel_id, ativo_id) where fim is null. É integridade, como a OS única
--     por chamado (0022).
-- Lê: quem lê o hotel, o proprietário do hotel inteiro e o da UH do ativo.
-- Grava: quem tem escrita no hotel, em nome dele mesmo (a aplicação limita a
-- quem abre o chamado e ao responsável pela OS). Encerra (UPDATE de fim,
-- encerrada_por e atualizado_em): o Admin do grupo, o Gestor CSC, o Gerente do
-- hotel e o Técnico responsável por uma OS não cancelada do chamado, em nome
-- dele mesmo. Sem DELETE.
-- As policies leem app.ativo e app.os; nenhuma policy lê app.parada_ativo,
-- então não há ciclo (meta-teste 27).
-- Só estrutura e autorização: nenhuma função, trigger ou regra de negócio.
-- ============================================================================

-- Alvos das FKs compostas: o chamado com o ativo dele, a OS com o chamado dela.
alter table app.chamado add constraint chamado_ativo_unico unique (hotel_id, id, ativo_id);
alter table app.os add constraint os_chamado_unico unique (hotel_id, id, chamado_id);

create table app.parada_ativo (
  id            uuid primary key,
  tenant_id     uuid not null,
  hotel_id      uuid not null,
  ativo_id      uuid not null,
  chamado_id    uuid not null,
  os_id         uuid,
  inicio        timestamptz not null,
  fim           timestamptz,
  aberta_por    uuid not null,
  encerrada_por uuid,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (tenant_id, id),
  unique (hotel_id, id),
  foreign key (tenant_id, hotel_id) references app.hotel (tenant_id, id),
  foreign key (hotel_id, ativo_id) references app.ativo (hotel_id, id),
  constraint parada_ativo_do_chamado foreign key (hotel_id, chamado_id, ativo_id)
    references app.chamado (hotel_id, id, ativo_id),
  constraint parada_os_do_chamado foreign key (hotel_id, os_id, chamado_id)
    references app.os (hotel_id, id, chamado_id),
  foreign key (tenant_id, aberta_por) references app.membro (tenant_id, usuario_id),
  foreign key (tenant_id, encerrada_por) references app.membro (tenant_id, usuario_id),
  constraint parada_fim_depois_do_inicio check (fim is null or fim > inicio),
  constraint parada_encerrada_com_fim check ((fim is null) = (encerrada_por is null))
);
create unique index parada_ativo_uma_aberta on app.parada_ativo (hotel_id, ativo_id)
  where fim is null;
create index parada_ativo_ativo_idx on app.parada_ativo (hotel_id, ativo_id, inicio desc);
create index parada_ativo_chamado_idx on app.parada_ativo (hotel_id, chamado_id);

alter table app.parada_ativo enable row level security;
alter table app.parada_ativo force row level security;

grant select, insert on app.parada_ativo to hk_app;
grant update (fim, encerrada_por, atualizado_em) on app.parada_ativo to hk_app;
grant select on app.parada_ativo to hk_worker;

create policy app_select on app.parada_ativo for select to hk_app
  using (
    tenant_id = (select authz.tenant_id())
    and (hotel_id in (select authz.hoteis_leitura())
         or hotel_id in (select authz.hoteis_proprietario())
         or exists (select 1 from app.ativo a
                    where a.hotel_id = parada_ativo.hotel_id and a.id = parada_ativo.ativo_id
                      and a.local_id in (select lp.local_id
                                         from authz.locais_proprietario() lp)))
  );

create policy app_insert on app.parada_ativo for insert to hk_app
  with check (
    tenant_id = (select authz.tenant_id())
    and hotel_id in (select authz.hoteis_escrita())
    and aberta_por = (select authz.usuario_id())
    and (encerrada_por is null or encerrada_por = (select authz.usuario_id()))
  );

create policy app_update on app.parada_ativo for update to hk_app
  using (
    tenant_id = (select authz.tenant_id())
    and (hotel_id in (select authz.hoteis_com_papel(
           array['admin_grupo', 'gestor_csc', 'gerente_hotel']::app.papel[]))
         or (hotel_id in (select authz.hoteis_com_papel(array['tecnico']::app.papel[]))
             and exists (
               select 1 from app.os o
               where o.hotel_id = parada_ativo.hotel_id and o.chamado_id = parada_ativo.chamado_id
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
               where o.hotel_id = parada_ativo.hotel_id and o.chamado_id = parada_ativo.chamado_id
                 and o.estado <> 'cancelada'
                 and (o.tecnico_id = (select authz.usuario_id())
                      or o.equipe_id in (select em.equipe_id from app.equipe_membro em
                                         where em.usuario_id = (select authz.usuario_id())
                                           and em.ativo)))))
  );

create policy worker_select on app.parada_ativo for select to hk_worker
  using (tenant_id = (select authz.tenant_sistema()));
