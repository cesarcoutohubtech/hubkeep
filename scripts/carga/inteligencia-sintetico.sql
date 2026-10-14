-- Dados sintéticos para o teste de carga do job diário do Intelligence
-- (atividade 2a do Kaio, 12/10/2026). SÓ para um Postgres descartável, com as
-- migrações aplicadas: nunca no dev compartilhado, no staging ou na produção
-- (a métrica só recebe INSERT). Roda como superusuário, sem RLS.
--
-- Um tenant por chamada, com :hoteis hotéis, :ativos_por_hotel ativos por
-- hotel e :chamados_por_dia chamados por dia em cada hotel, em :meses meses
-- até :'agora'. Cada chamado tem uma OS com as transições do caminho feliz;
-- ~65% citam um ativo, com reincidência concentrada (random()^3), e 5% dos
-- que citam ativo têm parada. Os ids são UUID v4 (a aplicação usa v7), o
-- que só muda a ordem física das linhas.
--
-- Parâmetros opcionais (volume comum com a 1c, decidido pelo Kaio em
-- 13/10/2026); sem eles, o script gera o mesmo cenário de antes:
--   :meses           meses de histórico (padrão 12; o mês tem 365/12 dias);
--   :pausa           fração das OS com pausar e retomar (padrão 0);
--   :reabertura      fração das OS concluídas com reabrir e concluir de novo
--                    (padrão 0);
--   :uh_indisponivel fração dos chamados com UH indisponível, sorteada entre
--                    os chamados abertos numa UH (padrão 0);
--   :paradas         fração dos chamados com parada, sorteada entre os que
--                    citam ativo (sem ela, 5% dos que citam ativo).
--
--   Cenário base (2a):
--   psql -v tenant=<uuid> -v hoteis=40 -v ativos_por_hotel=250 \
--        -v chamados_por_dia=5 -v agora='2026-10-13 06:00:00+00' -f ...
--   Volume comum (40 hotéis, 6.000 UHs, 20.000 ativos, 24 meses, 144 mil
--   chamados, ~5 transições por OS, 10% com UH indisponível, 5% com parada):
--   psql -v tenant=<uuid> -v hoteis=40 -v ativos_por_hotel=500 \
--        -v chamados_por_dia=4.9315 -v meses=24 -v pausa=0.25 \
--        -v reabertura=0.25 -v uh_indisponivel=0.10 -v paradas=0.05 \
--        -v agora='2026-10-13 06:00:00+00' -f ...
\set ON_ERROR_STOP on
\if :{?meses}
\else
  \set meses 12
\endif
\if :{?pausa}
\else
  \set pausa 0
\endif
\if :{?reabertura}
\else
  \set reabertura 0
\endif
\if :{?uh_indisponivel}
\else
  \set uh_indisponivel 0
\endif
begin;
select setseed(0.42);

create temp table _p as
select :'tenant'::uuid as t, :hoteis::int as nh, :ativos_por_hotel::int as na,
       :chamados_por_dia::numeric as cpd, :'agora'::timestamptz as agora,
       round(:meses::numeric * 365 / 12)::int as dias,
       :pausa::float8 as pausa, :reabertura::float8 as reabertura,
       :uh_indisponivel::float8 as uh_ind, gen_random_uuid() as u;

insert into app.tenant (id, nome) select t, 'Carga ' || left(t::text, 8) from _p;
insert into licenca.contrato (tenant_id, max_hoteis, max_uhs, atualizado_por)
  select t, nh, nh * 400, 'carga' from _p;
insert into licenca.modulo (id, tenant_id, modulo, inicio, atualizado_por)
  select gen_random_uuid(), t, 'inteligencia', agora - (dias + 35) * interval '1 day', 'carga' from _p;
insert into auth.users (id, email) select u, 'carga-' || left(t::text, 8) || '@exemplo.invalid' from _p;
insert into app.membro (tenant_id, usuario_id, nome, email)
  select t, u, 'Carga', 'carga-' || left(t::text, 8) || '@exemplo.invalid' from _p;

insert into app.situacao (id, tenant_id, entidade, estado, ordem, cor)
  select gen_random_uuid(), t, 'chamado', 'concluido', 1, '#000000' from _p
  union all select gen_random_uuid(), t, 'os', 'aceita', 1, '#000000' from _p;
insert into app.prioridade (id, tenant_id, ordem, peso) select gen_random_uuid(), t, 1, 1 from _p;

create temp table _b as select gen_random_uuid() as id, g from _p, generate_series(1, 4) g;
insert into app.bandeira (id, tenant_id, nome) select id, (select t from _p), 'Bandeira ' || g from _b;

create temp table _h as
select gen_random_uuid() as id, g, (select id from _b where _b.g = 1 + (h.g % 4)) as bandeira
from _p, generate_series(1, (select nh from _p)) as h(g);
insert into app.hotel (id, tenant_id, bandeira_id, nome, fuso, status)
  select id, (select t from _p), bandeira, 'Hotel ' || g, 'America/Sao_Paulo', 'ativo' from _h;

create temp table _c as select gen_random_uuid() as id, g from generate_series(1, 10) g;
insert into app.categoria_ativo (id, tenant_id, chave_padrao) select id, (select t from _p), 'categoria_' || chr(96 + g) from _c;

-- 150 UHs em 10 andares e 30 áreas comuns por hotel.
create temp table _l as
select gen_random_uuid() as id, h.id as hotel, l.g,
       case when l.g <= 150 then 'uh' else 'area_comum' end::app.local_tipo as tipo,
       ((l.g - 1) % 10 + 1)::text as andar
from _h h, generate_series(1, 180) as l(g);
insert into app.local (id, tenant_id, hotel_id, tipo, nome, andar, status, busca)
  select id, (select t from _p), hotel, tipo, 'Local ' || g, andar, 'ativo', 'local ' || g from _l;

create temp table _a as
select gen_random_uuid() as id, h.id as hotel, h.g as hg, a.g,
       (select id from _l where _l.hotel = h.id and _l.g = 151 + (a.g % 30)) as local,
       (select id from _c where _c.g = 1 + (a.g % 10)) as categoria
from _h h, generate_series(1, (select na from _p)) as a(g);
insert into app.ativo (id, tenant_id, hotel_id, local_id, categoria_id, nome, fabricante, modelo,
                       criticidade, codigo_qr, busca, criado_em, garantia_ate)
  select id, (select t from _p), hotel, local, categoria, 'Ativo ' || g, 'Fab ' || (g % 7), 'Mod ' || (g % 13),
         1 + (g % 5), upper(substr(translate(md5(id::text), 'ilou', 'jkmn'), 1, 10)),
         'ativo ' || g, (select agora - (dias + 135) * interval '1 day' from _p),
         case when g % 4 = 0 then ((select agora from _p) + interval '200 days')::date end
  from _a;

-- Chamados: Poisson aproximado por (cpd por dia) uniforme no período.
create temp table _ch as
select gen_random_uuid() as id, h.id as hotel, h.g as hg,
       (select agora from _p) - (random() * (select dias from _p) * interval '1 day') as criado,
       random() as r1, random() as r2, random() as r3
from _h h, generate_series(1, (select (cpd * dias)::int from _p));
-- Os sorteios novos vêm depois dos antigos, para o cenário sem os parâmetros
-- opcionais sair igual ao de antes.
alter table _ch add column ativo uuid, add column local uuid,
  add column r4 float8, add column r5 float8, add column r6 float8, add column r7 float8;
update _ch set r4 = random(), r5 = random(), r6 = random(), r7 = random();
update _ch set ativo = (select a.id from _a a where a.hotel = _ch.hotel
                        and a.g = 1 + floor((select na from _p) * power(_ch.r1, 3))::int)
  where r2 < 0.65;
update _ch set local = coalesce((select local from _a where id = _ch.ativo),
                                (select id from _l where _l.hotel = _ch.hotel and _l.g = 1 + floor(r3 * 180)::int));
insert into app.chamado (id, tenant_id, hotel_id, local_id, ativo_id, descricao, busca, estado,
                         situacao_id, prioridade_id, politica_aplicada, aberto_por, criado_em, impacto_hospede)
  select id, (select t from _p), hotel, local, ativo, 'Sintético', 'sintetico',
         case when criado < (select agora from _p) - interval '2 days' then 'concluido' else 'em_execucao' end,
         (select id from app.situacao where tenant_id = (select t from _p) and entidade = 'chamado'),
         (select id from app.prioridade where tenant_id = (select t from _p)),
         '{}', (select u from _p), criado, r3 < 0.2
  from _ch;

insert into app.os (id, tenant_id, hotel_id, chamado_id, estado, situacao_id, tecnico_id, criado_por,
                    criado_em, local_id, chamado_aberto_por, executado_por, custo_informado)
  select id, (select t from _p), hotel, id,
         case when criado < (select agora from _p) - interval '2 days' then 'aceita' else 'em_execucao' end,
         (select id from app.situacao where tenant_id = (select t from _p) and entidade = 'os'),
         (select u from _p), (select u from _p), criado + interval '1 hour', local, (select u from _p),
         'equipe_interna', case when r1 < 0.3 then round((r2 * 2000)::numeric, 2) end
  from _ch;

insert into app.os_transicao (id, tenant_id, hotel_id, os_id, acao, de, para, quando, usuario_id)
  select gen_random_uuid(), (select t from _p), hotel, id, x.acao, x.de, x.para, criado + x.depois, (select u from _p)
  from _ch, lateral (values
    ('gerar', null, 'atribuida', interval '1 hour', 'base'),
    ('iniciar', 'atribuida', 'em_execucao', interval '3 hours', 'base'),
    ('pausar', 'em_execucao', 'pausada', interval '4 hours', 'pausa'),
    ('retomar', 'pausada', 'em_execucao', interval '5 hours', 'pausa'),
    ('concluir', 'em_execucao', 'concluida', interval '8 hours', 'base'),
    ('reabrir', 'concluida', 'em_execucao', interval '20 hours', 'reabertura'),
    ('concluir', 'em_execucao', 'concluida', interval '26 hours', 'reabertura'),
    ('aceitar', 'concluida', 'aceita', interval '30 hours', 'base')) as x(acao, de, para, depois, grupo)
  where criado + x.depois <= (select agora from _p)
    and (x.acao in ('gerar', 'iniciar', 'pausar', 'retomar')
         or criado < (select agora from _p) - interval '2 days')
    and (x.grupo = 'base'
         or (x.grupo = 'pausa' and r4 < (select pausa from _p))
         or (x.grupo = 'reabertura' and r5 < (select reabertura from _p)));

\if :{?paradas}
-- Exatamente :paradas do total de chamados, entre os que citam ativo.
create temp table _par as
select id from (
  select id, row_number() over (order by r7) as n from _ch
  where ativo is not null and criado + interval '1 hour' < (select agora from _p)) s
where n <= round(:paradas::numeric * (select count(*) from _ch));
\else
create temp table _par as
select id from _ch where ativo is not null and r3 > 0.95 and criado + interval '1 hour' < (select agora from _p);
\endif
insert into app.parada_ativo (id, tenant_id, hotel_id, ativo_id, chamado_id, os_id, inicio, fim,
                              aberta_por, encerrada_por)
  select gen_random_uuid(), (select t from _p), hotel, ativo, id, id, criado + interval '1 hour',
         least(criado + interval '8 hours', (select agora from _p)), (select u from _p), (select u from _p)
  from _ch where id in (select id from _par);

-- UH indisponível: exatamente :uh_indisponivel do total de chamados, entre os
-- abertos numa UH, do chamado até a conclusão (ainda aberta se não concluiu).
insert into app.uh_indisponivel (id, tenant_id, hotel_id, local_id, chamado_id, inicio, fim,
                                 aberta_por, encerrada_por)
  select gen_random_uuid(), (select t from _p), hotel, local, id, criado, fim,
         (select u from _p), case when fim is not null then (select u from _p) end
  from (
    select c.*, case when c.criado + interval '8 hours' <= (select agora from _p)
                     then c.criado + interval '8 hours' end as fim,
           row_number() over (order by c.r6) as n
    from _ch c join _l l on l.id = c.local
    where l.tipo = 'uh') s
  where n <= round((select uh_ind from _p)::numeric * (select count(*) from _ch));

commit;
