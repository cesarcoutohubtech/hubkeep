# Propostas de ADR do HubKeep Intelligence

**Situação:** proposta, de 01/10/2026. Nenhuma está aprovada. Pela decisão de 30/09/2026, os ADRs do Intelligence só valem com a aprovação escrita de Cesar e Kaio. Depois de aprovadas, elas vão para o `docs/03-decisoes-tecnicas.md` com o número seguinte, num PR de zona protegida mergeado pelo Cesar. Até lá, os nomes ficam como ADR-INT-1 a ADR-INT-5.

**Base:** `docs/referencia/prd-hubkeep-intelligence-v1.md`, que o agente do núcleo publica, e as regras do `CLAUDE.md`. O motor das propostas 2 e 5 já existe em `packages/inteligencia` (branch `int-motor`), sem migração e sem tela.

## ADR-INT-1 — Sinal e insight, com o ciclo de vida do insight no domínio

**Contexto:** o PRD (seções 21 e 22) propõe `intelligence_signal` e `intelligence_insight`, com status em inglês e um pipeline sinal → métrica → regra → insight.

**Proposta:**
- **Insight** (`app.insight`, depois do relatório de lacunas): tenant, hotel (opcional para os insights de rede), escopo (`ativo`, `local`, `andar`, `categoria`, `modelo`, `hotel`), tipo (`reincidencia`, `atencao_ativo`, `sistemico_mesmo_modelo`…), severidade (a faixa do score), score e versão, detalhamento e evidência em `jsonb`, primeira e última detecção, responsável, encerramento e nota.
- **Estados canônicos no domínio**, como no ADR-027: `novo`, `em_revisao`, `aceito`, `em_acao`, `monitorando`, `resolvido`, `descartado`. As transições permitidas, e quem pode fazer cada uma, ficam em `packages/inteligencia` e em `packages/aplicacao`. O banco guarda só o formato do estado, sem check de transição e sem trigger.
- **O score sugere e a pessoa decide.** O motor diz que o score passou do limite (`sugereInsight`). Quem abre o insight é o job da proposta 4, e só uma pessoa aceita, descarta ou resolve. A mesma regra de detecção no mesmo escopo atualiza o insight aberto (a última detecção e a evidência) e não abre um segundo.
- **Sinal:** o PRD propõe uma tabela que copia o chamado, a OS, a parada e a reabertura. A proposta é **não copiar** no 1.0: o motor lê o núcleo pelas portas (`Corretiva`, `AtivoAnalisado`, `LocalAnalisado` em `historico.ts`). A tabela de sinais só nasce na 1.5, para o que não existe no núcleo: o feedback do hóspede, com os três estados de associação (não associada, possível e confirmada).
- **Tudo auditado** pela unit of work: insight criado, atualizado, descartado e com o estado mudado (PRD, seção 31).

**A decidir:** se a evidência guarda os ids (como no motor) ou uma cópia do que a tela mostra. Com os ids, a RLS da tabela de origem decide o que quem pede vê, como no histórico da D1.

## ADR-INT-2 — Scores determinísticos, versionados e explicáveis, calculados na aplicação

**Contexto:** o PRD (seções 28 e 29) sugere `metric_definition` com "formula" e views materializadas. Pela regra 2 do `CLAUDE.md`, fórmula de score é regra de negócio e não fica no banco.

**Proposta:**
- **A fórmula fica no código**, em `packages/inteligencia`, em TypeScript puro e com versão por score (`VERSAO_REINCIDENCIA` e as outras). Mudou a fórmula, sobe a versão, e o resultado gravado diz com qual versão foi calculado.
- **Forma comum** (`score.ts`): valor de 0 a 100, faixa, versão, componentes (peso, peso efetivo, valor de 0 a 1, pontos e evidência), os componentes ausentes e a cópia da configuração usada, como a `politica_aplicada` do ADR-026.
- **Dado ausente não vira zero.** O componente sem fonte (custo antes da instrumentação, impacto no hóspede antes da 1.5, preventiva antes da 1b) fica marcado como ausente, e o peso dele vai para os presentes, na proporção. A tela mostra o que falta. Assim o score do 1.0 funciona sem fonte externa (PRD, princípio 5) e não fica diluído pelo que ainda não existe.
- **Explicação sem frase:** o motor devolve chaves e números. O "por que estou vendo isso?" sai do catálogo de `packages/i18n` nos quatro idiomas (regra 11).
- **Sem view materializada e sem função SQL nova.** O banco guarda o resultado (proposta 4).

## ADR-INT-3 — Pesos, limites e faixas como políticas, no modelo do ADR-026

**Proposta:**
- **Chaves de política novas**, uma por score (`inteligencia.reincidencia`, `inteligencia.atencao_ativo`, `inteligencia.efetividade`, `inteligencia.sistemico`, `inteligencia.substituicao`). Cada uma com o formato validado no domínio, como o ADR-026 manda, e com o padrão do código (`PADRAO_REINCIDENCIA` e os outros).
- **Herança grupo → bandeira → hotel**, pela tabela `app.politica` existente, sem migração nova para isso. A mudança de política é auditada, com antes e depois.
- **O resultado guarda a configuração usada.** Mudar o peso não muda o score já gravado: o dia seguinte é calculado com a nova configuração, e o histórico mostra a troca.
- **A decidir:** quem altera a política do Intelligence. A proposta é só o Admin do grupo, como nas outras políticas.

## ADR-INT-4 — Resultados diários gravados por job do worker

**Proposta:**
- **Job diário** por Vercel Cron, no modelo da arquitetura: `hk_worker`, um tenant por transação, uma unit of work com auditoria e evento.
- **Tabelas de resultado** (depois do relatório de lacunas), com nomes em português: `app.metrica_ativo_diaria` (data, tenant, hotel, ativo, contagens, horas paradas, scores com versão e detalhamento) e, se a performance pedir, `app.metrica_hotel_diaria`. Cada uma com `tenant_id NOT NULL`, RLS forçada, policies por papel e os seis casos mínimos de isolamento no pgTAP.
- **Recálculo pontual** (PRD, seção 30) por handler do outbox, nunca por trigger.
- **Sem IA em request de painel.** O painel lê os resultados gravados.
- **A decidir:** quanto tempo os resultados diários ficam guardados e se há agregação mensal para a visão de rede.

## ADR-INT-5 — Fronteira do módulo: o Intelligence depende do núcleo, nunca o contrário

**Proposta:**
- **`packages/inteligencia`** é puro como o `packages/dominio`: sem IO, sem Zod, sem módulo do Node. Ele só importa `@hubkeep/dominio`, e `@hubkeep/i18n` quando precisar.
- **O núcleo nunca importa `packages/inteligencia`.** Desligar o módulo não quebra nada.
- **O Intelligence lê o núcleo pelas portas** e só escreve nas tabelas dele mesmo.
- **Módulo opcional por tenant:** a tela e o job só rodam para o tenant que tem o Intelligence contratado. A métrica de cobrança continua pendente.
- **Depende do núcleo:** hoje o `packages/inteligencia` não está entre os elementos do `eslint.config.mjs`, então nenhuma regra de fronteira vale para ele. O registro do elemento, com as dependências permitidas e a proibição do contrário, entra no PR de lint do agente do núcleo, que é zona protegida.

## O que o motor já cobre (casos da seção 37 do PRD)

| Caso | Situação | Onde |
|---|---|---|
| Recorrência: 5 OS de HVAC em 60 dias | Coberto: score 77, alta atenção, sugere insight, com detalhamento | `reincidencia.test.ts` |
| Problema sistêmico: 8 UHs do mesmo andar em 10 dias | Coberto: possível problema sistêmico, mesmo andar | `sistemico.test.ts` |
| Modelo problemático: 17 equipamentos iguais | Coberto: possível problema sistêmico, mesmo modelo, 3 hotéis | `sistemico.test.ts` |
| Repair vs Replace | Coberto como sinal (`avaliar_substituicao`), com os critérios como justificativa | `substituicao.test.ts` |
| Guest Impact ("Ar do 304 muito barulhento") | Fora: depende de IA e de feedback externo (1.5) | — |
| Compliance ("Baratas no restaurante") | Fora: depende de IA e de feedback externo (1.5) | — |

Duas regras de problema sistêmico do PRD esperam dado: a do mesmo fornecedor espera o fornecedor (fase 2 ou instrumentação), e a do feedback externo espera a 1.5.
