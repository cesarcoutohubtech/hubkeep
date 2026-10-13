-- ============================================================================
-- HubKeep — Migração 0043: calendário de SLA (fase 1c; ADR-042)
-- ----------------------------------------------------------------------------
-- Desenho aprovado pelo Cesar em 13/10/2026 (docs/referencia/
-- propostas-desenho-1c.md, item 1, com os ajustes e as decisões 1 a 6 do
-- ADR-042). O cálculo dos prazos é do domínio (horas do relógio, horário de
-- atendimento no fuso do hotel, feriados oficiais pela porta da aplicação e
-- feriados do hotel); o banco guarda só o resultado, para o monitor e o
-- painel filtrarem sem recalcular, e a estrutura dos feriados do hotel.
--
-- Chamado:
--   - categoria_id: a categoria do próprio chamado, com FK composta para as
--     do grupo. Vem do ativo na abertura; quem tria pode escolher ou trocar
--     (decisão 2). Os chamados que já existem ficam sem categoria: não há
--     dado real antes do piloto;
--   - prazo_atendimento e prazo_solucao: calculados pela aplicação na
--     abertura e refeitos na troca de prioridade ou de categoria e na
--     retomada da OS que pausa o relógio. Nulos nos chamados que já existem;
--   - pausado_segundos: o tempo em que o relógio da solução ficou parado,
--     só para a ficha e o indicador mostrarem (ajuste C);
--   - GRANT de UPDATE nas quatro colunas. Quem grava continua sendo o
--     app_update do chamado (0026): a triagem, o Técnico responsável e quem
--     abriu. A aplicação só grava a categoria e os prazos pela triagem, e os
--     prazos e o tempo pausado pela retomada (risco aceito da 0023 e da
--     0026: o GRANT por coluna vale para todos os papéis do hk_app, e toda
--     gravação fica na auditoria);
--   - dois índices parciais para o monitor de SLA: o prazo de atendimento
--     dos chamados ainda sem OS e o de solução dos que ainda não têm o
--     serviço concluído.
--
-- Transição da OS: motivo_pausa, o motivo informado em cada pausa
-- (decisão 6). A lista é do domínio (MOTIVOS_DE_PAUSA), e o check repete os
-- valores, como o momento da foto (0041). Só a ação pausar leva motivo; nulo
-- é "não informado" (a operação offline gravada antes do motivo existir) e
-- nunca para o relógio. Quais motivos param o relógio é política
-- (chamado.sla), não banco. A tabela continua só de inserção (meta-teste 32).
--
-- app.feriado_hotel: os feriados do hotel, inclusive o municipal (decisão 3
-- do item 1), com a marca "repete todo ano" (anual; decisão 4). Os nacionais
-- e estaduais não ficam no banco: vêm de biblioteca, pela porta da
-- aplicação (ADR-022, ADR-042).
--   - um feriado ativo por data no hotel (índice único parcial). O dia e o
--     mês repetidos entre um anual e outro feriado são regra do domínio;
--   - a data não muda: corrigir é desativar e cadastrar outro;
--   - exclusão lógica (ativo).
-- Lê: quem lê o hotel (a abertura do chamado, por qualquer papel com escrita,
-- calcula o prazo com o contexto de quem abre). Grava: a gestão do hotel e o
-- Implantador (Admin do grupo, Gestor CSC, Implantador e Gerente do hotel),
-- como as equipes (0009), em nome dele mesmo. O worker lê no tenant do job.
-- Nenhuma policy lê app.feriado_hotel, e a dela não lê outra tabela: sem
-- ciclo (meta-teste 27).
-- Só estrutura e autorização: nenhuma função, trigger ou regra de negócio.
-- ============================================================================

-- Chamado: categoria própria, prazos e tempo pausado.
alter table app.chamado
  add column categoria_id uuid,
  add column prazo_atendimento timestamptz,
  add column prazo_solucao timestamptz,
  add column pausado_segundos integer not null default 0;
alter table app.chamado
  add constraint chamado_categoria_do_grupo
    foreign key (tenant_id, categoria_id) references app.categoria_ativo (tenant_id, id),
  add constraint chamado_pausado_nao_negativo check (pausado_segundos >= 0);
create index chamado_categoria_idx on app.chamado (tenant_id, categoria_id)
  where categoria_id is not null;
create index chamado_prazo_atendimento_idx on app.chamado (tenant_id, prazo_atendimento)
  where prazo_atendimento is not null and estado in ('aberto', 'em_triagem');
create index chamado_prazo_solucao_idx on app.chamado (tenant_id, prazo_solucao)
  where prazo_solucao is not null and estado in ('aberto', 'em_triagem', 'em_execucao');
grant update (categoria_id, prazo_atendimento, prazo_solucao, pausado_segundos)
  on app.chamado to hk_app;

-- Transição da OS: o motivo da pausa.
alter table app.os_transicao add column motivo_pausa text;
alter table app.os_transicao
  add constraint os_transicao_motivo_pausa_lista check (
    motivo_pausa in ('aguardando_peca', 'aguardando_fornecedor', 'uh_ocupada_sem_acesso',
                     'fim_de_turno', 'outro')
  ),
  add constraint os_transicao_motivo_so_na_pausa check (motivo_pausa is null or acao = 'pausar');

-- Feriados do hotel.
create table app.feriado_hotel (
  id            uuid primary key,
  tenant_id     uuid not null,
  hotel_id      uuid not null,
  data          date not null,
  nome          text not null,
  anual         boolean not null default false,
  ativo         boolean not null default true,
  criado_por    uuid not null,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (tenant_id, id),
  unique (hotel_id, id),
  foreign key (tenant_id, hotel_id) references app.hotel (tenant_id, id),
  foreign key (tenant_id, criado_por) references app.membro (tenant_id, usuario_id),
  constraint feriado_hotel_nome_preenchido check (length(btrim(nome)) between 1 and 120)
);
create unique index feriado_hotel_data_unica on app.feriado_hotel (hotel_id, data) where ativo;
create index feriado_hotel_hotel_idx on app.feriado_hotel (tenant_id, hotel_id, data);

alter table app.feriado_hotel enable row level security;
alter table app.feriado_hotel force row level security;

grant select, insert on app.feriado_hotel to hk_app;
grant update (nome, anual, ativo, atualizado_em) on app.feriado_hotel to hk_app;
grant select on app.feriado_hotel to hk_worker;

create policy app_select on app.feriado_hotel for select to hk_app
  using (tenant_id = (select authz.tenant_id())
         and hotel_id in (select authz.hoteis_leitura()));
create policy app_insert on app.feriado_hotel for insert to hk_app
  with check (
    tenant_id = (select authz.tenant_id())
    and hotel_id in (select authz.hoteis_com_papel(
      array['admin_grupo', 'gestor_csc', 'implantador', 'gerente_hotel']::app.papel[]))
    and criado_por = (select authz.usuario_id())
  );
create policy app_update on app.feriado_hotel for update to hk_app
  using (
    tenant_id = (select authz.tenant_id())
    and hotel_id in (select authz.hoteis_com_papel(
      array['admin_grupo', 'gestor_csc', 'implantador', 'gerente_hotel']::app.papel[]))
  )
  with check (
    tenant_id = (select authz.tenant_id())
    and hotel_id in (select authz.hoteis_com_papel(
      array['admin_grupo', 'gestor_csc', 'implantador', 'gerente_hotel']::app.papel[]))
  );
create policy worker_select on app.feriado_hotel for select to hk_worker
  using (tenant_id = (select authz.tenant_sistema()));
