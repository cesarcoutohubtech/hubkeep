# Propostas de ADR do HubKeep Intelligence

**Situação:** proposta, de 01/10/2026, revista em 05/10/2026 com o relatório de lacunas e as decisões do Cesar do mesmo dia. Nenhuma está aprovada. Pela decisão de 30/09/2026, os ADRs do Intelligence só valem com a aprovação escrita de Cesar e Kaio. Depois de aprovadas, elas vão para o `docs/03-decisoes-tecnicas.md` com o número seguinte, num único PR de zona protegida mergeado pelo Cesar. Até lá, os nomes ficam como ADR-INT-1 a ADR-INT-5.

**Base:**

- `docs/referencia/prd-hubkeep-intelligence-v1.md`;
- `docs/referencia/lacunas-instrumentacao-intelligence.md` (PR-I1, com as decisões de 05/10/2026);
- as regras do `CLAUDE.md`;
- o motor em `packages/inteligencia`: #82 e a branch `int-fornecedor`, sem migração e sem tela.

A seção "Decisões para Cesar e Kaio", no fim, junta o que precisa de resposta.

## ADR-INT-1 — Sinal e insight, com o ciclo de vida do insight no domínio

**Contexto:** o PRD (seções 21 e 22) propõe `intelligence_signal` e `intelligence_insight`, com status em inglês e um pipeline sinal → métrica → regra → insight.

**Proposta:**

- **Insight** (`app.insight`, depois das migrações da instrumentação). Campos:
  - tenant e hotel (opcional para os insights de rede);
  - escopo: `ativo`, `local`, `andar`, `categoria`, `modelo`, `terceiro` ou `hotel`;
  - tipo: `reincidencia`, `atencao_ativo`, `sistemico_mesmo_modelo`, `sistemico_mesmo_fornecedor`…;
  - severidade (a faixa do score), score e versão;
  - detalhamento e evidência em `jsonb`;
  - primeira e última detecção, responsável, encerramento e nota.
- **Estados canônicos no domínio**, como no ADR-027: `novo`, `em_revisao`, `aceito`, `em_acao`, `monitorando`, `resolvido` e `descartado`.
  - As transições permitidas, e quem pode fazer cada uma, ficam em `packages/inteligencia` e em `packages/aplicacao`.
  - O banco guarda só o formato do estado, sem check de transição e sem trigger. A paridade entre os estados do domínio e os do banco tem teste, como os meta-testes da #95.
- **O score sugere e a pessoa decide.**
  - O motor diz que o score passou do limite (`sugereInsight`) e quais componentes mais pesaram (`motivosDoScore`).
  - Quem abre o insight é o job da proposta 4. Só uma pessoa aceita, descarta ou resolve.
  - A mesma regra de detecção no mesmo escopo atualiza o insight aberto (a última detecção e a evidência), sem abrir um segundo.
- **Sinal:** o PRD propõe uma tabela que copia o chamado, a OS, a parada e a reabertura.
  - A proposta é **não copiar** no 1.0: o motor lê o núcleo pelas portas (`Corretiva`, `AtivoAnalisado` e `LocalAnalisado`, em `historico.ts`).
  - A tabela de sinais só nasce na 1.5, para o que não existe no núcleo: o feedback do hóspede, com os três estados de associação (não associada, possível e confirmada).
- **Tudo auditado** pela unit of work: insight criado, atualizado, descartado e com o estado mudado (PRD, seção 31).
- **Texto pelo catálogo:** o insight guarda tipo, chaves e números, e não `title` nem `summary` (regra 11).

## ADR-INT-2 — Scores determinísticos, versionados e explicáveis, calculados na aplicação

**Contexto:** o PRD (seções 28 e 29) sugere `metric_definition` com "formula" e views materializadas. Pela regra 2 do `CLAUDE.md`, fórmula de score é regra de negócio e não fica no banco.

**Proposta:**

- **A fórmula fica no código**, em `packages/inteligencia`, em TypeScript puro e com versão por score (`VERSAO_REINCIDENCIA` e as outras).
  - Mudou a fórmula, sobe a versão, e o resultado gravado diz com qual versão foi calculado.
  - Nenhum resultado foi gravado ainda, então a versão 1 só fica congelada a partir da primeira gravação.
- **Forma comum** (`score.ts`):
  - valor de 0 a 100, faixa e versão;
  - os componentes, cada um com peso, peso efetivo, valor de 0 a 1, pontos e evidência;
  - os componentes ausentes;
  - a cópia da configuração usada, como a `politica_aplicada` do ADR-026.
- **Dado ausente não vira zero.**
  - O componente sem fonte fica marcado como ausente, e o peso dele vai para os presentes, na proporção.
  - Ficam ausentes: criticidade e custo antes da instrumentação ou quando o hotel não preenche, impacto no hóspede antes da 1.5 e preventiva antes da 1b.
  - A tela mostra o que falta. Assim o score do 1.0 funciona sem fonte externa (PRD, princípio 5) e não fica diluído pelo que ainda não existe.
- **"Por que estou vendo isso?" sem frase:**
  - `motivosDoScore` devolve os componentes que mais pesaram, com a evidência de cada um;
  - a frase sai do catálogo de `packages/i18n`, nos quatro idiomas (regra 11).
- **Sem view materializada e sem função SQL nova.** O banco guarda o resultado (proposta 4).

## ADR-INT-3 — Pesos, limites e faixas como políticas, no modelo do ADR-026

**Proposta:**

- **Uma chave de política por score:** `inteligencia.reincidencia`, `inteligencia.atencao_ativo`, `inteligencia.efetividade`, `inteligencia.sistemico` e `inteligencia.substituicao`.
  - Cada uma tem o formato validado no domínio, como o ADR-026 manda.
  - O padrão vem do código: `PADRAO_REINCIDENCIA` e os outros.
- **Herança grupo → bandeira → hotel**, pela tabela `app.politica` que já existe, sem migração nova para isso. A mudança de política é auditada, com antes e depois.
- **O resultado guarda a configuração usada.** Mudar o peso não muda o score já gravado: o dia seguinte é calculado com a configuração nova, e o histórico mostra a troca.
- **Referência do custo:** sem o custo de reposição (fase 2), o componente de custo da atenção compara a soma do custo informado em 12 meses com um limite em reais da política (`limiteCusto12m`, padrão de R$ 10.000).
- **A escala da criticidade** é a política `ativo.criticidade` do núcleo (relatório de lacunas). O motor recebe o nível e o máximo da escala, e não um número solto.

## ADR-INT-4 — Resultados diários gravados por job do worker

**Proposta:**

- **Job diário** por Vercel Cron, no modelo da arquitetura: `hk_worker`, um tenant por transação, uma unit of work com auditoria e evento.
- **Tabelas de resultado**, depois das migrações da instrumentação, com nomes em português:
  - `app.metrica_ativo_diaria`: data, tenant, hotel, ativo, contagens, horas paradas, custo informado e os scores com versão e detalhamento;
  - `app.metrica_hotel_diaria`, se a performance pedir.
  - Cada uma com `tenant_id NOT NULL`, RLS forçada, policies por papel e os seis casos mínimos de isolamento no pgTAP.
- **Recálculo pontual** (PRD, seção 30) por handler do outbox, nunca por trigger.
- **Sem IA em request de painel.** O painel lê os resultados gravados.

## ADR-INT-5 — Fronteira do módulo: o Intelligence depende do núcleo, nunca o contrário

**Proposta:**

- **`packages/inteligencia`** é puro como o `packages/dominio`: sem IO, sem pacote externo e sem módulo do Node. Ele só importa `@hubkeep/dominio`, e `@hubkeep/i18n` quando precisar.
- **O núcleo nunca importa `packages/inteligencia`.** Desligar o módulo não quebra nada.
- **O Intelligence lê o núcleo pelas portas** e só escreve nas tabelas dele mesmo.
- **Módulo opcional por tenant:** a tela e o job só rodam para o tenant que tem o Intelligence contratado. A métrica de cobrança continua pendente.
- **Já em vigor no lint (#87):** o elemento `inteligencia` está no `eslint.config.mjs`, só pode importar `dominio` e `i18n`, e o núcleo é proibido de importá-lo. O ADR registra a decisão que o lint já aplica.

## Regras de problema sistêmico (PRD, seção 15)

Todas devolvem "possível problema sistêmico", nunca confirmado. Os padrões estão em `PADRAO_SISTEMICO` e viram a política `inteligencia.sistemico`.

| Regra                | O que agrupa                                                    | Padrão                                                                                          |
| -------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Mesmo modelo         | Fabricante e modelo (sem caixa e sem espaço), com a mesma falha | 5 ativos distintos em 90 dias, em qualquer hotel                                                 |
| Mesmo andar          | Hotel, andar e a mesma falha                                    | 5 UHs distintas em 10 dias                                                                       |
| Mesma área comum     | O mesmo local de área comum e a mesma falha                     | 5 ocorrências em 30 dias, com ativo ou sem                                                       |
| Mesmo fornecedor     | O nome do terceiro da triagem (`terceiro_nome`), normalizado    | 30% ou mais de volta em pelo menos 5 OS concluídas em 180 dias; a taxa da equipe interna vai junto, como referência |
| Crescimento da falha | Hotel e a mesma falha, contra a janela anterior                 | 50% ou mais, com pelo menos 5 na janela de 30 dias                                               |

"A mesma falha" é o código de falha da instrumentação. Sem ele, vale a categoria do ativo, e a corretiva sem nenhum dos dois fica de fora.

"Volta", na regra do fornecedor, é uma corretiva nova no mesmo ativo até 30 dias depois da conclusão. Só conta a OS cuja observação já terminou, para a taxa não sair baixa só porque a conclusão é recente.

## O que o motor já cobre (casos da seção 37 do PRD)

| Caso                                                | Situação                                                                         | Onde                                |
| --------------------------------------------------- | -------------------------------------------------------------------------------- | ----------------------------------- |
| Recorrência: 5 OS de HVAC em 60 dias                | Coberto: score 77, alta atenção, sugere insight, com detalhamento                | `reincidencia.test.ts`              |
| Problema sistêmico: 8 UHs do mesmo andar em 10 dias | Coberto: possível problema sistêmico, mesmo andar                                | `sistemico.test.ts`                 |
| Modelo problemático: 17 equipamentos iguais         | Coberto: possível problema sistêmico, mesmo modelo, 3 hotéis                     | `sistemico.test.ts`                 |
| Repair vs Replace                                   | Coberto como sinal (`avaliar_substituicao`), com os critérios como justificativa | `substituicao.test.ts`              |
| Guest Impact ("Ar do 304 muito barulhento")         | Fora: depende de IA e de feedback externo (1.5)                                  | —                                   |
| Compliance ("Baratas no restaurante")               | Fora: depende de IA e de feedback externo (1.5)                                  | —                                   |

Além da seção 37, o motor cobre a mesma área comum e o mesmo fornecedor (`sistemico-area-fornecedor.test.ts`) e os campos da instrumentação (`historico.test.ts`).

## Mapa da instrumentação (quando as migrações da 1b entrarem)

| No motor (`historico.ts`)              | No banco, pelo relatório de lacunas                    |
| -------------------------------------- | ------------------------------------------------------ |
| `Corretiva.codigoFalha`                | `app.os.codigo_falha_id`                               |
| `Corretiva.executadoPor`               | `app.os.executado_por`                                 |
| `Corretiva.terceiroNome`               | `app.os.terceiro_nome`                                 |
| `Corretiva.custoInformado`             | `app.os.custo_informado`                               |
| `Criticidade`                          | `app.ativo.criticidade`, com a escala da política      |
| `LocalAnalisado.tipo`                  | `app.local.tipo`, que já existe                        |
| `Corretiva.reaberturas`                | Auditoria, ação `reabrir`, que já existe               |

Quem monta essas formas a partir das portas é a aplicação, no PR das tabelas do Intelligence.

## Decisões para Cesar e Kaio

1. **Aprovar ou ajustar os ADR-INT-1 a 5.** Só depois disso eles vão para o `docs/03`, num único PR.
2. **Evidência do insight (INT-1):** guardar os ids, como o motor faz hoje, ou uma cópia do que a tela mostra. A proposta é guardar os ids: assim a RLS da tabela de origem decide o que quem pede vê, como no histórico da D1.
3. **Quem altera as políticas do Intelligence (INT-3):** a proposta é só o Admin do grupo, como nas outras políticas.
4. **Padrões numéricos:** pesos e faixas do PRD, limites de cada score (por exemplo, 5 corretivas em 90 dias para o componente cheio) e os da tabela de regras acima. A proposta é começar com eles e ajustar com os dados do piloto.
5. **Limite do custo (INT-3):** R$ 10.000 em 12 meses como padrão do componente de custo, até haver custo de reposição.
6. **Impacto no hóspede antes da 1.5:** o chamado ganha `impacto_hospede` (sim, não ou não informado) na instrumentação. A pergunta é se a atenção por ativo usa esse indicador interno como componente já no 1.0, como a fração dos chamados do ativo com hóspede afetado, ou se espera o Guest Impact Score da 1.5. A proposta é usar o indicador interno no 1.0, com o mesmo peso, e trocar pelo score quando ele existir (versão nova).
7. **Retenção dos resultados diários (INT-4):** quanto tempo eles ficam guardados, e se há agregação mensal para a visão de rede.
