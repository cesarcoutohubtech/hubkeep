-- ============================================================================
-- HubKeep — Migração 0017: registro dos anexos (fase 1a, B4; ajuste do ADR-024)
-- ----------------------------------------------------------------------------
-- O arquivo continua no bucket privado "anexos" (0004), enviado pelo aparelho
-- direto ao Storage com a URL assinada da F0-10. Esta tabela registra o arquivo
-- na unit of work, com auditoria e evento: a quem pertence, quem enviou, o tipo
-- e a miniatura gerada no aparelho (ADR-024).
--   - O registro é de um hotel, de um local ou de um ativo. Cada um tem a sua
--     coluna, com FK composta pelo hotel: registro de outro hotel ou de outro
--     tenant é recusado pelo PostgreSQL. OS e chamado entram com as tabelas
--     deles (etapa C), cada um com a sua coluna;
--   - o caminho do arquivo começa pelo tenant, pelo hotel, pela entidade e pelo
--     registro da própria linha (check): uma linha nunca aponta para arquivo de
--     outro tenant, de outro hotel ou de outro registro, mesmo com erro na
--     aplicação. O mesmo vale para a miniatura. Cada arquivo é registrado uma
--     vez só (unique);
--   - remoção lógica: removido_em e removido_por, gravados juntos. O arquivo
--     fica no Storage (sem DELETE, como no resto do projeto).
-- Lê: quem lê o hotel e o proprietário, só nos anexos dos locais dele e dos
-- ativos que estão hoje nesses locais (ADR-031: o local decide; um ativo movido,
-- B3c, leva os anexos junto). Os anexos do próprio hotel ficam fora para o
-- proprietário, no mesmo critério das políticas: sem uso concreto no MVP.
-- Grava: quem escreve no hotel, só em nome do usuário do contexto. Quem pode
-- remover é regra de ação, no domínio (regra 2).
-- Só estrutura e autorização: nenhuma função, trigger ou regra de negócio.
-- ============================================================================

create table app.anexo (
  id                uuid primary key,
  tenant_id         uuid not null,
  hotel_id          uuid not null,
  entidade          text not null,
  local_id          uuid,
  ativo_id          uuid,
  caminho           text not null unique,
  miniatura_caminho text unique,
  tipo              text not null,
  nome              text,
  usuario_id        uuid not null,
  criado_em         timestamptz not null default now(),
  removido_em       timestamptz,
  removido_por      uuid,
  foreign key (tenant_id, hotel_id) references app.hotel (tenant_id, id),
  foreign key (hotel_id, local_id) references app.local (hotel_id, id),
  foreign key (hotel_id, ativo_id) references app.ativo (hotel_id, id),
  foreign key (tenant_id, usuario_id) references app.membro (tenant_id, usuario_id),
  foreign key (tenant_id, removido_por) references app.membro (tenant_id, usuario_id),
  constraint anexo_entidade_valida check (entidade in ('hotel', 'local', 'ativo')),
  constraint anexo_registro_da_entidade check (
    (entidade = 'hotel' and local_id is null and ativo_id is null)
    or (entidade = 'local' and local_id is not null and ativo_id is null)
    or (entidade = 'ativo' and ativo_id is not null and local_id is null)
  ),
  constraint anexo_caminho_do_registro check (
    caminho like tenant_id::text || '/' || hotel_id::text || '/' || entidade || '/'
                 || coalesce(ativo_id, local_id, hotel_id)::text || '/%'
  ),
  constraint anexo_miniatura_do_registro check (
    miniatura_caminho is null
    or miniatura_caminho like tenant_id::text || '/' || hotel_id::text || '/' || entidade || '/'
                              || coalesce(ativo_id, local_id, hotel_id)::text || '/%'
  ),
  constraint anexo_tipo_aceito check (
    tipo in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')
  ),
  constraint anexo_nome_preenchido check (nome is null or length(btrim(nome)) between 1 and 200),
  constraint anexo_remocao_completa check ((removido_em is null) = (removido_por is null))
);
create index anexo_hotel_idx on app.anexo (tenant_id, hotel_id);
create index anexo_local_idx on app.anexo (hotel_id, local_id) where local_id is not null;
create index anexo_ativo_idx on app.anexo (hotel_id, ativo_id) where ativo_id is not null;

alter table app.anexo enable row level security;
alter table app.anexo force row level security;

grant select, insert on app.anexo to hk_app;
grant update (removido_em, removido_por) on app.anexo to hk_app;
grant select on app.anexo to hk_worker;

create policy app_select on app.anexo for select to hk_app
  using (
    tenant_id = (select authz.tenant_id())
    and (hotel_id in (select authz.hoteis_leitura())
         or (entidade = 'local'
             and local_id in (select lp.local_id from authz.locais_proprietario() lp))
         or (entidade = 'ativo'
             and exists (select 1 from app.ativo a
                         where a.hotel_id = anexo.hotel_id and a.id = anexo.ativo_id
                           and a.local_id in (select lp.local_id
                                              from authz.locais_proprietario() lp))))
  );
create policy app_insert on app.anexo for insert to hk_app
  with check (tenant_id = (select authz.tenant_id())
              and hotel_id in (select authz.hoteis_escrita())
              and usuario_id = (select authz.usuario_id())
              and removido_em is null);
create policy app_update on app.anexo for update to hk_app
  using (tenant_id = (select authz.tenant_id())
         and hotel_id in (select authz.hoteis_escrita()))
  with check (tenant_id = (select authz.tenant_id())
              and hotel_id in (select authz.hoteis_escrita())
              and removido_por = (select authz.usuario_id()));
create policy worker_select on app.anexo for select to hk_worker
  using (tenant_id = (select authz.tenant_sistema()));
