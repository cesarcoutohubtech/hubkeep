-- ============================================================================
-- HubKeep — Migração 0051: descarte da sugestão de plano no ativo (fase 1b,
-- M1)
-- ----------------------------------------------------------------------------
-- Decisão do Cesar de 15/10/2026: o plano sugerido pelo modelo do ativo é só
-- uma lista de sugestões para a gestão (o caminho C), com ou sem fila de
-- aprovação. A gestão cria o plano com um clique, pelo hk_app e com autor; a
-- RLS do plano não muda e o worker não ganha permissão. Descartar a sugestão
-- fica gravado no próprio ativo, com quem, quando e o motivo, e o ativo sai
-- da lista. Era para entrar na 0050, que já estava na main quando a decisão
-- veio; por isso, migração nova.
--
-- Tudo o que é regra fica no domínio e na aplicação: quem descarta (a gestão
-- do hotel), o motivo obrigatório e o tamanho dele, o que entra na lista
-- (ativo aprovado, com modelo e sem plano que o cubra) e o contador do
-- painel de implantação. O banco guarda:
--   - sugestao_descartada_em, sugestao_descartada_por e
--     sugestao_descarte_motivo, anuláveis, que andam juntas (as três nulas ou
--     as três preenchidas, com motivo não vazio);
--   - FK composta de quem descartou para app.membro: membro de outro tenant
--     é impossível.
-- O UPDATE segue a policy que já vale para o ativo: quem escreve no hotel.
-- Risco aceito, como na 0042: o GRANT por coluna vale para todos os papéis do
-- hk_app, então o Técnico tem UPDATE, no banco, também nestas colunas. A
-- aplicação só grava por quem gere planos, e toda gravação fica na auditoria.
-- Só estrutura e autorização: nenhuma função, trigger ou regra de negócio.
-- ============================================================================

alter table app.ativo
  add column sugestao_descartada_em   timestamptz,
  add column sugestao_descartada_por  uuid,
  add column sugestao_descarte_motivo text;

alter table app.ativo
  add constraint ativo_sugestao_descartada_por_membro
    foreign key (tenant_id, sugestao_descartada_por) references app.membro (tenant_id, usuario_id),
  add constraint ativo_descarte_da_sugestao_completo check (
    (sugestao_descartada_em is null and sugestao_descartada_por is null
     and sugestao_descarte_motivo is null)
    or (sugestao_descartada_em is not null and sugestao_descartada_por is not null
        and length(btrim(sugestao_descarte_motivo)) > 0)
  );

grant update (sugestao_descartada_em, sugestao_descartada_por, sugestao_descarte_motivo)
  on app.ativo to hk_app;
