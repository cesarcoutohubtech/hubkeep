# Carga do job diário do Intelligence (13/10/2026)

Atividade 2a do Kaio (12/10/2026): o job diário na escala da rede, com dados sintéticos de 40 hotéis, cerca de 10 mil ativos e um ano de OS, o tempo por tenant e a comparação com o limite das funções agendadas da Vercel. **Só números; as otimizações ficam para depois da leitura deles.**

## Como foi medido

- **Banco:** Postgres 16.15 descartável, no contêiner da sessão do agente (4 vCPU Intel Xeon 2,3 GHz, 15 GB), com as 41 migrações de `supabase/migrations` e um calço mínimo do que o Supabase traz (os papéis `anon`, `authenticated` e `service_role`, `auth.users`, `storage.buckets` e `storage.objects`). O Supabase usa o Postgres 17. **Não foi o dev:** ele é compartilhado, e a métrica só recebe INSERT.
- **Dados:** `scripts/carga/inteligencia-sintetico.sql`, um tenant por chamada:
  - 40 hotéis em 4 bandeiras, 180 locais por hotel (7.200), 250 ativos por hotel (10.000) e 10 categorias;
  - chamados uniformes no ano até 13/10/2026 06:00 UTC, uma OS por chamado, as transições do caminho feliz (gerar, iniciar, concluir e aceitar) e paradas em 5% dos chamados com ativo;
  - 65% dos chamados citam um ativo, com reincidência concentrada (sorteio por `random()^3`).
- **Dois cenários:**
  - **base:** 5 chamados por dia por hotel, ou seja 73.000 chamados e OS, 291.120 transições e 2.351 paradas no ano; 35.683 chamados nos últimos 180 dias;
  - **dobro:** 10 chamados por dia por hotel (146.000 chamados no ano).
- **Executor:** `apps/web/test/carga-inteligencia.test.ts`, pulado sem `HK_CARGA_URL_WORKER`. Chama o mesmo `jobDoDia` da rota `/api/cron/inteligencia`, com o `hk_worker` e uma transação por tenant, e cronometra cada leitura e gravação da sessão. O que sobra é o cálculo em memória.
- **Rodadas:** o mesmo dia duas vezes (a segunda não grava a métrica, porque o dia já está gravado) e os dias seguintes, como o cron faria.

## Resultados por tenant (uma rodada do job, em ms)

**Base (40 hotéis, 10 mil ativos, 5 chamados por dia por hotel):**

| Dia | Total | Leitura dos chamados | Gravação da métrica | Cálculo | Outras leituras e gravações | Métricas gravadas | Insights abertos / atualizados |
|---|---:|---:|---:|---:|---:|---:|---:|
| 13/10 (1ª) | 3.868 | 1.731 | 1.540 | 450 | 147 | 10.000 | 23 / 0 |
| 13/10 (2ª) | 1.920 | 1.450 | 0 | 352 | 118 | 0 | 0 / 23 |
| 14/10 | 4.929 | 2.806 | 1.733 | 279 | 111 | 10.000 | 0 / 20 |
| 15/10 | 3.931 | 1.800 | 1.723 | 293 | 115 | 10.000 | 0 / 20 |
| 16/10 | 5.250 | 2.222 | 2.078 | 837 | 113 | 10.000 | 0 / 19 |
| 17/10 | 4.164 | 1.861 | 1.814 | 398 | 91 | 10.000 | 1 / 18 |

**Dobro (40 hotéis, 10 mil ativos, 10 chamados por dia por hotel):**

| Dia | Total | Leitura dos chamados | Gravação da métrica | Cálculo | Métricas gravadas |
|---|---:|---:|---:|---:|---:|
| 13/10 (1ª) | 10.666 | 7.086 | 2.085 | 1.285 | 10.000 |
| 13/10 (2ª) | 5.567 | 4.776 | 0 | 549 | 0 |
| 14/10 | 7.136 | 4.876 | 1.509 | 587 | 10.000 |
| 15/10 | 8.290 | 5.152 | 1.662 | 1.313 | 10.000 |

**Memória:** o heap usado numa rodada fica entre 350 e 380 MB no cenário base e chega a 690 MB no dobro. O RSS do processo passou de 1,1 GB no base e de 1,5 GB no dobro, ao longo de várias rodadas no mesmo processo.

**Leitura:**
- Uma rodada do tenant de 40 hotéis leva de 4 a 5 s no cenário base e de 7 a 11 s no dobro.
- Quase todo o tempo é a leitura dos chamados do período (chamados, OS e transições) e a gravação das 10 mil linhas da métrica, em lotes de 500. O cálculo em memória fica abaixo de 1,3 s.
- **Dobrar os chamados mais que dobra a leitura dos chamados** (de 1,7 a 2,8 s para 4,8 a 7,1 s). A causa não foi investigada: fica para a proposta de otimização.
- Os limites do `hk_worker` (`statement_timeout` de 30 s e `idle_in_transaction_session_timeout` de 15 s, migração 0002) ficam longe: a consulta mais lenta levou 7 s, e o maior intervalo entre consultas (o cálculo) 1,3 s.

## O limite da Vercel

O acesso ao vercel.com está bloqueado pela rede do contêiner do agente, então as páginas não foram abertas direto. A busca na documentação da Vercel ([Configuring Maximum Duration](https://vercel.com/docs/functions/configuring-functions/duration), [Functions Limits](https://vercel.com/docs/functions/limitations), [Fluid compute](https://vercel.com/docs/fluid-compute) e o changelog de 30 minutos) devolveu, com o Fluid compute ligado (o padrão dos projetos novos):
- **Hobby:** 300 s, padrão e máximo;
- **Pro e Enterprise:** 300 s de padrão e 800 s de máximo; até 1.800 s em beta, configurando `maxDuration` em cada função;
- **Cron:** a busca não trouxe limite próprio da função chamada pelo cron. As páginas dizem só que são até 100 cron jobs por projeto, em todos os planos.

**Pendente de conferência por uma pessoa na página da Vercel**, antes de usar estes números numa decisão: o limite da função chamada pelo cron e o plano do projeto. O `docs/04` prevê o Vercel Pro, ainda a contratar (F0-12).

**Comparação:** a rota roda os tenants em sequência (`rodarPorTenant`). Com o padrão de 300 s, uma rodada de 5 s (base) usa menos de 2% do limite, e uma de 11 s (dobro) menos de 4%. O piloto tem um tenant.

## O que esta medição não mostra

- **O banco do Supabase** é outro: a instância do plano (CPU e memória), o Postgres 17, o Supavisor em modo transação e a rede entre a Vercel (`gru1`) e o Supabase (São Paulo). A leitura dos chamados e a gravação da métrica dependem disso. A medida que vale é a rodada no staging, com o volume do piloto.
- **A memória da função:** o heap de 350 a 690 MB por rodada e o RSS que cresce entre rodadas pedem conferência na Vercel, contra a memória configurada da função.
- **Dados reais:** a distribuição dos chamados por ativo, o número de transições por OS (reaberturas, pausas) e as paradas são sintéticos.

## Volume comum com a 1c (14/10/2026)

O Kaio aceitou em 13/10/2026 o volume proposto pela 1c ("Kaio aqui; aprovo [...] a decisão do volume comum"), para os dois módulos medirem com o mesmo. Registro em `docs/diario-intelligence.md`, "Resposta do Kaio (13/10/2026)". O script ganhou cinco parâmetros opcionais; sem eles, gera o cenário base de antes, conferido de novo: 73.000 chamados, 291.120 transições e 2.351 paradas.

| Parâmetro | O que faz | Volume comum |
|---|---|---|
| `meses` | meses de histórico (o mês tem 365/12 dias); padrão 12 | 24 |
| `pausa` | fração das OS com pausar e retomar; padrão 0 | 0,25 |
| `reabertura` | fração das OS concluídas que são reabertas e concluídas de novo; padrão 0 | 0,25 |
| `uh_indisponivel` | fração dos chamados com UH indisponível, sorteada entre os abertos numa UH; padrão 0 | 0,10 |
| `paradas` | fração dos chamados com parada, sorteada entre os que citam ativo; sem ela, 5% dos que citam ativo | 0,05 |

Com 500 ativos por hotel e 4,9315 chamados por dia por hotel (150 por mês), o script gerou:
- 40 hotéis, 6.000 UHs, 20.000 ativos;
- 144.000 chamados e OS, de 13/10/2024 a 13/10/2026;
- 718.864 transições, 4,99 por OS;
- 7.200 paradas (5%) e 14.400 UHs indisponíveis (10%);
- 35.316 chamados nos últimos 180 dias, quase o mesmo do cenário base: a leitura do job é de 180 dias, então os 24 meses pesam mais no tamanho das tabelas do que nos chamados lidos.

A geração levou 6 min 40 s no mesmo Postgres descartável do contêiner (agora com as 48 migrações), no mesmo banco que o cenário base.

**Uma rodada do job, em ms:**

| Dia | Total | Leitura dos chamados | Gravação da métrica | Cálculo | Métricas gravadas | Insights abertos / atualizados |
|---|---:|---:|---:|---:|---:|---:|
| 13/10 (1ª) | 18.751 | 8.845 | 7.340 | 1.900 | 20.000 | 41 / 0 |
| 13/10 (2ª) | 8.940 | 7.428 | 0 | 1.137 | 0 | 0 / 41 |
| 14/10 | 14.376 | 6.433 | 6.718 | 907 | 20.000 | 1 / 35 |
| 15/10 | 17.725 | 8.066 | 8.311 | 990 | 20.000 | 2 / 31 |

**Leitura:**
- Uma rodada leva de 9 a 19 s. Com o padrão de 300 s da Vercel, fica abaixo de 7% do limite.
- **A leitura dos chamados** levou de 6,4 a 8,8 s, de 3 a 4 vezes a do cenário base, com quase o mesmo número de chamados no período. Muda o tamanho das tabelas (o dobro dos chamados e das transições no banco, mais 5 transições por OS em vez de 4) e o banco tem os dois tenants. A causa não foi investigada.
- **A gravação da métrica** levou de 6,7 a 8,3 s para 20 mil linhas, cerca de 4 vezes a de 10 mil linhas no cenário base. O custo não é linear, e também fica para a proposta de otimização.
- **Os limites do `hk_worker`** ainda ficam longe: a gravação é em lotes de 500, a consulta mais lenta foi a leitura dos chamados (abaixo de 9 s, contra 30 s de `statement_timeout`), e o maior intervalo entre consultas foi o cálculo (1,9 s, contra 15 s de `idle_in_transaction_session_timeout`).
- **Memória:** o heap usado numa rodada fica entre 400 e 490 MB, e o RSS do processo em cerca de 650 MB.

A ressalva de "O que esta medição não mostra" vale aqui também: a medida que vale é no staging.

## Como repetir

```bash
# Postgres 16 descartável (exemplo no contêiner; NUNCA o dev)
initdb -D /tmp/hk-carga/dados -U postgres --auth=trust
pg_ctl -D /tmp/hk-carga/dados -o '-p 55432 -c listen_addresses=127.0.0.1' start
# calço do Supabase (papéis anon, authenticated e service_role; auth.users; storage.*), depois as migrações em ordem
psql -h 127.0.0.1 -p 55432 -U postgres -v tenant=0199b000-0000-7000-8000-000000000040 \
  -v hoteis=40 -v ativos_por_hotel=250 -v chamados_por_dia=5 \
  -v agora='2026-10-13 06:00:00+00' -f scripts/carga/inteligencia-sintetico.sql
# volume comum: -v ativos_por_hotel=500 -v chamados_por_dia=4.9315 -v meses=24 \
#   -v pausa=0.25 -v reabertura=0.25 -v uh_indisponivel=0.10 -v paradas=0.05
psql -h 127.0.0.1 -p 55432 -U postgres -c "alter role hk_worker login password 'carga'"
cd apps/web && HK_CARGA_URL_WORKER='postgresql://hk_worker:carga@127.0.0.1:55432/postgres' \
  HK_CARGA_TENANT=0199b000-0000-7000-8000-000000000040 HK_CARGA_DIAS=5 \
  npx vitest run test/carga-inteligencia.test.ts --reporter=verbose
```
