-- ============================================================================
-- HubKeep — Migração 0048: a OS preventiva, gerada pelo worker (fase 1b, PV3;
-- ADR-041)
-- ----------------------------------------------------------------------------
-- Desenho aprovado pelo Cesar em 12/10/2026, com o ADR-041 e as decisões 9 a
-- 13 de docs/referencia/propostas-desenho-pv-implantacao.md. O que gerar, e
-- quando, é regra do domínio (planejarGeracao: a ocorrência mais recente até
-- hoje no fuso do hotel, sem acúmulo, uma OS por ativo, o responsável válido);
-- o banco guarda a estrutura e dá ao hk_worker só o escopo de escrita que a
-- geração precisa.
--
-- app.os ganha a preventiva:
--   - plano_id, ativo_id e data_prevista, com FK composta pelo hotel; e
--     plano_aplicado, a cópia do nome, da periodicidade e da versão do plano
--     (ADR-026): mudar o plano não muda a OS gerada;
--   - chamado_id e criado_por passam a anuláveis. O check os_de_um_tipo exige
--     um tipo só: a corretiva tem chamado e quem a gerou, e nenhuma coluna da
--     preventiva; a preventiva não tem chamado nem "quem abriu", e tem o
--     plano, o ativo, a data prevista e a cópia do plano. Sem "quem abriu", o
--     ramo do app_update que libera quem abriu o chamado não alcança a
--     preventiva;
--   - FK nova (hotel_id, local_id) → app.local: a preventiva não tem chamado,
--     e a FK antiga pelo chamado (os_local_do_chamado) não é conferida com o
--     chamado nulo. Na corretiva, as duas valem;
--   - índice único (hotel_id, plano_id, ativo_id, data_prevista) na
--     preventiva: a idempotência. Inclui a OS cancelada, então a ocorrência
--     cancelada não volta, e duas execuções ao mesmo tempo não duplicam;
--   - o hk_app segue gerando só a corretiva (app_insert passa a exigir o
--     chamado); o hk_worker gera só a preventiva, sem autor (worker_insert:
--     com plano e criado_por nulo), no tenant do job. A marca do arrendado
--     (responsavel_arrendamento, 0047) entra pelo mesmo INSERT.
--
-- app.os_transicao: a transição gerar da preventiva não tem autor. O check da
-- 0046 (sem usuário só no aceite automático) passa a aceitar também o gerar; o
-- aceite automático segue sempre sem usuário. O worker grava, sem usuário, só
-- as duas ações. O hk_app segue gravando só com o usuário do contexto
-- (app_insert), então a corretiva continua com quem a gerou.
--
-- app.os_checklist: a cópia do checklist do plano entra com a OS, sem autor.
-- criado_por passa a anulável; o hk_app segue gravando em nome dele mesmo
-- (app_insert), e o worker grava só sem autor, no tenant do job.
--
-- O worker já lê o plano, o checklist, o ativo, o hotel, a atribuição, a
-- equipe, a política e a situação. Campos de escopo seguem sem UPDATE
-- (meta-teste 18); a transição segue só de inserção (meta-teste 32); toda FK
-- nova é composta pelo hotel (meta-testes 21 e 30); nenhuma tabela nova
-- (meta-teste 28). Sem DELETE; nenhuma função e nenhuma trigger; as policies
-- novas não leem outra tabela (meta-teste 27).
-- ============================================================================

alter table app.os add column plano_id uuid;
alter table app.os add column ativo_id uuid;
alter table app.os add column data_prevista date;
alter table app.os add column plano_aplicado jsonb;
alter table app.os alter column chamado_id drop not null;
alter table app.os alter column criado_por drop not null;

alter table app.os
  add constraint os_plano_do_hotel
    foreign key (hotel_id, plano_id) references app.plano_preventivo (hotel_id, id);
alter table app.os
  add constraint os_ativo_do_hotel
    foreign key (hotel_id, ativo_id) references app.ativo (hotel_id, id);
alter table app.os
  add constraint os_local_do_hotel
    foreign key (hotel_id, local_id) references app.local (hotel_id, id);
alter table app.os
  add constraint os_de_um_tipo check (
    (chamado_id is not null and criado_por is not null
      and plano_id is null and ativo_id is null and data_prevista is null
      and plano_aplicado is null)
    or
    (chamado_id is null and chamado_aberto_por is null
      and plano_id is not null and ativo_id is not null and data_prevista is not null
      and plano_aplicado is not null and jsonb_typeof(plano_aplicado) = 'object')
  );

-- A idempotência da geração; também serve à leitura das OS que o plano já gerou.
create unique index os_preventiva_por_ocorrencia
  on app.os (hotel_id, plano_id, ativo_id, data_prevista)
  where plano_id is not null;
-- O histórico preventivo de cada ativo, na ficha dele.
create index os_ativo_idx on app.os (hotel_id, ativo_id) where ativo_id is not null;

-- O hk_app gera só a corretiva.
drop policy app_insert on app.os;
create policy app_insert on app.os for insert to hk_app
  with check (tenant_id = (select authz.tenant_id())
              and hotel_id in (select authz.hoteis_com_papel(
                array['admin_grupo', 'gestor_csc', 'gerente_hotel']::app.papel[]))
              and criado_por = (select authz.usuario_id())
              and chamado_id is not null);

-- O hk_worker gera só a preventiva, sem autor, no tenant do job.
grant insert on app.os to hk_worker;
create policy worker_insert on app.os for insert to hk_worker
  with check (
    tenant_id = (select authz.tenant_sistema())
    and plano_id is not null
    and criado_por is null
  );

-- A transição sem autor: o aceite automático (0046) e a geração da preventiva.
alter table app.os_transicao drop constraint os_transicao_sem_autor_so_no_aceite_automatico;
alter table app.os_transicao
  add constraint os_transicao_sem_autor_so_nos_jobs
    check (usuario_id is not null or acao in ('aceitar_automatico', 'gerar'));
alter table app.os_transicao
  add constraint os_transicao_aceite_automatico_sem_autor
    check (acao <> 'aceitar_automatico' or usuario_id is null);

drop policy worker_insert on app.os_transicao;
create policy worker_insert on app.os_transicao for insert to hk_worker
  with check (
    tenant_id = (select authz.tenant_sistema())
    and usuario_id is null
    and acao in ('aceitar_automatico', 'gerar')
  );

-- A cópia do checklist do plano, sem autor.
alter table app.os_checklist alter column criado_por drop not null;
grant insert on app.os_checklist to hk_worker;
create policy worker_insert on app.os_checklist for insert to hk_worker
  with check (
    tenant_id = (select authz.tenant_sistema())
    and criado_por is null
  );
