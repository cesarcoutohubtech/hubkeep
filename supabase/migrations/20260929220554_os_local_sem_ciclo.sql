-- ============================================================================
-- HubKeep — Migração 0024: a OS guarda o local do chamado, e as policies do
-- chamado e da OS deixam de se ler em ciclo (fase 1a, C4; ADR-027)
-- ----------------------------------------------------------------------------
-- A 0023 fez o UPDATE do chamado (ramo do Técnico responsável) ler app.os, e a
-- leitura da OS (ramo do proprietário, 0022) lê app.chamado. O Postgres recusa
-- o ciclo ao reescrever a consulta (42P17, "infinite recursion detected in
-- policy for relation chamado"), e todo UPDATE do chamado pelo hk_app falhava:
-- triagem, cancelamento, conclusão.
--
-- A OS passa a guardar o local do chamado (local_id), preso ao do chamado por
-- FK composta: (hotel_id, chamado_id, local_id) → chamado (hotel_id, id,
-- local_id). O local do chamado não tem UPDATE, então os dois não divergem, e
-- o local da OS também não. A leitura da OS pelo proprietário usa o local da
-- própria OS, igual à leitura do chamado, e não lê mais app.chamado.
-- O meta-teste 27 (001) recusa policy que chegue de volta à própria tabela,
-- direto ou por outras, para o ciclo não voltar por outro caminho.
-- Só estrutura e autorização: nenhuma função, trigger ou regra de negócio.
-- ============================================================================

alter table app.chamado
  add constraint chamado_local_unico unique (hotel_id, id, local_id);

alter table app.os add column local_id uuid;
update app.os o
   set local_id = c.local_id
  from app.chamado c
 where c.hotel_id = o.hotel_id and c.id = o.chamado_id;
alter table app.os alter column local_id set not null;
alter table app.os
  add constraint os_local_do_chamado foreign key (hotel_id, chamado_id, local_id)
    references app.chamado (hotel_id, id, local_id);
create index os_local_idx on app.os (hotel_id, local_id);

drop policy app_select on app.os;
create policy app_select on app.os for select to hk_app
  using (
    tenant_id = (select authz.tenant_id())
    and (hotel_id in (select authz.hoteis_leitura())
         or hotel_id in (select authz.hoteis_proprietario())
         or local_id in (select lp.local_id from authz.locais_proprietario() lp))
  );
