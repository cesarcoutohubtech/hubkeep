-- ============================================================================
-- HubKeep — Migração 0041: foto antes ou depois e assinatura no aceite (fase
-- 1b, I8; desenho aprovado pelo Cesar em 08/10/2026, item 4)
-- ----------------------------------------------------------------------------
-- Foto: app.anexo.momento, anulável, só em anexo de OS, com os valores do
-- domínio (MOMENTOS_DA_FOTO; teste de paridade). Nulo quer dizer "sem
-- momento": as fotos que já existem ficam assim. Quem sugere o momento é o
-- PWA, pelo estado da OS, e o técnico pode trocar; a política
-- os.foto_depois_obrigatoria, cobrada na conclusão, é do domínio (regra 2).
--
-- Assinatura: desenhada no aceite, no web, por quem aceita, e gravada como
-- anexo da OS marcado com assinatura = true (sempre PNG, sem momento e sem
-- miniatura). É evidência do aceite, e não assinatura digital ICP-Brasil.
--   - imutável: a policy de UPDATE do anexo (a remoção lógica, únicas colunas
--     com UPDATE) não acha a linha da assinatura; ninguém a remove;
--   - a OS guarda o id (assinatura_aceite_id), com FK composta que prende a
--     assinatura a um anexo da própria OS: (hotel_id, id, assinatura_aceite_id)
--     → anexo (hotel_id, os_id, id). Reaberta e aceita de novo, a OS aponta a
--     assinatura nova; a antiga fica no registro e na auditoria;
--   - que o anexo apontado seja uma assinatura é conferido pelo caso de uso,
--     que grava os dois na mesma unit of work (o anexo e o aceite);
--   - a política os.assinatura_no_aceite é do domínio.
-- Risco aceito (como na 0023 e na 0026): o GRANT por coluna vale para todos
-- os papéis do hk_app que passam na policy de UPDATE da OS; a aplicação só
-- grava assinatura_aceite_id no aceite, e toda gravação fica na auditoria.
-- Só estrutura e autorização: nenhuma função, trigger ou regra de negócio.
-- ============================================================================

alter table app.anexo add column momento text;
alter table app.anexo add column assinatura boolean not null default false;
alter table app.anexo
  add constraint anexo_momento_lista check (momento in ('antes', 'depois')),
  add constraint anexo_momento_so_na_os check (momento is null or entidade = 'os'),
  add constraint anexo_assinatura_da_os check (
    not assinatura
    or (entidade = 'os' and tipo = 'image/png' and momento is null
        and miniatura_caminho is null)
  ),
  add constraint anexo_da_os_unico unique (hotel_id, os_id, id);

alter table app.os add column assinatura_aceite_id uuid;
alter table app.os
  add constraint os_assinatura_da_propria_os
    foreign key (hotel_id, id, assinatura_aceite_id)
    references app.anexo (hotel_id, os_id, id);
grant update (assinatura_aceite_id) on app.os to hk_app;

-- A remoção lógica não alcança a assinatura.
drop policy app_update on app.anexo;
create policy app_update on app.anexo for update to hk_app
  using (tenant_id = (select authz.tenant_id())
         and hotel_id in (select authz.hoteis_escrita())
         and not assinatura)
  with check (tenant_id = (select authz.tenant_id())
              and hotel_id in (select authz.hoteis_escrita())
              and removido_por = (select authz.usuario_id())
              and not assinatura);
