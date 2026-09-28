-- ============================================================================
-- HubKeep — Migração 0012: hotéis do proprietário de hotel inteiro
-- (fase 1a, B1; adendo ao ADR-031; pendência da A4)
-- ----------------------------------------------------------------------------
-- Na 0011, o proprietário vinculado a um hotel inteiro via o hotel só pelo
-- hotel_id dos locais (authz.locais_proprietario): hotel ainda sem nenhum local
-- não aparecia. authz.locais_proprietario() continua devolvendo só locais de
-- verdade (nunca local_id nulo; o pgTAP 010 garante). A visibilidade do hotel
-- inteiro vem do vínculo, por uma função própria:
--   authz.hoteis_proprietario() — hotéis dos vínculos app.hotel_proprietario
--   vigentes do proprietário ligado ao usuário. Security definer, dona
--   hk_authz, search_path vazio, como as outras (ADR-004): a policy de
--   app.hotel não lê app.hotel_proprietario, que só o Admin lê (ADR-031).
-- Usada em:
--   - app.hotel (select): o proprietário vê o hotel vinculado, com ou sem locais;
--   - app.politica (select): a política desse hotel e as do grupo.
-- O proprietário continua só leitura: nada disso entra em authz.hoteis_escrita().
-- Função nova: lista do meta-teste 11 e impressão do 11b atualizadas no mesmo PR.
-- ============================================================================

create function authz.hoteis_proprietario() returns setof uuid
language sql stable security definer set search_path = ''
as $$
  select hp.hotel_id
  from app.atribuicao_escopo a
  join app.hotel_proprietario hp
    on hp.tenant_id = a.tenant_id and hp.proprietario_id = a.proprietario_id
  where a.tenant_id  = authz.tenant_id()
    and a.usuario_id = authz.usuario_id()
    and a.escopo_tipo = 'proprietario'
    and a.revogado_em is null
    and (a.valido_ate is null or a.valido_ate > now())
    and hp.vigencia_inicio <= current_date
    and (hp.vigencia_fim is null or hp.vigencia_fim >= current_date)
$$;

-- Posse por hk_authz, como na fundação: CREATE no schema só durante a troca.
grant create on schema authz to hk_authz;
alter function authz.hoteis_proprietario() owner to hk_authz;
revoke create on schema authz from hk_authz;

revoke all on function authz.hoteis_proprietario() from public;
grant execute on function authz.hoteis_proprietario() to hk_app;

alter policy app_select on app.hotel
  using (
    tenant_id = (select authz.tenant_id())
    and (id in (select authz.hoteis_leitura())
         or id in (select lp.hotel_id from authz.locais_proprietario() lp)
         or id in (select authz.hoteis_proprietario()))
  );

alter policy app_select on app.politica
  using (
    tenant_id = (select authz.tenant_id())
    and ((select authz.eh_admin_grupo())
         or hotel_id in (select authz.hoteis_leitura())
         or hotel_id in (select lp.hotel_id from authz.locais_proprietario() lp)
         or hotel_id in (select authz.hoteis_proprietario())
         or (hotel_id is null
             and (exists (select 1 from authz.hoteis_leitura())
                  or exists (select 1 from authz.locais_proprietario())
                  or exists (select 1 from authz.hoteis_proprietario()))))
  );
