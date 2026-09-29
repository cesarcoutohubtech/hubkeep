-- ============================================================================
-- HubKeep — Migração 0021: chamado (fase 1a, C2; ADR-026, ADR-029, ADR-030)
-- ----------------------------------------------------------------------------
-- A abertura mínima do chamado: local obrigatório, ativo opcional (do mesmo
-- hotel), descrição e foto opcional (anexo). Tudo o que é regra fica no
-- domínio e na aplicação (corretiva.ts, situacoes.ts, chamados.ts): quem
-- abre, a UH pendente de licença, o ativo no local, a prioridade padrão pela
-- política e a situação inicial. O banco guarda:
--   - estado (canônico, só o formato; a lista é do domínio), situacao_id e
--     prioridade_id, com FK composta para as do tenant;
--   - politica_aplicada: a cópia da política usada na abertura (ADR-026);
--     mudar a política depois não altera o chamado;
--   - busca (ADR-030): a descrição normalizada, calculada só em
--     packages/db/src/repositorios/busca.ts, com índice GIN de trigramas;
--   - versao (ADR-029), para a triagem e a execução (C3 a C6);
--   - aberto_por, igual a quem grava (a policy confere).
-- Nenhum UPDATE nesta migração: a triagem (C3) concede o que for alterável.
-- Lê: quem lê o hotel, o proprietário da UH do chamado e o proprietário do
-- hotel inteiro. Grava: quem tem escrita no hotel. Sem DELETE.
--
-- O anexo ganha a entidade 'chamado' (coluna chamado_id, FK pelo hotel), para
-- a foto da abertura; o proprietário lê os anexos dos chamados que vê.
-- Só estrutura e autorização: nenhuma função, trigger ou regra de negócio.
-- ============================================================================

create table app.chamado (
  id                uuid primary key,
  tenant_id         uuid not null,
  hotel_id          uuid not null,
  local_id          uuid not null,
  ativo_id          uuid,
  descricao         text not null,
  busca             text not null,
  estado            text not null,
  situacao_id       uuid not null,
  prioridade_id     uuid not null,
  politica_aplicada jsonb not null,
  aberto_por        uuid not null,
  versao            integer not null default 1,
  criado_em         timestamptz not null default now(),
  atualizado_em     timestamptz not null default now(),
  unique (tenant_id, id),
  unique (hotel_id, id),
  foreign key (tenant_id, hotel_id) references app.hotel (tenant_id, id),
  foreign key (hotel_id, local_id) references app.local (hotel_id, id),
  foreign key (hotel_id, ativo_id) references app.ativo (hotel_id, id),
  foreign key (tenant_id, situacao_id) references app.situacao (tenant_id, id),
  foreign key (tenant_id, prioridade_id) references app.prioridade (tenant_id, id),
  foreign key (tenant_id, aberto_por) references app.membro (tenant_id, usuario_id),
  constraint chamado_descricao_preenchida check (length(btrim(descricao)) between 1 and 2000),
  constraint chamado_estado_formato check (estado ~ '^[a-z][a-z_]{1,39}$'),
  constraint chamado_politica_objeto check (jsonb_typeof(politica_aplicada) = 'object'),
  constraint chamado_versao_positiva check (versao >= 1)
);
create index chamado_hotel_idx on app.chamado (tenant_id, hotel_id, criado_em desc);
create index chamado_local_idx on app.chamado (hotel_id, local_id);
create index chamado_ativo_idx on app.chamado (hotel_id, ativo_id) where ativo_id is not null;
create index chamado_busca_trgm_idx on app.chamado
  using gin (busca extensions.gin_trgm_ops);

alter table app.chamado enable row level security;
alter table app.chamado force row level security;

grant select, insert on app.chamado to hk_app;
grant select on app.chamado to hk_worker;

create policy app_select on app.chamado for select to hk_app
  using (
    tenant_id = (select authz.tenant_id())
    and (hotel_id in (select authz.hoteis_leitura())
         or hotel_id in (select authz.hoteis_proprietario())
         or local_id in (select lp.local_id from authz.locais_proprietario() lp))
  );
create policy app_insert on app.chamado for insert to hk_app
  with check (tenant_id = (select authz.tenant_id())
              and hotel_id in (select authz.hoteis_escrita())
              and aberto_por = (select authz.usuario_id()));
create policy worker_select on app.chamado for select to hk_worker
  using (tenant_id = (select authz.tenant_sistema()));

-- Anexo do chamado (a foto da abertura; C4 usa o da OS).
alter table app.anexo add column chamado_id uuid;
alter table app.anexo
  add constraint anexo_chamado_fk foreign key (hotel_id, chamado_id)
    references app.chamado (hotel_id, id);
alter table app.anexo drop constraint anexo_entidade_valida;
alter table app.anexo drop constraint anexo_registro_da_entidade;
alter table app.anexo drop constraint anexo_caminho_do_registro;
alter table app.anexo drop constraint anexo_miniatura_do_registro;
alter table app.anexo
  add constraint anexo_entidade_valida check (entidade in ('hotel', 'local', 'ativo', 'chamado')),
  add constraint anexo_registro_da_entidade check (
    (entidade = 'hotel' and local_id is null and ativo_id is null and chamado_id is null)
    or (entidade = 'local' and local_id is not null and ativo_id is null and chamado_id is null)
    or (entidade = 'ativo' and ativo_id is not null and local_id is null and chamado_id is null)
    or (entidade = 'chamado' and chamado_id is not null and local_id is null and ativo_id is null)
  ),
  add constraint anexo_caminho_do_registro check (
    caminho like tenant_id::text || '/' || hotel_id::text || '/' || entidade || '/'
                 || coalesce(chamado_id, ativo_id, local_id, hotel_id)::text || '/%'
  ),
  add constraint anexo_miniatura_do_registro check (
    miniatura_caminho is null
    or miniatura_caminho like tenant_id::text || '/' || hotel_id::text || '/' || entidade || '/'
                              || coalesce(chamado_id, ativo_id, local_id, hotel_id)::text || '/%'
  );
create index anexo_chamado_idx on app.anexo (hotel_id, chamado_id) where chamado_id is not null;

drop policy app_select on app.anexo;
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
                                              from authz.locais_proprietario() lp)))
         or (entidade = 'chamado'
             and exists (select 1 from app.chamado c
                         where c.hotel_id = anexo.hotel_id and c.id = anexo.chamado_id
                           and (c.hotel_id in (select authz.hoteis_proprietario())
                                or c.local_id in (select lp.local_id
                                                  from authz.locais_proprietario() lp)))))
  );
