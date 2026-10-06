# Rascunho da app.insight (local, sem PR)

- `AAAAMMDDHHMMSS_insight.sql`: a migração. Vai para `supabase/migrations` com `supabase migration new insight` só depois das migrações da etapa I da 1b e com a fila de zona protegida livre, num branch `int-*` novo.
- `0NN_isolamento_insight.test.sql`: o pgTAP, com os seis casos mínimos e 50 testes, um deles com 80 hotéis. **Ainda não rodou:** sem Docker local, ele só roda na CI do PR. No `HubKeep-dev` só depois do `db push`, que é do Cesar.

## O que entra no mesmo PR

- O nome `app.insight` na lista fechada do meta-teste 28 (`001_meta_seguranca.test.sql`).
- O teste de paridade dos sete estados com `ESTADOS_DO_INSIGHT` e dos dois motivos de descarte. Ele mora no `packages/db/test/paridade-estados.test.ts`, que hoje cobre o chamado e a OS.
- Os tipos gerados (`pnpm db:types`) e o repositório do insight.
- No `docs/03`:
  - as quatro regras do insight aprovadas em 05/10/2026;
  - as três do cálculo do dia (#101), que aguardam o Cesar;
  - a regra da família e da chave (abaixo).
- O caso no kit de teste, se o Cesar pedir.

## Decisões de 06/10/2026 (aprovado por Kaio, aguardando Cesar)

### 1. Hotel novo num insight de rede: opção (c)

- O job abre o insight novo, ligado ao anterior pelo `anterior_id`.
- O anterior continua aberto até uma pessoa resolver ou descartar.
- O job não muda estado (ADR-033), e `hotel_ids` continua sem UPDATE (ADR-011, meta-teste 18).
- Na tela e na API, o anterior aparece como "substituído pelo insight X", calculado pelo vínculo. Não há estado novo.

### 2. Família e chave

- **`familia`:** o tipo, a regra e o escopo sem os hotéis. Por exemplo, `sistemico|falha=ruido|modelo=acme x1|regra=mesmo_modelo`.
- **`chave`:** a família mais o SHA-256 (hex) do conjunto de hotéis em ordem canônica, ou seja, os UUIDs em texto, em ordem, separados por vírgula. Por exemplo, `…|regra=mesmo_modelo|hoteis=3f2a…`.
  - **Por que o hash, e não a lista:** o índice btree não aceita entrada acima de cerca de 2,7 KB. A lista de UUIDs estoura com uns 70 hotéis (o pgTAP confere com 80).
  - `hotel_ids` guarda a lista completa, e é por ela que a RLS decide quem lê.
- **Unicidade:** continua um insight aberto por `chave` (`insight_um_aberto_por_chave`). Como o conjunto novo tem outro hash, o novo e o anterior da mesma família ficam abertos juntos.
- **No banco:**
  - `familia` com índice em `(tenant_id, familia, encerrado_em desc)`;
  - checks de que a chave começa pela família, de que a família tem até 520 caracteres e de que a chave tem até 600. Com até 4 bytes por caractere, nenhuma entrada de índice estoura.
- **No domínio:** o hash é calculado em `packages/inteligencia`, que é puro. Não pode usar módulo do Node nem pacote externo, e o `crypto.subtle` da Web Crypto é assíncrono.
  - Proposta: um SHA-256 em TypeScript puro, pequeno, testado contra os vetores do NIST e contra o `sha256()` do Postgres, que o pgTAP já usa.
  - Fica para o PR do código.

### 3. A regra pela família no `decidirDeteccao`

Para cada detecção (família, chave, conjunto de hotéis, faixa):
1. **Insight aberto com a mesma chave:** atualiza a última detecção, o score e a faixa, como hoje.
2. **Senão, insight aberto da mesma família:**
   - se o conjunto novo está contido no conjunto de algum aberto da família (saiu hotel, ou nada mudou), não há nada a fazer;
   - se o conjunto novo tem hotel a mais, o job abre um insight novo, ligado ao aberto mais recente da família. O anterior fica aberto até uma pessoa decidir.
3. **Senão, nenhum aberto na família:**
   - **silêncio de 30 dias pela família:** se o último encerramento da família foi um descarte com motivo "não relevante", há menos de 30 dias, e a faixa não subiu, o job ignora;
   - o descarte com motivo "substituído" não gera silêncio;
   - nos outros casos, abre ligado ao último encerrado da família. O resolvido não silencia, como já aprovado.

### 4. Motivo do descarte

- A coluna `motivo_descarte` vale `nao_relevante` ou `substituido`. É o formato canônico do domínio, com paridade, e só existe no descartado (checks).
- A pessoa escolhe o motivo ao descartar, junto com a nota, que continua obrigatória.
- O "substituído" é o caminho para encerrar o anterior quando já existe o novo.

## Decisões anteriores de 06/10/2026

- **Retenção da métrica diária:** opção B, janela de leitura de 180 dias, configurável por política, nada apagado (`rascunhos/metrica/LEIAME.md` e #113).
  - A janela precisa ser pelo menos o dobro da janela da efetividade, conferido ao gravar e na leitura pelo job (#113).
- **O resultado gravado de cada dia é a fonte de verdade do histórico.** Ele guarda a configuração usada.
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
