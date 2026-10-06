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

1. **Hotel novo num insight de rede: opção (c).** Aprovado por Kaio, aguardando Cesar. Substitui a primeira versão, em que o job encerrava o insight, porque ela conflitava com o ADR-033.
   - O job abre o insight novo, ligado ao anterior pelo `anterior_id`.
   - O anterior continua aberto até uma pessoa resolver ou descartar.
   - O job não muda estado (ADR-033), e `hotel_ids` continua sem UPDATE (ADR-011, meta-teste 18).
   - Na tela e na API, o anterior aparece como "substituído pelo insight X", calculado pelo vínculo. O descarte aceita o motivo "substituído".
   - Não há estado novo.
   - **Implementação parada: a unicidade colide.**
     - O índice `insight_um_aberto_por_chave` é `(tenant_id, chave) where encerrado_em is null`.
     - A chave do sinal sistêmico não leva os hotéis (`sistemico|falha=…|modelo=…|regra=mesmo_modelo`). O novo e o anterior teriam a mesma chave abertos ao mesmo tempo, e o índice recusa.
     - O `decidirDeteccao` também acharia o anterior aberto pela chave e o atualizaria, em vez de abrir outro.
   - **Proposta, para o Cesar:**
     - **A `chave` passa a levar o conjunto de hotéis em ordem.** Por exemplo, `sistemico|falha=ruido|hoteis=h1+h2+h3|modelo=acme x1|regra=mesmo_modelo`. O índice de unicidade continua o mesmo, e o novo e o anterior ficam abertos juntos.
     - **Uma coluna `familia`,** a chave sem os hotéis, só para o vínculo. Quando não há insight aberto com a chave nova, mas há um aberto da mesma família com outro conjunto de hotéis, o job abre com `anterior_id` apontando para ele. Índice comum em `(tenant_id, familia)`.
     - **O silêncio de 30 dias depois do descarte** passa a valer pela chave com os hotéis. Um conjunto novo de hotéis é informação nova e não fica silenciado pelo descarte do conjunto antigo.
     - No insight de hotel, o conjunto é o próprio hotel e nada muda na prática.
     - No `decidirDeteccao`: um caso "abrir substituindo" (`anteriorId` do aberto da mesma família) e o `familia` na detecção e no insight existente.
2. **Retenção da métrica diária:** opção B, janela de leitura de 180 dias, configurável por política, nada apagado (`rascunhos/metrica/LEIAME.md` e #113).
   - Foi revista no mesmo dia, de 60 para 180 dias, para caber a efetividade de 90 dias antes e depois.
   - A janela precisa ser pelo menos o dobro da janela da efetividade (#113).
3. **O resultado gravado de cada dia é a fonte de verdade do histórico.** Ele guarda a configuração usada.
   - **Reproduzidas no recálculo:** a conclusão e as reaberturas, pelas transições da OS (`app.os_transicao`, I3) até aquele dia (`conclusaoEReaberturas`).
   - **Com o valor atual:** os campos editáveis da OS, do chamado, do ativo e do local, e a política vigente. Por isso o recálculo não reproduz exatamente o que foi gravado.
   - O `hk_worker` não lê a auditoria.

## Confirmado contra o rascunho

- **O insight guarda a própria evidência:** `detalhe` e `evidencia`, com a configuração usada e os ids de origem. Ele não depende de linha da métrica diária: não há FK nem leitura da `app.metrica_ativo_diaria`.
- **Nenhuma regra aprovada lê a métrica diária além de 180 dias:**
  - os scores, o sistêmico e a efetividade leem a origem;
  - a agregação mensal lê só o mês que fecha;
  - o custo informado de 12 meses vem da OS.

## Decisões abertas

1. **Quem lê:** o rascunho segue o pedido, "quem tem acesso ao hotel" (`hoteis_leitura`), o que inclui o técnico e o solicitante. A alternativa é restringir a leitura aos três papéis que decidem.
2. **O proprietário não lê insight** (caso 3). Se o Cesar quiser que o proprietário do hotel inteiro veja, entra `hoteis_proprietario` na policy.
3. **A evidência só cita hotéis de `hotel_ids`.** É invariante do domínio, testado em `dia.test.ts`. O banco não confere o conteúdo do jsonb, porque isso pediria uma função, e função nova só entra por ADR.
