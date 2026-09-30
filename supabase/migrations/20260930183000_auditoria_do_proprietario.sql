-- ============================================================================
-- HubKeep — Migração 0028: o proprietário lê a auditoria do que ele vê
-- (fase 1a, D1)
-- ----------------------------------------------------------------------------
-- O histórico de um registro (GET /api/v1/auditoria) e a linha do tempo do
-- chamado (C7) leem app.auditoria com o contexto de quem pede. Até aqui, a
-- leitura era do Admin do grupo e de quem escreve no hotel; o proprietário
-- (somente leitura) não lia nada, e a linha do tempo dele vinha vazia.
--
-- Esta migração soma à policy de leitura as linhas do local, do ativo, do
-- chamado, da OS e da parada que o proprietário vê. "Vê" é a RLS da própria
-- tabela do registro: o EXISTS abaixo roda com o contexto de quem pede, então
-- vale o mesmo recorte das policies de app.local, app.ativo, app.chamado,
-- app.os e app.parada_ativo (a UH vinculada, o hotel inteiro vinculado, o
-- ativo que está na UH agora). O ativo que saiu da UH some do histórico dele,
-- como já some da lista (decisão do Cesar de 28/09/2026).
--
-- Fica de fora a auditoria do hotel (configuração, ativação, o uso da licença
-- na ativação bloqueada) e a de tudo o mais. O filtro por hotel vem antes do
-- EXISTS para que, a quem não é proprietário, a cláusula nova não custe nada.
--
-- Quem escreve no hotel e o Admin do grupo leem como antes. Sem UPDATE nem
-- DELETE para nenhum papel; a escrita não muda. Sem função nova e sem gatilho.
-- ============================================================================

drop policy app_select on app.auditoria;
create policy app_select on app.auditoria for select to hk_app
  using (
    tenant_id = (select authz.tenant_id())
    and ((select authz.eh_admin_grupo())
         or hotel_id in (select authz.hoteis_escrita())
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
                                    and o.id = auditoria.registro_id))
                  or (entidade = 'parada_ativo'
                      and exists (select 1 from app.parada_ativo p
                                  where p.hotel_id = auditoria.hotel_id
                                    and p.id = auditoria.registro_id)))))
  );
