-- ============================================================================
-- HubKeep — Migração 0012: proprietário do hotel inteiro vê o hotel sem locais
-- (fase 1a, B1; ADR-031; pendência da A4)
-- ----------------------------------------------------------------------------
-- Na 0011, authz.locais_proprietario() devolvia os locais dos hotéis
-- vinculados por inteiro com um join interno: hotel ainda sem nenhum local não
-- aparecia, e o proprietário não via o hotel (a policy de app.hotel lê o
-- hotel_id da função). Agora o ramo do hotel inteiro usa left join: o hotel
-- sem locais entra com local_id nulo. Nas policies, "id in (select local_id)"
-- não casa com nulo, então o nulo não dá acesso a local nenhum; o hotel_id dá
-- acesso só ao próprio hotel e ao que já é escopo por hotel (política do
-- hotel, A7).
-- Mesma função (nome, assinatura, dona hk_authz, security definer, search_path
-- vazio); só o corpo muda, com o meta-teste 11b atualizado no mesmo PR.
-- ============================================================================

create or replace function authz.locais_proprietario()
returns table (local_id uuid, hotel_id uuid)
language sql stable security definer set search_path = ''
as $$
  select l.id, l.hotel_id
  from app.atribuicao_escopo a
  join app.local_proprietario lp
    on lp.tenant_id = a.tenant_id and lp.proprietario_id = a.proprietario_id
  join app.local l
    on l.tenant_id = lp.tenant_id and l.id = lp.local_id
  where a.tenant_id  = authz.tenant_id()
    and a.usuario_id = authz.usuario_id()
    and a.escopo_tipo = 'proprietario'
    and a.revogado_em is null
    and (a.valido_ate is null or a.valido_ate > now())
    and lp.vigencia_inicio <= current_date
    and (lp.vigencia_fim is null or lp.vigencia_fim >= current_date)
  union
  select l.id, hp.hotel_id
  from app.atribuicao_escopo a
  join app.hotel_proprietario hp
    on hp.tenant_id = a.tenant_id and hp.proprietario_id = a.proprietario_id
  left join app.local l
    on l.tenant_id = hp.tenant_id and l.hotel_id = hp.hotel_id
  where a.tenant_id  = authz.tenant_id()
    and a.usuario_id = authz.usuario_id()
    and a.escopo_tipo = 'proprietario'
    and a.revogado_em is null
    and (a.valido_ate is null or a.valido_ate > now())
    and hp.vigencia_inicio <= current_date
    and (hp.vigencia_fim is null or hp.vigencia_fim >= current_date)
$$;
