# PR-I1 — Lacunas de instrumentação do HubKeep Intelligence

**Situação:** análise de 05/10/2026, sem código nem migração. Nada aqui está aprovado. Cada migração proposta só sai com o aval do Cesar, num PR de zona protegida do fluxo do agente do núcleo, um de cada vez (decisão de 30/09/2026: a instrumentação é do núcleo, não do agente do Intelligence).
**Base:**
- `docs/referencia/prd-hubkeep-intelligence-v1.md`, seção 32 (dados que precisam existir desde o MVP) e seções 21 a 31;
- o schema da `main` no `be08194` (migrações até a 0028, tipos em `packages/db/src/tipos-banco.ts`);
- o motor do Intelligence em `packages/inteligencia` (#82), que já espera alguns destes campos marcados como "(fase A)" em `historico.ts`.

**Para quem:** o Cesar, que decide o que entra e quando, e o agente do Kaio, que ajusta o `historico.ts` aos nomes reais depois da decisão.

## Resumo

Dos 17 campos da seção 32:
- **5 já existem:** fabricante, modelo e número de série do ativo, e o início e o fim do tempo parado (`app.parada_ativo`).
- **1 se deriva sem migração:** a reabertura. No HubKeep, reabrir é a mesma OS voltar à execução (Cesar, 29/09/2026), e a auditoria conta as reaberturas.
- **7 faltam e cabem no MVP com migração pequena:** os três códigos (falha, causa e solução), a data de compra, a garantia, a origem do trabalho e o impacto no hóspede.
- **4 faltam e são de fase 2 pelo `docs/00`:** fornecedor, custo estimado, custo real e custo estimado de substituição. A regra 10 manda parar e registrar como pendência. Trazer qualquer um deles para antes do piloto é decisão de escopo do Cesar (seção "Decisões").

Fora da seção 32, o motor pede ainda a **criticidade do ativo** (PRD, seção 13; `Criticidade` em `historico.ts`). Ela entra na proposta junto com os campos do ativo.

Tudo o que é novo é opcional no banco (coluna anulável). A obrigatoriedade, quando o cliente quiser, vira política por hotel (regra 7, ADR-026), conferida no domínio, nunca `NOT NULL` nem check no banco.

## Campo a campo (seção 32)

| Campo do PRD | Situação | Onde está, ou o que falta | Menor migração |
|---|---|---|---|
| `failure_code` | Falta | Nada no chamado nem na OS. O chamado tem só a descrição livre; a categoria é do ativo, não da falha. | Catálogo `app.codigo_manutencao` (abaixo) e `codigo_falha_id` na OS. |
| `cause_code` | Falta | Nada. | `codigo_causa_id` na OS, do mesmo catálogo. |
| `resolution_code` | Falta | Nada. A conclusão da OS não guarda o que foi feito, além das horas, do material em texto livre e das fotos. | `codigo_solucao_id` na OS, do mesmo catálogo. |
| `downtime_start` | Existe | `app.parada_ativo.inicio`, por ativo e chamado, com a OS opcional (C5). | Nenhuma. |
| `downtime_end` | Existe | `app.parada_ativo.fim`. O tempo parado total sai de `tempoParadoTotal` no domínio. | Nenhuma. |
| `reopened_from_os_id` | Deriva | Reabrir é a mesma OS (`corretiva.ts`, ação `reabrir`, com `motivo_reabertura`); não nasce outra OS para apontar a anterior. A auditoria (`acao = 'reabrir'`) dá a contagem, como o motor já espera (`Corretiva.reaberturas`). | Nenhuma. O retorno do mesmo defeito num chamado novo é reincidência, que o motor calcula por ativo e janela. |
| `supplier_id` | Falta, fase 2 | Não há fornecedor no MVP (`docs/00`: "fornecedores, custos e alçadas" na fase 2). | Fora do MVP. Se o Cesar trouxer para antes: tabela `app.fornecedor` e `fornecedor_id` na OS. |
| `estimated_cost` | Falta, fase 2 | O material é texto livre, sem quantidade nem valor (`app.os_material.descricao`). | Fora do MVP. Se vier antes: `custo_estimado numeric(12,2)` na OS, na moeda do hotel. |
| `actual_cost` | Falta, fase 2 | Idem. | Fora do MVP. Se vier antes: `custo_real numeric(12,2)` na OS. |
| `asset_manufacturer` | Existe | `app.ativo.fabricante`, texto livre. | Nenhuma. A comparação entre hotéis usa `chaveDeModelo` (sem caixa e sem espaço sobrando). Um catálogo de modelos é fase 2. |
| `asset_model` | Existe | `app.ativo.modelo`, texto livre. | Nenhuma. |
| `asset_serial_number` | Existe | `app.ativo.numero_serie`. | Nenhuma. |
| `purchase_date` | Falta | Hoje só como campo estendido da categoria (tipo `data`), que fica em `campos` (jsonb) e muda de chave conforme a categoria, o que não serve para comparar. | `data_compra date` em `app.ativo`. |
| `warranty_until` | Falta | Idem. | `garantia_ate date` em `app.ativo`. |
| `replacement_estimated_cost` | Falta, fase 2 | Custo, idem. | Fora do MVP. Se vier antes: `custo_substituicao_estimado numeric(12,2)` em `app.ativo`. |
| `work_source` | Falta | O chamado não guarda a origem. A IX2 (pós-piloto) já prevê a migração "origem do chamado". A preventiva da 1b vai gerar OS sem chamado, e a origem dela é o plano. | `origem text` em `app.chamado`, com os valores canônicos no domínio (`interno` e, depois, `integracao`), já com o formato que a IX2 vai usar. A OS preventiva se reconhece pelo plano, na 1b. |
| `guest_impact_flag` | Falta | Nada. | `impacto_hospede boolean` em `app.chamado`, anulável: `null` é "não informado", que o score trata como ausente. |

## Migrações propostas

Três migrações, cada uma num PR de zona protegida, nesta ordem. Nenhuma cria função nem trigger.

1. **Ativo** (a menor):
   - `app.ativo` ganha `data_compra date`, `garantia_ate date` e `criticidade smallint`, todas anuláveis;
   - `grant update (data_compra, garantia_ate, criticidade)` ao `hk_app`, junto das colunas que a edição já atualiza;
   - a escala da criticidade é política (`ativo.criticidade`, com o máximo e os nomes de cada nível no catálogo), validada no domínio; o banco não tem check de faixa;
   - pgTAP: as colunas novas não abrem escrita para quem não escreve no hotel (casos de UPDATE por papel no 003).
2. **Chamado:**
   - `app.chamado` ganha `origem text not null default 'interno'` e `impacto_hospede boolean`;
   - a origem não recebe GRANT de UPDATE: é gravada na abertura e não muda;
   - `grant update (impacto_hospede)` ao `hk_app`, para a triagem corrigir;
   - os valores de origem ficam no domínio, como os estados (ADR-027); um teste de paridade evita o caso do `cancelada` (achado B6 do `docs/11`).
3. **Códigos de manutenção** (a maior, com tabela nova):
   - `app.codigo_manutencao`: `id`, `tenant_id NOT NULL`, `tipo` (`falha`, `causa` ou `solucao`), `categoria_id` anulável (o código vale para uma categoria de ativo ou para todas), `nomes jsonb`, `chave_padrao` e `ativa`;
   - o mesmo modelo da situação e da prioridade (ADR-027): os códigos padrão têm nome no catálogo (`resolverNome`), e o tenant cria os próprios com nome por idioma;
   - segue o "Modelo para tabela nova" do `docs/02`: RLS forçada, policies por papel (lê quem lê o tenant; escreve o Admin do grupo), `unique (tenant_id, id)`, os seis casos mínimos de isolamento e a entrada no meta-teste;
   - `app.os` ganha `codigo_falha_id`, `codigo_causa_id` e `codigo_solucao_id`, anuláveis, com FK composta `(tenant_id, …)`, e `grant update` dessas três colunas ao `hk_app`;
   - a coerência entre o código e a categoria do ativo fica no domínio, não no banco.

Cada uma entra no kit de teste (`scripts/ops/dados-demonstracao.ts` e o roteiro do `docs/10`) no mesmo PR, como o Cesar pediu para a etapa D.

## Impacto na tela do técnico (PWA)

Tudo opcional para o técnico; a obrigatoriedade, quando houver, é política do hotel e vem na projeção da OS que o PWA já baixa.

| Tela | O que muda | Offline |
|---|---|---|
| `Os.tsx`, conclusão | Três seletores opcionais: falha, causa e solução, filtrados pela categoria do ativo. Com a política `os.codigos_na_conclusao` exigindo, o botão de concluir pede os códigos antes, como já pede a resposta da parada. | O catálogo de códigos entra na referência local (`referencia/banco.ts`), como as situações. A conclusão leva os ids na operação da fila; o servidor confere de novo e recusa com código, que volta à fila do dia com o motivo. |
| `AbrirChamado.tsx` | Uma pergunta opcional "afeta hóspede?" (sim, não, não sei). A origem é gravada pelo servidor como `interno`, sem campo na tela. | Vai na operação de abertura que já existe. |
| `Ativos.tsx`, cadastro e edição pelo celular | Data de compra, garantia e criticidade, opcionais, na parte recolhida do formulário, para não alongar o cadastro rápido da implantação (1b). | Vão na operação de cadastro e edição. |
| Parada | Nada: o registro e o encerramento já existem (C5). | — |

Os textos novos (rótulos, opções e códigos de erro) vão para os quatro catálogos (regra 11). O contrato da fila (`packages/contratos`) ganha os campos opcionais, e uma operação antiga, sem eles, continua válida.

## Conflitos do PRD com as regras do HubKeep

| Onde no PRD | O que diz | Regra | Encaminhamento |
|---|---|---|---|
| Seção 28 | Tabela `metric_definition` com `formula` | Regra 2 (sem regra de negócio no banco) | Fórmula no código, versionada (ADR-INT-2). O banco guarda o resultado e a versão. |
| Seção 29 | Views materializadas para as agregações | Regras 2 e 4 | Job diário do worker grava as tabelas de resultado (ADR-INT-4). Sem view materializada nem função nova. |
| Seção 30 | "Eventos urgentes podem disparar recálculo pontual" | Regra 3 (sem trigger) | Handler do outbox, nunca trigger (ADR-INT-4). |
| Seções 21, 29 e 32 | Tabelas, campos e status em inglês (`intelligence_insight`, `NEW`, `failure_code`) | Convenção do `CLAUDE.md` (português sem acento) e ADR-027 | Nomes em português (`app.insight`, `codigo_falha_id`); estados canônicos no domínio (ADR-INT-1). |
| Seção 21 | `title` e `summary` gravados no insight | Regra 11 (texto pelo catálogo) | O insight guarda tipo, chaves e números; a frase sai do catálogo nos quatro idiomas. |
| Seções 21 e 22 | `intelligence_signal` copia chamado, OS, parada e reabertura | Regra 6 e o desenho de portas | O motor lê o núcleo pelas portas, sem cópia (ADR-INT-1). A tabela de sinais só na 1.5, para o feedback externo. |
| Seção 31 | Entidades analíticas com `hotel_id` "quando aplicável" | Regra 1 | `tenant_id NOT NULL` em toda tabela; o insight de rede sem hotel só é lido por quem tem escopo de grupo ou bandeira, com caso no pgTAP. |
| Seções 10, 17 e 23 | Classificação de texto, resumo e agrupamento por IA | Regra 9 (sem IA no MVP) | Só na 1.5, depois do MVP, e com o provedor decidido. |
| Seções 14, 18 e 32 | Custo, fornecedor, Repair vs Replace e Portfolio | Regra 10 (escopo fechado; fase 2 no `docs/00`) | Pendência, salvo decisão do Cesar (abaixo). O motor já trata custo como componente ausente. |
| Seção 25 | Alerta por WhatsApp | Regra 10 (WhatsApp é fase 2) | Fica para a fase 2; in-app, e-mail e push usam o que já existe. |
| Seção 26 | `POST /api/v1/intelligence/feedback-signals`, com CSV, API e webhook genéricos | Convenção de nomes e base comum das integrações (IX1 a IX3) | Rota em português, na 1.5, sobre a mesma credencial por tenant e a mesma entrega assinada das IX1 a IX3, sem um segundo mecanismo. |
| Seção 27 | Adaptadores de PMS (TOTVS, Oracle) para ocupação e UH | Regra 8 (TOTVS só leitura) | Compatível, desde que só leitura e sem PII além do necessário; ocupação é fase 2 (`docs/00`, contexto da UH). |
| Seção 10 | Texto do hóspede, `room_hint` | LGPD e ADR-025 (dados no aparelho) | Na 1.5: minimizar, não levar ao PWA, prazo de retenção definido antes. |

## Decisões do Cesar

1. **Custo e fornecedor antes do piloto?** O PRD pede para modelar desde cedo; o `docs/00` deixa na fase 2.
   - **Recomendação:** não trazer agora. Coluna de custo sem a tela de custo nem a moeda tratada vira campo vazio, e o motor já funciona com o componente ausente. Registrar como pendência da fase 2.
2. **Ordem das migrações** e se entram antes da 1b ou dentro dela.
   - **Recomendação:** as três dentro da 1b, na ordem acima. A 3 junto da conclusão da OS que a preventiva também usa, para o técnico ver uma tela só.
3. **Quem cadastra os códigos:** a proposta é o Admin do grupo, com códigos padrão por categoria vindos do catálogo.
4. **Obrigatoriedade dos códigos na conclusão:** política por hotel, desligada por padrão.

Com a decisão, o agente do Kaio troca os campos "(fase A)" de `packages/inteligencia/src/historico.ts` pelos nomes reais (`codigoFalha` → `codigo_falha_id`; `Criticidade` → `app.ativo.criticidade` com a escala da política).
