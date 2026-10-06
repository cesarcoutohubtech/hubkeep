# Rascunho da app.insight (local, sem PR)

- `AAAAMMDDHHMMSS_insight.sql`: a migração. Vai para `supabase/migrations` com `supabase migration new insight` só depois das três migrações da instrumentação e com a fila de zona protegida livre.
- `0NN_isolamento_insight.test.sql`: o pgTAP, com os seis casos mínimos e 40 testes. **Ainda não rodou:** sem Docker local, ele só roda na CI do PR. No `HubKeep-dev` só depois do `db push`, que é do Cesar.

## O que entra no mesmo PR

- O nome `app.insight` na lista fechada do meta-teste 28 (`001_meta_seguranca.test.sql`).
- O teste de paridade dos sete estados com `ESTADOS_DO_INSIGHT`. Ele mora no `packages/db/test/paridade-estados.test.ts`, que hoje cobre o chamado e a OS.
- Os tipos gerados (`pnpm db:types`) e o repositório do insight.
- No `docs/03`:
  - as quatro regras do insight aprovadas em 05/10/2026;
  - as três do cálculo do dia, aprovadas por Kaio em 06/10/2026, aguardando Cesar. Elas ficam como estão até o Cesar resolver o conflito entre o ADR-033 e o registro de 30/09/2026;
  - a decisão do hotel novo no insight de rede (abaixo).
- O caso no kit de teste, se o Cesar pedir.

## Decisões de 06/10/2026

1. **Hotel novo num insight de rede:** o job encerra o insight e abre outro, ligado pelo `anterior_id`. `hotel_ids` continua sem UPDATE (meta-teste 18 e ADR-011). No job:
   - quando a lista de hotéis da detecção difere da do insight aberto da mesma chave, o insight aberto é encerrado e outro é aberto com `anterior_id`;
   - o `decidirDeteccao` ganha esse caso no PR do caso de uso do job.
2. **Retenção da métrica diária:** opção B, janela de leitura de 60 dias, configurável por política, nada apagado (`rascunhos/metrica/LEIAME.md`).
3. **O resultado gravado de cada dia é a fonte de verdade do histórico.** Ele guarda a configuração usada.
   - **Limitação:** recalcular um dia passado usa os valores atuais da origem e não reproduz exatamente o que foi gravado.
   - **O que só tem valor atual na origem:**
     - as reaberturas (uma contagem sem data);
     - a conclusão da OS reaberta depois;
     - os campos editáveis da OS, do chamado, do ativo e do local;
     - a política vigente.
   - **Pedido ao núcleo:** a conclusão e as reaberturas com data. O `hk_worker` não ganha leitura da auditoria.

## Confirmado contra o rascunho

- **O insight guarda a própria evidência:** `detalhe` e `evidencia`, com a configuração usada e os ids de origem. Ele não depende de linha da métrica diária: não há FK nem leitura da `app.metrica_ativo_diaria`.
- **Nenhuma regra aprovada lê a métrica diária além de 60 dias:**
  - os scores, o sistêmico e a efetividade leem a origem;
  - a agregação mensal lê só o mês que fecha;
  - o custo informado de 12 meses vem da OS.

## Decisões abertas

1. **Quem lê:** o rascunho segue o pedido, "quem tem acesso ao hotel" (`hoteis_leitura`), o que inclui o técnico e o solicitante. A alternativa é restringir a leitura aos três papéis que decidem.
2. **O proprietário não lê insight** (caso 3). Se o Cesar quiser que o proprietário do hotel inteiro veja, entra `hoteis_proprietario` na policy.
3. **A evidência só cita hotéis de `hotel_ids`.** É invariante do domínio, testado em `dia.test.ts`. O banco não confere o conteúdo do jsonb, porque isso pediria uma função, e função nova só entra por ADR.
