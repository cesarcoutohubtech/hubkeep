# Rascunho da app.insight (local, sem PR)

- `AAAAMMDDHHMMSS_insight.sql`: a migração. Vai para `supabase/migrations` com `supabase migration new insight` só depois das migrações da etapa I da 1b e com a fila de zona protegida livre, num branch `int-*` novo.
- `0NN_isolamento_insight.test.sql`: o pgTAP, com os seis casos mínimos e 52 testes, um deles com 80 hotéis e outro conferindo o `sha256()` do banco com o `node:crypto`. **Ainda não rodou:** sem Docker local, ele só roda na CI do PR. No `HubKeep-dev` só depois do `db push`, que é do Cesar.

## O que entra no mesmo PR

- O nome `app.insight` na lista fechada do meta-teste 28 (`001_meta_seguranca.test.sql`).
- O teste de paridade dos sete estados com `ESTADOS_DO_INSIGHT` e dos dois motivos de descarte (`MOTIVOS_DE_DESCARTE`). Ele mora no `packages/db/test/paridade-estados.test.ts`, que hoje cobre o chamado e a OS.
- Os tipos gerados (`pnpm db:types`) e o repositório do insight.
- No `docs/03`:
  - as três regras do cálculo do dia (#101), aprovadas pelo Cesar em 07/10/2026, que entram no documento com este PR;
  - a regra da família e da chave (abaixo), com o status que o Cesar der;
  - a correção do texto do ADR-033 sobre o hotel novo (abaixo, "Pendente").
- A ligação do job no servidor do web, em `apps/web/src/servidor/modulos/inteligencia/`: as portas do `executarDiaDoTenant` sobre o `packages/db`, com o hash da chave por `node:crypto`.
- O caso no kit de teste, se o Cesar pedir.

## Decisões (Kaio em 06/10/2026; Cesar em 07/10/2026)

### 1. Hotel novo num insight de rede: opção (c)

- O job abre o insight novo, ligado ao anterior pelo `anterior_id`.
- O anterior continua aberto até uma pessoa resolver ou descartar.
- O job não muda estado (ADR-033), e `hotel_ids` continua sem UPDATE (ADR-011, meta-teste 18).
- Na tela e na API, o anterior aparece como "substituído pelo insight X", calculado pelo vínculo (`substituidoPor`, no motor). Não há estado novo.
- **Cesar, 07/10/2026:** aprovou com uma condição, o hash fora da função pura (abaixo). O Kaio aceitou em 07/10/2026.
- **Pendente:** o texto do ADR-033 no `docs/03` ainda descreve a primeira versão ("o job encerra o insight e abre outro"), que conflita com "o job nunca muda estado". A variante (c) é a decisão de Kaio posterior. O Cesar precisa confirmar que a aprovação dele vale para a (c), e o texto do ADR-033 se corrige no PR da tabela.

### 2. Família e chave, com a condição do Cesar sobre o hash

- **`familia`:** o tipo, a regra e o escopo sem os hotéis. Por exemplo, `sistemico|categoriaId=hvac|modelo=acme x1|regra=mesmo_modelo`. É montada no domínio puro (`familiaDoInsight`).
- **A função pura devolve só a lista canônica dos hotéis** (`listaCanonicaDeHoteis`): sem repetição, em ordem crescente do UUID em texto minúsculo. **Nada de SHA-256 escrito à mão.**
- **`chave`:** a `familia`, `|hoteis=` e o SHA-256 em hexadecimal minúsculo do texto `lista.join(',')` (`SEPARADOR_DE_HOTEIS`), em UTF-8. Quem grava calcula o hash:
  - **no job, com `node:crypto`,** na ligação do servidor do web. É o caminho escolhido;
  - ou no banco, com o `sha256()` embutido, sem função nova.

  O banco confere o formato (`insight_chave_com_hash`) e que a chave começa pela família.
- **Por que o hash, e não a lista:** o índice btree não aceita entrada acima de cerca de 2,7 KB. A lista de UUIDs estoura com uns 70 hotéis (o pgTAP confere com 80). `hotel_ids` guarda a lista completa, e é por ela que a RLS decide quem lê.
- **Vetor de teste:** a lista `11100000-0000-0000-0000-000000000001,11100000-0000-0000-0000-000000000002` dá `1904d0ae84e2fb04943e72cad89dcdd2503e44f848d80db79ef3e5dab9d4728b`. O pgTAP confere com `sha256()`, e o teste da ligação do servidor usa o mesmo vetor com `node:crypto`.
- **Unicidade:** continua um insight aberto por `chave` (`insight_um_aberto_por_chave`). Como o conjunto novo tem outro hash, o novo e o anterior da mesma família ficam abertos juntos.
- **No banco:**
  - `familia` com índice em `(tenant_id, familia, encerrado_em desc)`;
  - checks de que a chave começa pela família, termina no hash, de que a família tem até 520 caracteres e de que a chave tem até 600. Com até 4 bytes por caractere, nenhuma entrada de índice estoura.
- **No motor,** o `decidirDeteccao` compara conjuntos de hotéis, e não hashes, então nada do que decide depende do hash.

### 3. A regra pela família no `decidirDeteccao` (implementada)

Para cada detecção (família, lista canônica de hotéis, faixa):
1. **Insight aberto da família com o mesmo conjunto:** atualiza a última detecção, o score e a faixa.
2. **Senão, se há aberto da família:**
   - conjunto novo contido no de algum aberto (saiu hotel, ou nada mudou): nada a fazer;
   - conjunto novo com hotel a mais: abre um insight novo, ligado ao aberto mais recente. O anterior fica aberto até uma pessoa decidir.
3. **Senão, nenhum aberto na família:**
   - **silêncio de 30 dias pela família:** se o último encerramento foi um descarte "não relevante", há menos de 30 dias, e a faixa não subiu, o job ignora;
   - o descarte "substituído" não gera silêncio;
   - nos outros casos, abre ligado ao último encerrado da família. O resolvido não silencia.

### 4. Motivo do descarte (implementado)

- A coluna `motivo_descarte` vale `nao_relevante` ou `substituido`. É o formato canônico do domínio, com paridade, e só existe no descartado (checks).
- A pessoa escolhe o motivo ao descartar, junto com a nota, que continua obrigatória (`decidirNoInsight`, com o erro `motivo_de_descarte_invalido`, nos quatro catálogos).
- O "substituído" é o caminho para encerrar o anterior quando já existe o novo.

## Decisões anteriores de 06/10/2026

- **Retenção da métrica diária:** opção B, janela de leitura de 180 dias, configurável por política, nada apagado (`rascunhos/metrica/LEIAME.md` e ADR-035/036). A janela precisa ser pelo menos o dobro da janela da efetividade, conferido ao gravar e na leitura pelo job.
- **O resultado gravado de cada dia é a fonte de verdade do histórico.** Ele guarda a configuração usada, a versão da fórmula e a da política (condição do Cesar de 07/10/2026).
  - **Reproduzidas no recálculo:** a conclusão e as reaberturas, pelas transições da OS (`app.os_transicao`, I3) até aquele dia (`conclusaoEReaberturas`).
  - **Com o valor atual:** os campos editáveis da OS, do chamado, do ativo e do local, e a política vigente. Por isso o recálculo não reproduz exatamente o que foi gravado, e fica marcado como recálculo.
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
