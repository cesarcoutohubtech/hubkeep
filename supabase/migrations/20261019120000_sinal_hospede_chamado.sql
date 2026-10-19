-- ============================================================================
-- HubKeep — Migração 0057: a ligação da reclamação de hóspede com o chamado
-- (adendo de 19/10/2026 ao ADR-047)
-- ----------------------------------------------------------------------------
-- Abrir chamado a partir da reclamação: o chamado abre pelo caso de uso do
-- núcleo, como qualquer outro, e a ligação fica do lado do Intelligence, nesta
-- tabela. O núcleo não fica sabendo do Intelligence (a app.chamado não muda).
-- Proposta e respostas de Cesar e Kaio de 19/10/2026 em
-- docs/diario-intelligence.md, "Abrir chamado a partir da reclamação". A
-- tabela, e não uma coluna chamado_id na app.sinal_hospede, porque a policy de
-- UPDATE da reclamação (0052) só aceita a gravação de quem classificou, e quem
-- abre o chamado nem sempre é essa pessoa (opção a1, do Cesar em 19/10/2026).
--
-- Tudo o que é regra fica em packages/inteligencia: quem abre e liga, quando a
-- reclamação pode virar chamado, o formulário. O banco guarda:
--   - uma ligação por reclamação: único por (tenant_id, sinal_id);
--   - a reclamação e o chamado do mesmo hotel, por FKs compostas com hotel_id.
--     A reclamação ganha a chave (hotel_id, id) para isso;
--   - quem liga é quem abriu o chamado: a FK (hotel_id, chamado_id, ligado_por)
--     aponta para a chave (hotel_id, id, aberto_por) da app.chamado (0026);
--   - só INSERT: a ligação é o registro de que a reclamação virou chamado e
--     não muda depois de gravada (meta-teste 32). Sem DELETE para ninguém.
-- Lê e liga (hk_app) quem decide insight no hotel: Admin do grupo, Gestor CSC
--   e Gerente com o hotel, pela mesma lista de papéis da app.sinal_hospede.
--   Liga em nome próprio (ligado_por). O hk_worker não lê: o job não usa.
-- As policies leem só funções authz; nenhuma lê outra tabela (meta-teste 27).
-- A auditoria da ligação usa o caso sinal_hospede da policy da app.auditoria
-- (0053), com o id da reclamação: sem mudança nela.
-- Só estrutura e autorização: nenhuma função, trigger ou regra de negócio.
-- ============================================================================

alter table app.sinal_hospede add constraint sinal_hospede_hotel_id_unico unique (hotel_id, id);

create table app.sinal_hospede_chamado (
  id         uuid primary key,
  tenant_id  uuid not null,
  hotel_id   uuid not null,
  sinal_id   uuid not null,
  chamado_id uuid not null,
  ligado_por uuid not null,
  criado_em  timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, sinal_id),
  foreign key (tenant_id, hotel_id) references app.hotel (tenant_id, id),
  foreign key (hotel_id, sinal_id) references app.sinal_hospede (hotel_id, id),
  foreign key (hotel_id, chamado_id, ligado_por) references app.chamado (hotel_id, id, aberto_por),
  foreign key (tenant_id, ligado_por) references app.membro (tenant_id, usuario_id)
);
-- As reclamações de um chamado (a ficha do chamado, depois).
create index sinal_hospede_chamado_chamado_idx on app.sinal_hospede_chamado (hotel_id, chamado_id);

alter table app.sinal_hospede_chamado enable row level security;
alter table app.sinal_hospede_chamado force row level security;

grant select, insert on app.sinal_hospede_chamado to hk_app;

-- Lê e liga quem decide insight no hotel, em nome próprio.
create policy app_select on app.sinal_hospede_chamado for select to hk_app
  using (
    tenant_id = (select authz.tenant_id())
    and hotel_id in (select authz.hoteis_com_papel(
          array['admin_grupo', 'gestor_csc', 'gerente_hotel']::app.papel[]))
  );

create policy app_insert on app.sinal_hospede_chamado for insert to hk_app
  with check (
    tenant_id = (select authz.tenant_id())
    and ligado_por = (select authz.usuario_id())
    and hotel_id in (select authz.hoteis_com_papel(
          array['admin_grupo', 'gestor_csc', 'gerente_hotel']::app.papel[]))
  );
