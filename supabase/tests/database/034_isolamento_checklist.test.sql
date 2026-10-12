-- ============================================================================
-- Isolamento de app.checklist_modelo e app.os_checklist (migração 0042, fase
-- 1b PV1; ADR-040). Os seis casos mínimos do doc 02:
--   1. admin de outro tenant não vê nem grava o modelo nem a cópia na OS do
--      tenant A;
--   2. gerente de hotel: o modelo é do grupo (sem hotel_id), então o caso vira
--      "o gerente lê os modelos e não os grava; aplica o checklist na OS do
--      hotel dele e não na de outro hotel". O técnico de outro hotel não vê a
--      cópia;
--   3. o proprietário da UH não lê o modelo, lê a cópia da OS da UH dele e
--      não a altera;
--   4. implantador vencido não vê nada;
--   5. sem contexto, nada;
--   6. FK composta: a categoria do modelo, o modelo da cópia e a OS da cópia
--      só do próprio tenant e do próprio hotel; mais a integridade das duas
--      tabelas (nomes com ao menos um idioma, itens como lista, respostas
--      como objeto, versão positiva, uma cópia por OS).
-- Mais: o modelo é lido pela gestão e pelo Implantador, e não pelo Técnico,
-- pelo Solicitante nem pelo proprietário; só o Admin do grupo cria e altera o
-- modelo; a gestão aplica em nome dela mesma e troca o modelo; o Técnico
-- responsável (ele, ou membro ativo da equipe) altera as respostas, e outro
-- Técnico do hotel não; id, tenant, hotel, OS e autor não são alteráveis; sem
-- DELETE; o worker vê só o tenant do job e não grava.
-- ============================================================================
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(64);

grant usage on schema extensions to hk_app, hk_worker;

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'admin@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'gerente@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000003', 'gestor@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000004', 'tecnico@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000005', 'tecnico-equipe@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000006', 'proprietario@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000007', 'tecnico-h2@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000008', 'implantador-vencido@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000009', 'solicitante@a.test'),
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'implantador@a.test'),
  ('aaaaaaaa-0000-0000-0000-00000000000b', 'tecnico-fora@a.test'),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'admin@b.test');

insert into app.tenant (id, nome) values
  ('10000000-0000-0000-0000-000000000000', 'Grupo A'),
  ('20000000-0000-0000-0000-000000000000', 'Grupo B');
insert into app.membro (tenant_id, usuario_id, nome, email)
select '10000000-0000-0000-0000-000000000000', id, email, email from auth.users where email like '%@a.test';
insert into app.membro (tenant_id, usuario_id, nome, email) values
  ('20000000-0000-0000-0000-000000000000', 'bbbbbbbb-0000-0000-0000-000000000001', 'Admin B', 'admin@b.test');
insert into app.hotel (id, tenant_id, nome, fuso, status) values
  ('11100000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', 'Hotel 1', 'UTC', 'ativo'),
  ('11100000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000000', 'Hotel 2', 'UTC', 'ativo'),
  ('22200000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000000', 'Hotel B', 'UTC', 'ativo');
insert into app.local (id, tenant_id, hotel_id, tipo, nome, busca, status) values
  ('11110000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'uh', 'UH 101', 'uh 101', 'ativo'),
  ('11110000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'uh', 'UH 102', 'uh 102', 'ativo'),
  ('11120000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000002', 'uh', 'UH 201', 'uh 201', 'ativo'),
  ('22210000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000000', '22200000-0000-0000-0000-000000000001', 'uh', 'UH B', 'uh b', 'ativo');
insert into app.proprietario (id, tenant_id, nome) values
  ('11200000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', 'Dono da UH 101');
insert into app.local_proprietario (id, tenant_id, proprietario_id, local_id, vigencia_inicio) values
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11200000-0000-0000-0000-000000000001',
   '11110000-0000-0000-0000-000000000001', current_date - 1);
insert into app.atribuicao_escopo (id, tenant_id, usuario_id, papel, escopo_tipo, hotel_id, proprietario_id, valido_ate, concedido_por) values
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000001', 'admin_grupo', 'grupo', null, null, null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000002', 'gerente_hotel', 'hotel', '11100000-0000-0000-0000-000000000001', null, null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000003', 'gestor_csc', 'hotel', '11100000-0000-0000-0000-000000000001', null, null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000004', 'tecnico', 'hotel', '11100000-0000-0000-0000-000000000001', null, null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000005', 'tecnico', 'hotel', '11100000-0000-0000-0000-000000000001', null, null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000006', 'proprietario', 'proprietario', null, '11200000-0000-0000-0000-000000000001', null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000007', 'tecnico', 'hotel', '11100000-0000-0000-0000-000000000002', null, null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000008', 'implantador', 'hotel', '11100000-0000-0000-0000-000000000001', null, now() - interval '1 day', 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000009', 'solicitante', 'hotel', '11100000-0000-0000-0000-000000000001', null, null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-00000000000a', 'implantador', 'hotel', '11100000-0000-0000-0000-000000000001', null, null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-00000000000b', 'tecnico', 'hotel', '11100000-0000-0000-0000-000000000001', null, null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '20000000-0000-0000-0000-000000000000', 'bbbbbbbb-0000-0000-0000-000000000001', 'admin_grupo', 'grupo', null, null, null, 'bbbbbbbb-0000-0000-0000-000000000001');
insert into app.equipe (id, tenant_id, hotel_id, nome) values
  ('e1000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'Manutenção H1');
insert into app.equipe_membro (tenant_id, hotel_id, equipe_id, usuario_id, ativo) values
  ('10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000005', true),
  ('10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-00000000000b', false);
insert into app.categoria_ativo (id, tenant_id, chave_padrao) values
  ('ca000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', 'ar_condicionado'),
  ('cb000000-0000-0000-0000-00000000000c', '20000000-0000-0000-0000-000000000000', 'ar_condicionado');
-- Modelos: m1 do ar-condicionado, m2 sem categoria e desativado (tenant A); mb no tenant B.
insert into app.checklist_modelo (id, tenant_id, categoria_id, nomes, itens, versao, ativa) values
  ('cc100000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', 'ca000000-0000-0000-0000-000000000001',
   '{"pt-BR": "Inspeção de ar-condicionado"}',
   '[{"chave": "filtro_limpo", "tipo": "sim_nao", "obrigatorio": true, "rotulos": {"pt-BR": "Filtro limpo"}, "unidade": null, "opcoes": []}]', 2, true),
  ('cc100000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000000', null,
   '{"pt-BR": "Antigo"}', '[]', 1, false),
  ('ccb00000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000000', null,
   '{"pt-BR": "Modelo B"}', '[]', 1, true);

insert into app.situacao (id, tenant_id, entidade, estado, chave_padrao, ordem, cor) values
  ('5a000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', 'chamado', 'em_execucao', 'chamado_em_execucao', 10, '#2563eb'),
  ('5a000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000000', 'os', 'em_execucao', 'os_em_execucao', 10, '#2563eb'),
  ('5b000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000000', 'chamado', 'em_execucao', 'chamado_em_execucao', 10, '#2563eb'),
  ('5b000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000000', 'os', 'em_execucao', 'os_em_execucao', 10, '#2563eb');
insert into app.prioridade (id, tenant_id, chave_padrao, ordem, peso) values
  ('9a000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', 'baixa', 40, 10),
  ('9b000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000000', 'baixa', 40, 10);
-- c1 (UH 101, do técnico), c3 (UH 102, da equipe), c4 (UH 102, sem checklist),
-- c2 (Hotel 2), cb (tenant B).
insert into app.chamado (id, tenant_id, hotel_id, local_id, descricao, busca, estado, situacao_id, prioridade_id, politica_aplicada, aberto_por)
select c.id::uuid, c.tenant::uuid, c.hotel::uuid, c.local::uuid, c.descricao, c.descricao, 'em_execucao', c.situacao::uuid,
       c.prioridade::uuid, '{}', c.aberto_por::uuid
from (values
  ('c1000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', '11110000-0000-0000-0000-000000000001', 'ar não gela', '5a000000-0000-0000-0000-000000000001', '9a000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000002'),
  ('c1000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', '11110000-0000-0000-0000-000000000002', 'ar pingando', '5a000000-0000-0000-0000-000000000001', '9a000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000002'),
  ('c1000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', '11110000-0000-0000-0000-000000000002', 'ar barulhento', '5a000000-0000-0000-0000-000000000001', '9a000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000002'),
  ('c2000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000002', '11120000-0000-0000-0000-000000000001', 'porta', '5a000000-0000-0000-0000-000000000001', '9a000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('cb000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000000', '22200000-0000-0000-0000-000000000001', '22210000-0000-0000-0000-000000000001', 'chamado b', '5b000000-0000-0000-0000-000000000001', '9b000000-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001')
) as c (id, tenant, hotel, local, descricao, situacao, prioridade, aberto_por);
insert into app.os (id, tenant_id, hotel_id, chamado_id, local_id, chamado_aberto_por, estado, situacao_id, tecnico_id, equipe_id, criado_por) values
  ('0a100000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', '11110000-0000-0000-0000-000000000001',
   'aaaaaaaa-0000-0000-0000-000000000002', 'em_execucao', '5a000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000004', null, 'aaaaaaaa-0000-0000-0000-000000000002'),
  ('0a100000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000003', '11110000-0000-0000-0000-000000000002',
   'aaaaaaaa-0000-0000-0000-000000000002', 'em_execucao', '5a000000-0000-0000-0000-000000000002', null, 'e1000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000002'),
  ('0a100000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000004', '11110000-0000-0000-0000-000000000002',
   'aaaaaaaa-0000-0000-0000-000000000002', 'em_execucao', '5a000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000004', null, 'aaaaaaaa-0000-0000-0000-000000000002'),
  ('0a200000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000002', 'c2000000-0000-0000-0000-000000000001', '11120000-0000-0000-0000-000000000001',
   'aaaaaaaa-0000-0000-0000-000000000001', 'em_execucao', '5a000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000007', null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('0ab00000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000000', '22200000-0000-0000-0000-000000000001', 'cb000000-0000-0000-0000-000000000001', '22210000-0000-0000-0000-000000000001',
   'bbbbbbbb-0000-0000-0000-000000000001', 'em_execucao', '5b000000-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000001', null, 'bbbbbbbb-0000-0000-0000-000000000001');
-- Cópias: k1 na OS do técnico (UH 101), k3 na OS da equipe (UH 102), kb no tenant B.
insert into app.os_checklist (id, tenant_id, hotel_id, os_id, modelo_id, modelo_versao, nomes, itens, criado_por) values
  ('ac100000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', '0a100000-0000-0000-0000-000000000001',
   'cc100000-0000-0000-0000-000000000001', 2, '{"pt-BR": "Inspeção de ar-condicionado"}', '[]', 'aaaaaaaa-0000-0000-0000-000000000002'),
  ('ac100000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', '0a100000-0000-0000-0000-000000000003',
   'cc100000-0000-0000-0000-000000000001', 2, '{"pt-BR": "Inspeção de ar-condicionado"}', '[]', 'aaaaaaaa-0000-0000-0000-000000000002'),
  ('acb00000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000000', '22200000-0000-0000-0000-000000000001', '0ab00000-0000-0000-0000-000000000001',
   'ccb00000-0000-0000-0000-000000000001', 1, '{"pt-BR": "Modelo B"}', '[]', 'bbbbbbbb-0000-0000-0000-000000000001');

-- Caso 6 — FK composta e integridade (como postgres)
select throws_ok(
  $$ insert into app.checklist_modelo (id, tenant_id, categoria_id, nomes) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'cb000000-0000-0000-0000-00000000000c', '{"pt-BR": "x"}') $$,
  '23503', null, 'modelo só com categoria do próprio tenant');
select throws_ok(
  $$ insert into app.os_checklist (id, tenant_id, hotel_id, os_id, modelo_id, modelo_versao, nomes, itens, criado_por) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', '0a100000-0000-0000-0000-000000000004',
      'ccb00000-0000-0000-0000-000000000001', 1, '{"pt-BR": "x"}', '[]', 'aaaaaaaa-0000-0000-0000-000000000002') $$,
  '23503', null, 'a cópia só aponta para modelo do próprio tenant');
select throws_ok(
  $$ insert into app.os_checklist (id, tenant_id, hotel_id, os_id, modelo_id, modelo_versao, nomes, itens, criado_por) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', '0a200000-0000-0000-0000-000000000001',
      'cc100000-0000-0000-0000-000000000001', 1, '{"pt-BR": "x"}', '[]', 'aaaaaaaa-0000-0000-0000-000000000002') $$,
  '23503', null, 'a cópia só aponta para OS do próprio hotel');
select throws_ok(
  $$ insert into app.os_checklist (id, tenant_id, hotel_id, os_id, modelo_id, modelo_versao, nomes, itens, criado_por) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', '0a100000-0000-0000-0000-000000000001',
      'cc100000-0000-0000-0000-000000000001', 2, '{"pt-BR": "x"}', '[]', 'aaaaaaaa-0000-0000-0000-000000000002') $$,
  '23505', null, 'uma cópia por OS');
select throws_ok(
  $$ insert into app.checklist_modelo (id, tenant_id, nomes) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '{}') $$,
  '23514', null, 'modelo com nome em ao menos um idioma');
select throws_ok(
  $$ insert into app.checklist_modelo (id, tenant_id, nomes, itens) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '{"pt-BR": "x"}', '{}') $$,
  '23514', null, 'os itens do modelo são uma lista');
select throws_ok(
  $$ insert into app.checklist_modelo (id, tenant_id, nomes, versao) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '{"pt-BR": "x"}', 0) $$,
  '23514', null, 'a versão do modelo começa em 1');
select throws_ok(
  $$ update app.os_checklist set respostas = '[]' where id = 'ac100000-0000-0000-0000-000000000001' $$,
  '23514', null, 'as respostas são um objeto por item');
select throws_ok(
  $$ update app.os_checklist set itens = '{}' where id = 'ac100000-0000-0000-0000-000000000001' $$,
  '23514', null, 'os itens da cópia são uma lista');

set local role hk_app;

-- Caso 5 — sem contexto
select from (select set_config('app.usuario_id', '', true), set_config('app.tenant_id', '', true)) ctx;
select is_empty('select 1 from app.checklist_modelo', 'sem contexto: nenhum modelo');
select is_empty('select 1 from app.os_checklist', 'sem contexto: nenhuma cópia');

-- Caso 1 — admin B
select from (select set_config('app.usuario_id', 'bbbbbbbb-0000-0000-0000-000000000001', true),
       set_config('app.tenant_id',  '20000000-0000-0000-0000-000000000000', true)) ctx;
select results_eq($$ select id::text from app.checklist_modelo $$,
  $$ values ('ccb00000-0000-0000-0000-000000000001') $$, 'admin B vê só os modelos do B');
select results_eq($$ select id::text from app.os_checklist $$,
  $$ values ('acb00000-0000-0000-0000-000000000001') $$, 'admin B vê só as cópias do B');
select is_empty($$ update app.checklist_modelo set ativa = false
                   where tenant_id = '10000000-0000-0000-0000-000000000000' returning 1 $$,
  'admin B não altera modelo do A');
select throws_ok(
  $$ insert into app.checklist_modelo (id, tenant_id, nomes) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '{"pt-BR": "Intruso"}') $$,
  '42501', null, 'admin B não cria modelo no A');
select is_empty($$ update app.os_checklist set respostas = '{}'
                   where tenant_id = '10000000-0000-0000-0000-000000000000' returning 1 $$,
  'admin B não altera a cópia na OS do A');

-- Caso 2 — gerente do Hotel 1: lê os modelos, não os grava; aplica na OS do hotel dele
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000002', true),
       set_config('app.tenant_id',  '10000000-0000-0000-0000-000000000000', true)) ctx;
select results_eq($$ select count(*)::int from app.checklist_modelo $$, $$ values (2) $$,
  'gerente lê os modelos do grupo, inclusive o desativado');
select throws_ok(
  $$ insert into app.checklist_modelo (id, tenant_id, nomes) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '{"pt-BR": "Do gerente"}') $$,
  '42501', null, 'gerente não cria modelo');
select is_empty($$ update app.checklist_modelo set ativa = false returning 1 $$,
  'gerente não altera modelo');
select results_eq($$ select count(*)::int from app.os_checklist $$, $$ values (2) $$,
  'gerente lê as cópias das OS do hotel dele');
select lives_ok(
  $$ insert into app.os_checklist (id, tenant_id, hotel_id, os_id, modelo_id, modelo_versao, nomes, itens, criado_por) values
     ('ac100000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
      '0a100000-0000-0000-0000-000000000004', 'cc100000-0000-0000-0000-000000000001', 2,
      '{"pt-BR": "Inspeção de ar-condicionado"}', '[]', 'aaaaaaaa-0000-0000-0000-000000000002') $$,
  'gerente aplica o checklist na OS do hotel dele, em nome dele');
select throws_ok(
  $$ insert into app.os_checklist (id, tenant_id, hotel_id, os_id, modelo_id, modelo_versao, nomes, itens, criado_por) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000002',
      '0a200000-0000-0000-0000-000000000001', 'cc100000-0000-0000-0000-000000000001', 2,
      '{"pt-BR": "x"}', '[]', 'aaaaaaaa-0000-0000-0000-000000000002') $$,
  '42501', null, 'gerente não aplica na OS de outro hotel');
select isnt_empty($$ update app.os_checklist set modelo_id = 'cc100000-0000-0000-0000-000000000002', modelo_versao = 1,
                                                nomes = '{"pt-BR": "Antigo"}', itens = '[]', atualizado_em = now()
                     where id = 'ac100000-0000-0000-0000-000000000004' returning 1 $$,
  'gerente troca o modelo aplicado');

-- Gestor CSC do Hotel 1: lê os modelos e aplica, em nome dele e não de outro
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000003', true)) ctx;
select results_eq($$ select count(*)::int from app.checklist_modelo $$, $$ values (2) $$,
  'gestor CSC lê os modelos do grupo');
select throws_ok(
  $$ insert into app.os_checklist (id, tenant_id, hotel_id, os_id, modelo_id, modelo_versao, nomes, itens, criado_por) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
      '0a100000-0000-0000-0000-000000000004', 'cc100000-0000-0000-0000-000000000001', 2,
      '{"pt-BR": "x"}', '[]', 'aaaaaaaa-0000-0000-0000-000000000002') $$,
  '42501', null, 'gestor CSC não aplica em nome de outro');

-- Técnico responsável pela OS 1: não lê o modelo, lê a cópia, altera as respostas da OS dele
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000004', true)) ctx;
select is_empty('select 1 from app.checklist_modelo', 'técnico não lê o modelo');
select results_eq($$ select count(*)::int from app.os_checklist $$, $$ values (3) $$,
  'técnico lê as cópias das OS que ele vê (as do hotel)');
select isnt_empty($$ update app.os_checklist set respostas = '{"filtro_limpo": {"valor": true}}', atualizado_em = now()
                     where id = 'ac100000-0000-0000-0000-000000000001' returning 1 $$,
  'técnico responsável responde o checklist da OS dele');
select is_empty($$ update app.os_checklist set respostas = '{}'
                   where id = 'ac100000-0000-0000-0000-000000000003' returning 1 $$,
  'técnico não responde o checklist da OS da equipe de que não é membro');
select throws_ok(
  $$ insert into app.os_checklist (id, tenant_id, hotel_id, os_id, modelo_id, modelo_versao, nomes, itens, criado_por) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
      '0a100000-0000-0000-0000-000000000003', 'cc100000-0000-0000-0000-000000000001', 2,
      '{"pt-BR": "x"}', '[]', 'aaaaaaaa-0000-0000-0000-000000000004') $$,
  '42501', null, 'técnico não aplica checklist');
select throws_ok(
  $$ insert into app.checklist_modelo (id, tenant_id, nomes) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '{"pt-BR": "Do técnico"}') $$,
  '42501', null, 'técnico não cria modelo');

-- Membro ativo da equipe: responde a OS da equipe; o inativo, não
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000005', true)) ctx;
select isnt_empty($$ update app.os_checklist set respostas = '{"filtro_limpo": {"valor": false}}'
                     where id = 'ac100000-0000-0000-0000-000000000003' returning 1 $$,
  'membro ativo da equipe responde o checklist da OS da equipe');
select is_empty($$ update app.os_checklist set respostas = '{}'
                   where id = 'ac100000-0000-0000-0000-000000000001' returning 1 $$,
  'técnico que não é o responsável não responde o checklist da OS');
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-00000000000b', true)) ctx;
select is_empty($$ update app.os_checklist set respostas = '{}'
                   where id = 'ac100000-0000-0000-0000-000000000003' returning 1 $$,
  'membro inativo da equipe não responde o checklist da OS dela');

-- Técnico do Hotel 2: não vê as cópias do Hotel 1
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000007', true)) ctx;
select is_empty($$ select 1 from app.os_checklist where hotel_id = '11100000-0000-0000-0000-000000000001' $$,
  'técnico de outro hotel não vê a cópia');
select is_empty($$ update app.os_checklist set respostas = '{}' returning 1 $$,
  'técnico de outro hotel não responde o checklist');

-- Solicitante do Hotel 1: não lê o modelo, não altera a cópia
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000009', true)) ctx;
select is_empty('select 1 from app.checklist_modelo', 'solicitante não lê o modelo');
select is_empty($$ update app.os_checklist set respostas = '{}' returning 1 $$,
  'solicitante não responde o checklist');

-- Implantador vigente do Hotel 1: lê os modelos, não os grava
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-00000000000a', true)) ctx;
select results_eq($$ select count(*)::int from app.checklist_modelo $$, $$ values (2) $$,
  'implantador lê os modelos do grupo');
select throws_ok(
  $$ insert into app.checklist_modelo (id, tenant_id, nomes) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '{"pt-BR": "Do implantador"}') $$,
  '42501', null, 'implantador não cria modelo');
select is_empty($$ update app.os_checklist set respostas = '{}' returning 1 $$,
  'implantador não responde o checklist');

-- Caso 3 — proprietário da UH 101: não lê o modelo; lê a cópia da OS da UH dele e não altera
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000006', true)) ctx;
select is_empty('select 1 from app.checklist_modelo', 'proprietário não lê o modelo');
select results_eq($$ select id::text from app.os_checklist $$,
  $$ values ('ac100000-0000-0000-0000-000000000001') $$,
  'proprietário lê só a cópia da OS da UH dele');
select is_empty($$ update app.os_checklist set respostas = '{}' returning 1 $$,
  'proprietário não altera a cópia');
select throws_ok(
  $$ insert into app.checklist_modelo (id, tenant_id, nomes) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '{"pt-BR": "Do dono"}') $$,
  '42501', null, 'proprietário não cria modelo');

-- Caso 4 — implantador vencido
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000008', true)) ctx;
select is_empty('select 1 from app.checklist_modelo', 'implantador vencido não vê modelo');
select is_empty('select 1 from app.os_checklist', 'implantador vencido não vê cópia');

-- Admin A: cria e altera o modelo; o escopo não muda; sem DELETE
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000001', true)) ctx;
select lives_ok(
  $$ insert into app.checklist_modelo (id, tenant_id, categoria_id, nomes, itens) values
     ('cc100000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000000',
      'ca000000-0000-0000-0000-000000000001', '{"pt-BR": "Limpeza de filtro", "en": "Filter cleaning"}', '[]') $$,
  'admin cria modelo com nome por idioma');
select isnt_empty($$ update app.checklist_modelo
                       set itens = '[{"chave": "pressao", "tipo": "numero", "obrigatorio": false, "rotulos": {"pt-BR": "Pressão"}, "unidade": "psi", "opcoes": []}]',
                           versao = 2, nomes = '{"pt-BR": "Limpeza e pressão"}', categoria_id = null, atualizado_em = now()
                     where id = 'cc100000-0000-0000-0000-000000000003' returning 1 $$,
  'admin altera itens, versão, nomes e categoria do modelo');
select isnt_empty($$ update app.checklist_modelo set ativa = false
                     where id = 'cc100000-0000-0000-0000-000000000003' returning 1 $$,
  'admin desativa modelo');
select isnt_empty($$ update app.checklist_modelo set nomes = '{"pt-BR": "Inspeção nova"}', versao = 3
                     where id = 'cc100000-0000-0000-0000-000000000001' returning 1 $$,
  'admin muda o modelo já aplicado em OS');
select throws_ok($$ update app.checklist_modelo set id = gen_random_uuid() $$, '42501', null,
  'o id do modelo não é alterável');
select throws_ok($$ update app.checklist_modelo set tenant_id = '20000000-0000-0000-0000-000000000000' $$,
  '42501', null, 'o tenant do modelo não é alterável');
select throws_ok($$ delete from app.checklist_modelo $$, '42501', null, 'sem DELETE em modelo');
select throws_ok($$ update app.os_checklist set hotel_id = '11100000-0000-0000-0000-000000000002' $$,
  '42501', null, 'o hotel da cópia não é alterável');
select throws_ok($$ update app.os_checklist set os_id = '0a100000-0000-0000-0000-000000000004' $$,
  '42501', null, 'a OS da cópia não é alterável');
select throws_ok($$ update app.os_checklist set criado_por = 'aaaaaaaa-0000-0000-0000-000000000001' $$,
  '42501', null, 'quem aplicou não é alterável');
select throws_ok($$ delete from app.os_checklist $$, '42501', null, 'sem DELETE em cópia');
select results_eq(
  $$ select respostas -> 'filtro_limpo' ->> 'valor' from app.os_checklist
     where id = 'ac100000-0000-0000-0000-000000000001' $$,
  $$ values ('true') $$,
  'a cópia guarda a resposta do técnico');
select results_eq(
  $$ select modelo_versao, nomes ->> 'pt-BR' from app.os_checklist
     where id = 'ac100000-0000-0000-0000-000000000001' $$,
  $$ values (2, 'Inspeção de ar-condicionado') $$,
  'mudar o modelo não altera a cópia na OS');
reset role;

-- Worker: só o tenant do job, sem gravar
set local role hk_worker;
select from (select set_config('app.tenant_id', '10000000-0000-0000-0000-000000000000', true)) ctx;
select results_eq('select count(distinct tenant_id)::int from app.checklist_modelo', $$ values (1) $$,
  'worker vê só os modelos do tenant do job');
select results_eq('select count(*)::int from app.os_checklist', $$ values (3) $$,
  'worker vê as cópias do tenant do job');
select throws_ok(
  $$ insert into app.checklist_modelo (id, tenant_id, nomes) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '{"pt-BR": "Do worker"}') $$,
  '42501', null, 'worker não cria modelo');
select throws_ok($$ update app.os_checklist set respostas = '{}' $$, '42501', null,
  'worker não altera a cópia');
reset role;

select * from finish();
rollback;
