-- ============================================================================
-- HubKeep — Migração 0058: aprovação do cadastro do ativo e chave de
-- importação (fase 1b, M4 e M2)
-- ----------------------------------------------------------------------------
-- Decisões do Cesar de 19/10/2026 (15 a 19 do desenho, em
-- docs/referencia/propostas-desenho-pv-implantacao.md):
--   - a política ativo.aprovacao_do_cadastro, por hotel, nasce desligada;
--     ligada, o ativo que chega pela operação ativo.cadastrar do PWA nasce
--     pendente; o cadastro no web e a importação nascem aprovados;
--   - aprovam ou recusam o Admin do grupo, o Gestor CSC e o Gerente do hotel;
--     o Implantador não, porque é quem mais cadastra pelo celular;
--   - o ativo pendente já recebe chamado; só fica fora dos planos e das
--     sugestões de plano até a aprovação;
--   - a importação é só CSV, e a linha cujo local não existe é recusada.
--
-- O banco guarda:
--   - app.ativo.situacao_cadastro (pendente ou aprovado, padrão aprovado),
--     sem GRANT de UPDATE: os ativos que já existem ficam aprovados, e o
--     pendente só muda pela decisão. A situação efetiva é o cadastro com a
--     decisão (domínio);
--   - app.ativo_decisao_cadastro, só de inserção: uma decisão por ativo
--     (aprovado ou recusado), o motivo (obrigatório na recusa), quem e
--     quando. O INSERT é só da gestão do hotel (Admin, Gestor CSC e Gerente)
--     e em nome do usuário do contexto: o Técnico, que pode alterar o ativo,
--     não consegue se aprovar. Lê quem lê o hotel (o Técnico vê o motivo da
--     recusa no PWA);
--   - app.ativo.chave_importacao (M2): o resumo da linha normalizada da
--     planilha, única por hotel, para reenviar a planilha sem duplicar.
--     Nasce no INSERT e não muda (sem GRANT de UPDATE).
-- Risco aceito: o INSERT do ativo é da tabela inteira, então quem cadastra
-- pode gravar situacao_cadastro = 'aprovado' no banco. Quem decide a
-- situação inicial pela política é a aplicação (regra 2), e o cadastro fica
-- na auditoria.
-- A recusa desativa o ativo (exclusão lógica) na mesma unit of work, pelo
-- UPDATE que já existe. Quem aprova, o motivo e o limite dele são regras do
-- domínio. Só estrutura e autorização: nenhuma função, trigger ou regra de
-- negócio.
-- ============================================================================

alter table app.ativo
  add column situacao_cadastro text not null default 'aprovado',
  add column chave_importacao  text;

alter table app.ativo
  add constraint ativo_situacao_cadastro_valida
    check (situacao_cadastro in ('pendente', 'aprovado')),
  add constraint ativo_chave_importacao_valida
    check (chave_importacao is null or length(chave_importacao) between 1 and 128),
  add constraint ativo_chave_importacao_unica unique (hotel_id, chave_importacao);

create index ativo_pendente_idx on app.ativo (tenant_id, hotel_id)
  where situacao_cadastro = 'pendente';

create table app.ativo_decisao_cadastro (
  id            uuid primary key,
  tenant_id     uuid not null,
  hotel_id      uuid not null,
  ativo_id      uuid not null,
  decisao       text not null,
  motivo        text,
  decidido_por  uuid not null,
  decidido_em   timestamptz not null default now(),
  foreign key (tenant_id, hotel_id) references app.hotel (tenant_id, id),
  foreign key (hotel_id, ativo_id) references app.ativo (hotel_id, id),
  foreign key (tenant_id, decidido_por) references app.membro (tenant_id, usuario_id),
  constraint ativo_decisao_cadastro_unica unique (hotel_id, ativo_id),
  constraint ativo_decisao_cadastro_valida check (decisao in ('aprovado', 'recusado')),
  constraint ativo_decisao_cadastro_motivo check (
    (decisao = 'aprovado' and motivo is null)
    or (decisao = 'recusado' and length(btrim(motivo)) > 0)
  )
);

alter table app.ativo_decisao_cadastro enable row level security;
alter table app.ativo_decisao_cadastro force row level security;

grant select, insert on app.ativo_decisao_cadastro to hk_app;
grant select on app.ativo_decisao_cadastro to hk_worker;

create policy app_select on app.ativo_decisao_cadastro for select to hk_app
  using (tenant_id = (select authz.tenant_id())
         and hotel_id in (select authz.hoteis_leitura()));
create policy app_insert on app.ativo_decisao_cadastro for insert to hk_app
  with check (
    tenant_id = (select authz.tenant_id())
    and hotel_id in (select authz.hoteis_com_papel(
          array['admin_grupo', 'gestor_csc', 'gerente_hotel']::app.papel[]))
    and decidido_por = (select authz.usuario_id())
  );
create policy worker_select on app.ativo_decisao_cadastro for select to hk_worker
  using (tenant_id = (select authz.tenant_sistema()));
