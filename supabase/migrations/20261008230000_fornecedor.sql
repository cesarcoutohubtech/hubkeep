-- ============================================================================
-- HubKeep — Migração 0033: fornecedor mínimo do grupo (fase 1b, I3)
-- ----------------------------------------------------------------------------
-- Desenho aprovado pelo Cesar em 08/10/2026 (docs/referencia/
-- propostas-desenho-1b.md, item 2). O fornecedor é do grupo (tenant), e não
-- do hotel: o Gerente cadastra o fornecedor local, que fica visível para o
-- grupo. A OS passa a apontar para ele na I4 (executado_por), com FK composta
-- (tenant_id, id); esta migração não mexe na OS.
--   - nome obrigatório; cnpj opcional, só dígitos (14), único no grupo quando
--     informado (índice único parcial). O dígito verificador é conferido no
--     domínio (validarCnpj, packages/dominio/src/fornecedores.ts); aqui fica só
--     o formato, como garantia. O fornecedor desativado continua com o CNPJ:
--     cadastrar de novo o mesmo CNPJ é reativar o que existe;
--   - contato opcional (contato_nome, contato_telefone, contato_email): dado
--     pessoal mínimo, que entra na auditoria como qualquer cadastro. Os tetos
--     dos checks são só o formato; a normalização é do domínio;
--   - versao (ADR-029) e desativado_em (desativação lógica, sem DELETE), como
--     no ativo.
-- Lê: quem tem papel de escrita em algum hotel do grupo (authz.hoteis_escrita,
-- que deixa de fora o proprietário) e o Admin do grupo, mesmo sem hotel. O
-- proprietário, de UH, de hotel inteiro ou com escopo de hotel, não lê.
-- Grava (INSERT e UPDATE): o Admin do grupo (authz.eh_admin_grupo) e o Gestor
-- CSC e o Gerente do hotel, com papel vigente que alcance algum hotel do grupo. O Implantador, o Técnico
-- e o Solicitante leem e não gravam. Quem pode fazer cada ação continua sendo
-- regra da aplicação (podeGerirFornecedores); a policy é a garantia.
-- O worker não lê: nenhum job usa o fornecedor no MVP. O Intelligence pede o
-- GRANT pelo diário quando precisar.
--
-- Auditoria do fornecedor. O fornecedor não tem hotel, e a auditoria sem
-- hotel só era gravada pelo Admin do grupo e pelo Implantador (0003, ADR-021).
-- Para o Gestor CSC e o Gerente auditarem o cadastro que fazem, a policy de
-- INSERT de app.auditoria ganha um caso: hotel nulo, entidade 'fornecedor',
-- registro que é um fornecedor do tenant visível a quem grava, e papel de
-- Gestor CSC ou Gerente vigente em algum hotel. A de SELECT ganha o mesmo
-- recorte, para o histórico do fornecedor aparecer para quem o cadastra. O
-- resto da auditoria sem hotel continua só do Admin e do Implantador. A policy
-- de app.auditoria lê app.fornecedor; nenhuma policy de app.fornecedor lê
-- outra tabela, então não há ciclo (meta-teste 27).
-- Só estrutura e autorização: nenhuma função, trigger ou regra de negócio.
-- ============================================================================

create table app.fornecedor (
  id               uuid primary key,
  tenant_id        uuid not null references app.tenant (id),
  nome             text not null,
  cnpj             text,
  contato_nome     text,
  contato_telefone text,
  contato_email    text,
  versao           integer not null default 1,
  desativado_em    timestamptz,
  criado_em        timestamptz not null default now(),
  atualizado_em    timestamptz not null default now(),
  unique (tenant_id, id),
  constraint fornecedor_nome_tamanho check (length(btrim(nome)) between 1 and 120),
  constraint fornecedor_cnpj_formato check (cnpj ~ '^[0-9]{14}$'),
  constraint fornecedor_contato_nome_tamanho check (length(contato_nome) <= 120),
  constraint fornecedor_contato_telefone_tamanho check (length(contato_telefone) <= 30),
  constraint fornecedor_contato_email_tamanho check (length(contato_email) <= 320),
  constraint fornecedor_versao_positiva check (versao >= 1)
);
-- CNPJ único no grupo quando informado; o domínio traduz a violação em 409
-- fornecedor_cnpj_repetido.
create unique index fornecedor_cnpj_unico on app.fornecedor (tenant_id, cnpj)
  where cnpj is not null;
create index fornecedor_tenant_nome_idx on app.fornecedor (tenant_id, nome);

alter table app.fornecedor enable row level security;
alter table app.fornecedor force row level security;

grant select, insert on app.fornecedor to hk_app;
grant update (nome, cnpj, contato_nome, contato_telefone, contato_email, versao,
              desativado_em, atualizado_em) on app.fornecedor to hk_app;

create policy app_select on app.fornecedor for select to hk_app
  using (
    tenant_id = (select authz.tenant_id())
    and ((select authz.eh_admin_grupo())
         or exists (select 1 from authz.hoteis_escrita()))
  );
create policy app_insert on app.fornecedor for insert to hk_app
  with check (
    tenant_id = (select authz.tenant_id())
    and ((select authz.eh_admin_grupo())
         or exists (select 1 from authz.hoteis_com_papel(
           array['gestor_csc', 'gerente_hotel']::app.papel[])))
  );
create policy app_update on app.fornecedor for update to hk_app
  using (
    tenant_id = (select authz.tenant_id())
    and ((select authz.eh_admin_grupo())
         or exists (select 1 from authz.hoteis_com_papel(
           array['gestor_csc', 'gerente_hotel']::app.papel[])))
  )
  with check (
    tenant_id = (select authz.tenant_id())
    and ((select authz.eh_admin_grupo())
         or exists (select 1 from authz.hoteis_com_papel(
           array['gestor_csc', 'gerente_hotel']::app.papel[])))
  );

-- Auditoria do fornecedor (ver o cabeçalho). O texto das duas policies repete
-- o atual (0005 no INSERT, 0028 no SELECT) e acrescenta só o caso do fornecedor.
alter policy app_insert on app.auditoria
  with check (
    tenant_id = (select authz.tenant_id())
    and usuario_id = (select authz.usuario_id())
    and (
      (hotel_id is null
       and ((select authz.eh_admin_grupo())
            or exists (select 1 from authz.hoteis_com_papel(array['implantador']::app.papel[]))))
      or hotel_id in (select authz.hoteis_escrita())
      or (hotel_id is null
          and entidade = 'preferencia_membro'
          and registro_id = (select authz.usuario_id()))
      or (hotel_id is null
          and entidade = 'fornecedor'
          and exists (select 1 from authz.hoteis_com_papel(
            array['gestor_csc', 'gerente_hotel']::app.papel[]))
          and exists (select 1 from app.fornecedor f
                      where f.tenant_id = auditoria.tenant_id and f.id = auditoria.registro_id))
    )
  );

alter policy app_select on app.auditoria
  using (
    tenant_id = (select authz.tenant_id())
    and ((select authz.eh_admin_grupo())
         or hotel_id in (select authz.hoteis_escrita())
         or (hotel_id is null
             and entidade = 'fornecedor'
             and exists (select 1 from authz.hoteis_com_papel(
               array['gestor_csc', 'gerente_hotel']::app.papel[])))
         or (hotel_id in (select lp.hotel_id from authz.locais_proprietario() lp
                          union
                          select authz.hoteis_proprietario())
             and ((entidade = 'local'
                   and exists (select 1 from app.local l
                               where l.hotel_id = auditoria.hotel_id
                                 and l.id = auditoria.registro_id))
                  or (entidade = 'ativo'
                      and exists (select 1 from app.ativo a
                                  where a.hotel_id = auditoria.hotel_id
                                    and a.id = auditoria.registro_id))
                  or (entidade = 'chamado'
                      and exists (select 1 from app.chamado c
                                  where c.hotel_id = auditoria.hotel_id
                                    and c.id = auditoria.registro_id))
                  or (entidade = 'os'
                      and exists (select 1 from app.os o
                                  where o.hotel_id = auditoria.hotel_id
                                    and o.id = auditoria.registro_id)))))
  );
