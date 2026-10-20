-- ============================================================================
-- HubKeep — Migração 0060: número do insight (adendo de 20/10/2026 ao ADR-033)
-- ----------------------------------------------------------------------------
-- O número que as pessoas citam ("INS-0133"), sequencial por tenant. A tela
-- mostra e a lista procura por ele; o id continua sendo a chave.
--   - O job grava o número ao abrir o insight: o maior do tenant mais um, na
--     mesma transação (packages/db, abrirInsight). Nenhuma função, sequência
--     ou trigger no banco. A chave única (tenant_id, numero) barra dois
--     insights com o mesmo número se dois jobs do mesmo tenant correrem
--     juntos: um deles falha e roda de novo.
--   - Os insights que já existem recebem o número aqui, pela ordem de
--     abertura (primeira detecção, criação e id) em cada tenant.
--   - Sem UPDATE do número para nenhum papel: o hk_app e o hk_worker mantêm só
--     as colunas que já atualizavam (0038). O INSERT do hk_worker já cobre a
--     coluna nova.
-- Só estrutura: nenhuma policy muda.
-- ============================================================================

alter table app.insight add column numero integer;

update app.insight i
   set numero = n.numero
  from (select id,
               row_number() over (partition by tenant_id
                                  order by primeira_deteccao_em, criado_em, id) as numero
          from app.insight) n
 where n.id = i.id;

alter table app.insight alter column numero set not null;
alter table app.insight
  add constraint insight_numero_positivo check (numero >= 1);
alter table app.insight
  add constraint insight_numero_unico unique (tenant_id, numero);
